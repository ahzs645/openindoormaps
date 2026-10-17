"""Saved-evidence reporting controls; these fixtures grant no route authority."""
import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("counts", Path(__file__).resolve().parents[2] /
    "scripts/indoor/summarize-pathway-audit-counts.py")
COUNTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COUNTS)


class SavedCountsTest(unittest.TestCase):
    def fixture(self, root, baseline=True, order=("a", "b", "c"), public=(("a", "b"), ("b", "a"))):
        root.mkdir()
        endpoints = [{"key": k, "validArrival": k != "c", "defaultVisitor": k != "b"} for k in order]
        write = lambda name, value: (root / name).write_text(json.dumps(value))
        write("endpoint-inventory.json", endpoints)
        profiles, matrix_files = [], []
        for mode, pairs in (("public", public), ("accessible", ())):
            bits = bytes(sum(1 << order.index(b) for a, b in pairs if a == k) for k in order)
            stored = gzip.compress(bits)
            (root / f"all-pairs-{mode}.bitset.gz").write_bytes(stored)
            rows = [{"key": k, "reachable": bits[i].bit_count()} for i, k in enumerate(order)]
            profile = dict(mode=mode, oracleChecks=3, reachable=len(pairs), rows=rows)
            if baseline:
                profile.update(allDirectedPairs=6, unreachable=6-len(pairs), defaultVisitorDirectedPairs=2,
                               defaultVisitorReachable=sum(a != "b" and b != "b" for a, b in pairs))
            else:
                profile.update(directedPairs=6, unavailable=6-len(pairs),
                               missingArrivals=["c"], isolatedWithArrival=[k for k in order
                                   if k != "c" and not rows[order.index(k)]["reachable"]])
                write(f"all-pairs-{mode}.json", profile)
            profiles.append(profile)
            matrix_files.append(dict(mode=mode, sha256=COUNTS.digest(stored), logicalBytes=3))
        if baseline:
            report = dict(places=3, profiles=profiles, matrixFiles=matrix_files,sourceRoutingDatasetSha256='a'*64)
            write("all-pairs-full-oracle-audit.json", report)
        else:
            cases = [dict(name="actual separate calculator fixture", start="a", end="b", mode="public")]
            results = [{**cases[0], "available": True, "graphAvailable": True, "errors": []}]
            write("actual-route-cases.json", {"cases": cases})
            write("actual-route-results.json", results)
            report = dict(passed=True, sourceDatasetUnchanged=True, coverage=profiles, actualRouteCalculations=1,candidateRoutingProjectionSha256='b'*64,
                actualRouteCasesFileSha256=COUNTS.digest((root / "actual-route-cases.json").read_bytes()),
                actualRouteResultsFileSha256=COUNTS.digest((root / "actual-route-results.json").read_bytes()))
            write("candidate-regression-report.json", report)
        return root

    def test_reordered_endpoint_comparison_preserves_identity_and_separates_calculator(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            a = self.fixture(root / "old")
            b = self.fixture(root / "new", False, ("c", "b", "a"))
            result = COUNTS.summarize(a, b)
            self.assertEqual(result["candidate"]["profiles"][0]["graphReachablePairs"], 2)
            self.assertEqual(result["candidate"]["actual"]["completedCases"], 1)
            self.assertEqual(result["changes"]["profiles"][0]["comparableReachablePairLosses"], 0)
            self.assertEqual(result["baseline"]["profiles"][0]["missingArrivalCount"], 1)
            self.assertEqual(result["baseline"]["profiles"][1]["declaredValidArrivalWithoutOutgoingPathCount"], 2)

    def test_diagonal_padding_row_totals_and_missing_arrival_cannot_inflate_pairs(self):
        for mutation in ("diagonal", "padding", "row", "missing", "oracle"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as t:
                p = self.fixture(Path(t) / "audit")
                report = json.loads((p / "all-pairs-full-oracle-audit.json").read_text())
                bits = bytearray(gzip.decompress((p / "all-pairs-public.bitset.gz").read_bytes()))
                if mutation == "diagonal": bits[0] |= 1
                if mutation == "padding": bits[0] |= 128
                if mutation == "missing": bits[0] |= 4
                if mutation == "row": report["profiles"][0]["rows"][0]["reachable"] = 2
                if mutation == "oracle": report["profiles"][0]["oracleChecks"] = 2
                stored = gzip.compress(bits)
                (p / "all-pairs-public.bitset.gz").write_bytes(stored)
                report["matrixFiles"][0]["sha256"] = COUNTS.digest(stored)
                (p / "all-pairs-full-oracle-audit.json").write_text(json.dumps(report))
                with self.assertRaises(ValueError): COUNTS.read_audit(p, True)

    def test_saved_calculator_failure_and_report_mismatch_refuse(self):
        for mutation in ("errors", "case", "coverage", "passed"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as t:
                p = self.fixture(Path(t) / "audit", False)
                file = p / "candidate-regression-report.json"
                report = json.loads(file.read_text())
                if mutation == "passed": report["passed"] = False
                if mutation == "coverage": report["coverage"][0]["reachable"] = 5
                if mutation in ("case", "errors"):
                    rfile = p / "actual-route-results.json"
                    rows = json.loads(rfile.read_text())
                    if mutation == "case": rows[0]["start"] = "b"
                    else: rows[0]["errors"] = ["forbidden-connector"]
                    rfile.write_text(json.dumps(rows))
                    report["actualRouteResultsFileSha256"] = COUNTS.digest(rfile.read_bytes())
                file.write_text(json.dumps(report))
                with self.assertRaises(ValueError): COUNTS.read_audit(p)

    def test_historical_connector_cases_are_separate_and_must_use_intended_edge(self):
        with tempfile.TemporaryDirectory() as t:
            p = self.fixture(Path(t) / "audit")
            file = p / "connector-navigation-proof.json"
            proof = dict(completed=1,total=1,failures=[],unresolved=[],rows=[dict(
                mode="public",available=True,graphAvailable=True,intendedConnectorUsed=True,problems=[])])
            file.write_text(json.dumps(proof))
            parsed = COUNTS.read_audit(p,True)
            self.assertEqual(parsed["profiles"][0]["graphReachablePairs"],2)
            self.assertEqual(parsed["actual"]["completedCases"],1)
            proof["rows"][0]["intendedConnectorUsed"] = False
            file.write_text(json.dumps(proof))
            with self.assertRaises(ValueError): COUNTS.read_audit(p,True)


if __name__ == "__main__":
    unittest.main()
