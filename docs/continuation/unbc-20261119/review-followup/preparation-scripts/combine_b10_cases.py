"""Combine preserved 28-case and supplemental 68-case expectations for one import."""
from collections import Counter
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "pr4-work/input"
SUPPLEMENT = INPUT / "b10-cell918-changed-guides"
OUT = INPUT / "b10-cell918-combined-96"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text())


def write(name, value):
    p = OUT / name
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    return sha(p)


OUT.mkdir(exist_ok=False)
source_files = [
    INPUT / "b10-cell918-cases.json", INPUT / "b10-cell918-inventory.json",
    INPUT / "b10-cell918-case-provenance.json", SUPPLEMENT / "cases.json",
    SUPPLEMENT / "inventory.json", SUPPLEMENT / "provenance.json",
    SUPPLEMENT / "changed-guide-coverage.json",
]
identities = {str(p.relative_to(ROOT)): sha(p) for p in source_files}
original, supplement = load(source_files[0]), load(source_files[3])
original_inventory, supplement_inventory = load(source_files[1]), load(source_files[4])
assert original_inventory["source"] == supplement_inventory["source"]
assert original_inventory["casesSha256"] == sha(source_files[0])
assert supplement_inventory["casesSha256"] == sha(source_files[3])
cases = original + supplement
assert len(cases) == len({c["id"] for c in cases}) == 96
assert len({(c["from"], c["to"], c["mode"], json.dumps(c["options"], sort_keys=True)) for c in cases}) == 96
counts = Counter((c["mode"], c["expected"]) for c in cases)
assert counts == Counter({("public", True): 48, ("accessible", False): 48})
cases_sha = write("cases.json", cases)
connections = original_inventory["connections"] + supplement_inventory["connections"]
assert len(connections) == len({c["id"] for c in connections}) == 24
inventory_sha = write("inventory.json", {
    "format": "connection-acceptance-inventory-v1", "source": original_inventory["source"],
    "casesSha256": cases_sha, "inventoryComplete": True,
    "scope": "ONLY the union of the preserved 28-case hallway-station sample and 68 exact archived stable-key requests traversing changed cell-918 guides: 24 pairs, 96 requests, 48 expected public routes and 48 recorded accessible refusals. Complete means this enumerated regression sample only. Only two of seven freshly changed guides have archived traversal; five require new evidence. Zero of these combined requests has completed current normal/worker verification. Not complete cell, Building 10, campus, accessible-route or release qualification.",
    "connections": connections,
})
coverage = load(source_files[6])
required = {e for c in cases for e in c.get("requiredSourceEdgeIds", [])}
changed = {row["edgeId"] for row in coverage["matrix"]}
assert len(required & changed) == 2
provenance_sha = write("provenance.json", {
    "format": "unbc-combined-archived-case-selection-v1",
    "status": "verification-inputs-only-not-current-results", "navigationAuthority": False,
    "currentExecutedRequests": 0, "source": original_inventory["source"],
    "casesSha256": cases_sha, "inventorySha256": inventory_sha,
    "generatorSha256": sha(Path(__file__)), "unchangedSourceFiles": identities,
    "composition": [
        {"caseRangeZeroBased": [0, 27], "cases": str(source_files[0].relative_to(ROOT)), "provenance": str(source_files[2].relative_to(ROOT)), "requests": 28, "pairs": 7},
        {"caseRangeZeroBased": [28, 95], "cases": str(source_files[3].relative_to(ROOT)), "provenance": str(source_files[5].relative_to(ROOT)), "requests": 68, "pairs": 17},
    ],
    "coverage": {"pairs": 24, "requests": 96, "expectedPublicRoutes": 48, "expectedAccessibleRefusals": 48, "uniqueDestinations": len({c[k] for c in cases for k in ("from", "to")}), "uniqueRequiredEdges": len(required), "changedGuideCount": len(changed), "changedGuidesWithArchivedTraversal": 2, "changedGuidesWithoutArchivedTraversal": 5, "currentExecutedRequests": 0},
    "uncoveredChangedGuideIds": coverage["uncoveredChangedGuideIds"],
    "expectationLimits": "Combining inputs does not execute or accept any route. Existing raw case identities, options, required edges, and historical outcome expectations are unchanged. Exact archival records remain in the two separately hashed provenance files. Five changed guides still need destination selection and fresh outcome evidence; no successful route expectations are invented for them.",
})
assert identities == {str(p.relative_to(ROOT)): sha(p) for p in source_files}
print(json.dumps({"directory": str(OUT), "requests": len(cases), "pairs": len(connections), "expectedPublicRoutes": 48, "expectedAccessibleRefusals": 48, "changedGuideCoverage": "2/7", "currentExecutedRequests": 0, "casesSha256": cases_sha, "inventorySha256": inventory_sha, "provenanceSha256": provenance_sha}, indent=2))
