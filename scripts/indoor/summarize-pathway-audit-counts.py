#!/usr/bin/env python3
"""Reconcile saved audit evidence; never calculate or approve a route.

The compressed matrices are already-computed graph reachability, not individually
calculated paths. Original endpoint order, row totals and oracle counts are checked
before making a baseline/candidate comparison. No application or source import.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

PROFILES = ("public", "accessible")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_json(file):
    return json.loads(file.read_bytes())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_audit(directory, baseline=False):
    directory = Path(directory).resolve()
    endpoints = load_json(directory / "endpoint-inventory.json")
    require(isinstance(endpoints, list) and endpoints, "Missing endpoint inventory")
    keys = [entry["key"] for entry in endpoints]
    require(len(keys) == len(set(keys)), "Duplicate endpoint identity")
    require(all(type(entry["validArrival"]) is bool and type(entry["defaultVisitor"]) is bool
                for entry in endpoints), "Endpoint eligibility flags are not booleans")
    report = load_json(directory / ("all-pairs-full-oracle-audit.json" if baseline
                                   else "candidate-regression-report.json"))
    if baseline:
        require(report["places"] == len(endpoints), "Baseline destination count disagrees")
    else:
        require(report["passed"] is True and report["sourceDatasetUnchanged"] is True,
                "Candidate full source/navigation QA has not passed")
    n, width = len(endpoints), (len(endpoints) + 7) // 8
    summaries, matrices, artifacts = [], {}, {}
    for mode in PROFILES:
        profile = (next(p for p in report["profiles"] if p["mode"] == mode) if baseline
                   else load_json(directory / f"all-pairs-{mode}.json"))
        require(profile["oracleChecks"] == n, f"{mode}: not every origin was oracle checked")
        pairs = profile.get("allDirectedPairs", profile.get("directedPairs"))
        require(pairs == n * (n - 1), f"{mode}: directed nonself pair count disagrees")
        compressed = (directory / f"all-pairs-{mode}.bitset.gz").read_bytes()
        bits = gzip.decompress(compressed)
        require(len(bits) == width * n, f"{mode}: matrix shape disagrees")
        if baseline:
            binding = next(p for p in report["matrixFiles"] if p["mode"] == mode)
            require(digest(compressed) == binding["sha256"], f"{mode}: baseline matrix changed")
            require(len(bits) == binding["logicalBytes"], f"{mode}: baseline matrix size changed")
        rows = profile["rows"]
        require([r["key"] for r in rows] == keys, f"{mode}: endpoint/row order differs")
        outgoing, incoming = [], [0] * n
        for i in range(n):
            row = bits[i * width:(i + 1) * width]
            require(not row[i >> 3] & (1 << (i & 7)), f"{mode}: self-pair is set")
            if n % 8:
                require(not row[-1] >> (n % 8), f"{mode}: matrix padding is set")
            count = sum(byte.bit_count() for byte in row)
            require(count == rows[i]["reachable"], f"{mode}: per-origin count disagrees")
            require(endpoints[i]["validArrival"] or not count,
                    f"{mode}: missing arrival has outgoing reachability")
            outgoing.append(count)
            for j in range(n):
                if row[j >> 3] & (1 << (j & 7)):
                    require(endpoints[j]["validArrival"], f"{mode}: missing arrival is reachable")
                    incoming[j] += 1
        reachable = sum(outgoing)
        require(reachable == profile["reachable"], f"{mode}: matrix population disagrees")
        unavailable = profile.get("unreachable", profile.get("unavailable"))
        require(unavailable == pairs - reachable, f"{mode}: unavailable count disagrees")
        missing = [e["key"] for e in endpoints if not e["validArrival"]]
        isolated = [e["key"] for i, e in enumerate(endpoints)
                    if e["validArrival"] and not outgoing[i]]
        if not baseline:
            require(profile["missingArrivals"] == missing, f"{mode}: missing-arrival identities disagree")
            require(profile["isolatedWithArrival"] == isolated, f"{mode}: isolated identities disagree")
            summary = next(p for p in report["coverage"] if p["mode"] == mode)
            for key in ("directedPairs", "reachable", "unavailable", "oracleChecks",
                        "missingArrivals", "isolatedWithArrival"):
                require(summary[key] == profile[key], f"{mode}: final report differs from matrix evidence")
        subset = [i for i, e in enumerate(endpoints) if e["defaultVisitor"]]
        subset_reachable = sum(bool(bits[i * width + (j >> 3)] & (1 << (j & 7)))
                               for i in subset for j in subset)
        if baseline:
            require(profile["defaultVisitorDirectedPairs"] == len(subset) * (len(subset) - 1),
                    f"{mode}: default subset denominator disagrees")
            require(profile["defaultVisitorReachable"] == subset_reachable,
                    f"{mode}: default subset population disagrees")
        summaries.append(dict(mode=mode, eligibleDestinationCount=n,
                              declaredValidArrivalCount=n - len(missing), missingArrivalCount=len(missing),
                              declaredValidArrivalWithoutOutgoingPathCount=len(isolated),
                              declaredValidArrivalWithoutIncomingOrOutgoingPathCount=sum(
                                  e["validArrival"] and not outgoing[i] and not incoming[i]
                                  for i, e in enumerate(endpoints)),
                              directedNonselfPairs=pairs, graphReachablePairs=reachable,
                              graphUnavailablePairs=unavailable, everyOriginOracleChecks=n,
                              defaultVisitorDestinationCount=len(subset),
                              defaultVisitorDirectedNonselfPairs=len(subset) * (len(subset) - 1),
                              defaultVisitorGraphReachablePairs=subset_reachable,
                              missingArrivalKeys=missing, isolatedWithArrivalKeys=isolated))
        matrices[mode] = bits
        artifacts[mode] = {"compressedSha256": digest(compressed), "logicalSha256": digest(bits),
                           "logicalBytes": len(bits)}
    actual = None
    historical_connector_file = directory / "connector-navigation-proof.json"
    if baseline and historical_connector_file.exists():
        historical = load_json(historical_connector_file)
        rows = historical["rows"]
        require(historical["completed"] == historical["total"] == len(rows)
                and not historical["failures"] and not historical["unresolved"],
                "Historical connector evidence is incomplete or failed")
        require(all(r["mode"] in PROFILES and type(r["available"]) is bool
                    and r["available"] == r["graphAvailable"] and not r["problems"]
                    and (not r["available"] or r["intendedConnectorUsed"] is True)
                    for r in rows), "Historical actual connector checks disagree")
        actual = dict(completedCases=len(rows), reportSha256=digest(historical_connector_file.read_bytes()),
                      historicalEvidenceOnly=True, profiles=[dict(mode=mode,
                          cases=sum(r["mode"] == mode for r in rows),
                          returnedRoutes=sum(r["mode"] == mode and r["available"] for r in rows),
                          unavailableResults=sum(r["mode"] == mode and not r["available"] for r in rows))
                          for mode in PROFILES])
    if not baseline:
        results_file = directory / "actual-route-results.json"
        cases_file = directory / "actual-route-cases.json"
        raw = results_file.read_bytes()
        results, cases = json.loads(raw), load_json(cases_file)["cases"]
        require(digest(raw) == report["actualRouteResultsFileSha256"], "Actual route results changed")
        require(digest(cases_file.read_bytes()) == report["actualRouteCasesFileSha256"],
                "Actual route cases changed")
        require(len(results) == len(cases) == report["actualRouteCalculations"],
                "Actual calculator case totals disagree")
        require(all(all(result.get(key) == value for key, value in case.items())
                    for case, result in zip(cases, results)), "Actual calculator case identity/order differs")
        require(all(r["mode"] in PROFILES and type(r["available"]) is bool
                    and type(r["graphAvailable"]) is bool and r["available"] == r["graphAvailable"]
                    and isinstance(r["errors"], list) for r in results),
                "Actual calculator result/profile shape or graph comparison is invalid")
        actual = dict(completedCases=len(results), profiles=[])
        for mode in PROFILES:
            rows = [r for r in results if r["mode"] == mode]
            require(all(not row["errors"] for row in rows), "Actual calculator assertion failed")
            actual["profiles"].append(dict(mode=mode, cases=len(rows),
                returnedRoutes=sum(row["available"] for row in rows),
                unavailableResults=sum(not row["available"] for row in rows),
                failedAssertions=sum(bool(row["errors"]) for row in rows)))
    return dict(directory=str(directory), endpoints=endpoints, width=width, matrices=matrices,
                profiles=summaries, actual=actual, artifacts=artifacts,
                routingProjectionSha256=report["sourceRoutingDatasetSha256"] if baseline else report["candidateRoutingProjectionSha256"],
                reportSha256=digest((directory / ("all-pairs-full-oracle-audit.json" if baseline
                                                  else "candidate-regression-report.json")).read_bytes()))


def compare_saved(a, b):
    old = {e["key"]: i for i, e in enumerate(a["endpoints"])}
    new = {e["key"]: i for i, e in enumerate(b["endpoints"])}
    common = [key for key in old if key in new]
    changes = []
    for mode in PROFILES:
        losses = gains = 0
        for key in common:
            i, k = old[key], new[key]
            for other in common:
                if key == other:
                    continue
                j, l = old[other], new[other]
                before = bool(a["matrices"][mode][i * a["width"] + (j >> 3)] & (1 << (j & 7)))
                after = bool(b["matrices"][mode][k * b["width"] + (l >> 3)] & (1 << (l & 7)))
                gains += not before and after
                losses += before and not after
        removed_pair_losses = sum(
            bool(a["matrices"][mode][i * a["width"] + (j >> 3)] & (1 << (j & 7)))
            for key, i in old.items() for other, j in old.items()
            if key != other and (key not in new or other not in new))
        changes.append(dict(mode=mode, commonDestinationCount=len(common),
                            comparableNonselfPairs=len(common) * (len(common) - 1),
                            comparableReachablePairGains=gains, comparableReachablePairLosses=losses,
                            removedIdentityReachablePairLosses=removed_pair_losses,
                            allOriginalIdentityReachablePairLosses=losses + removed_pair_losses))
    return dict(addedDestinationKeys=[k for k in new if k not in old],
                removedDestinationKeys=[k for k in old if k not in new],
                recoveredArrivalKeys=[k for k in common if not a["endpoints"][old[k]]["validArrival"]
                                      and b["endpoints"][new[k]]["validArrival"]],
                withheldArrivalKeys=[k for k in common if a["endpoints"][old[k]]["validArrival"]
                                     and not b["endpoints"][new[k]]["validArrival"]], profiles=changes)


def summarize(baseline, candidate=None):
    a = read_audit(baseline, True)
    b = read_audit(candidate) if candidate else None
    public = lambda x: {k: x[k] for k in ("directory", "profiles", "actual", "artifacts", "reportSha256", "routingProjectionSha256")}
    return dict(format="unbc-saved-audit-count-reconciliation-v1", baseline=public(a),
                candidate=public(b) if b else None, changes=compare_saved(a, b) if b else None,
                limits="Reconciles saved endpoint/matrix/oracle/calculator artifacts only. No new graph search, "
                       "route calculation, physical admission, source approval, browser or memory test. "
                       "Unavailable graph pairs include valid restrictions. Missing arrivals and isolated "
                       "declared arrivals are separate; isolation is profile-specific. Same-place selections "
                       "are excluded from all pair totals and are not asserted as tested UI cases.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate")
    parser.add_argument("--out", required=True)
    options = parser.parse_args()
    result = summarize(options.baseline, options.candidate)
    target = Path(options.out)
    with target.open("x") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    print(json.dumps({"savedCountEvidenceChecked": True, "candidateCompared": bool(options.candidate),
                      "out": str(target.resolve())}))
