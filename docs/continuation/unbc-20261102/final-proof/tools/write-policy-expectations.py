#!/usr/bin/env python3
"""Write POLICY-EXPECTATIONS.json for run-explicit-policy-matrix.ts.

  write-policy-expectations.py POLICY-CASES.json PINNED-MATRIX.json.gz OUT.json

Route/refusal outcomes, refusal reasons, required-edge use and the distances
83.948 / 73.050 / 34.019 m are the intended outcomes documented in
final-candidate/README.md; 21.01 (06-366), 47.39 (06-376 with transit) and
34.356 m (06-388) are in final-candidate/browser/JOURNEYS.json. README.md does
not list every island distance, so the remaining island route distances are
pinned (rounded to 1 mm) from the committed final-candidate matrix
PINNED-MATRIX.json.gz; the outcome kind of those cases is still taken from the
README rules below and is checked against the pinned value (this script stops
if they disagree).
"""
import gzip, hashlib, json, sys

cases_path, pinned_path, out_path = sys.argv[1:4]
cases_bytes = open(cases_path, "rb").read()
cases = json.loads(cases_bytes)
pinned = {r["id"]: r for r in json.load(gzip.open(pinned_path))["rows"]}
README = "final-candidate/README.md"
JOURNEYS = "final-candidate/browser/JOURNEYS.json"
PIN = "distance pinned from final-candidate/policy/POLICY-MATRIX.json.gz; outcome from final-candidate/README.md"
TOL = 0.01
DEFAULT_ISLAND = {"06-366", "06-368", "06-370", "06-388", "06-390", "06-392", "06-397", "06-398"}
TRANSIT_ONLY_ISLAND = {"06-372", "06-374", "06-376", "06-378", "06-380", "06-382", "06-384", "06-386"}
DOCUMENTED_ISLAND = {  # (room, mode, transit) -> metres, from JOURNEYS.json
    ("06-366", "inside", False): 21.01,
    ("06-376", "inside", True): 47.39,
    ("06-388", "inside", False): 34.356,
}

def case_id(c):
    return ":".join([c["name"], c["endpointMode"], "transit" if c["allowOtherRoomTransit"] else "no-transit", c["profile"]])

def route(cid, metres, source, required=None):
    e = {"id": cid, "expect": "route", "distanceMetres": metres, "toleranceMetres": TOL}
    if required is not None:
        e["requiredEdgeUsed"] = required
    e["source"] = source
    return e

def refusal(cid, source, constraint=None, blockers=None):
    e = {"id": cid, "expect": "refusal"}
    if constraint:
        e["refusalConstraint"] = constraint
    if blockers:
        e["refusalBlockerKinds"] = blockers
    e["source"] = source
    return e

out = []
for c in cases:
    cid, mode, transit = case_id(c), c["endpointMode"], c["allowOtherRoomTransit"]
    rooms = set(c["name"].split("-to-"))
    if c["profile"] == "accessible":
        e = refusal(cid, README + ": every step-free setting is refused (links on the witness path are step-free unconfirmed)", blockers=["step-free"])
    elif rooms == {"08-264", "10-2006"}:
        if mode == "inside":
            e = route(cid, 83.948, README + ": inside arrival, 83.948 m both ways through door 1499373", True)
        elif not transit:
            e = refusal(cid, README + ": hallway arrival, no transit: refused (hallways)", constraint="hallways")
        else:
            e = route(cid, 73.050, README + ": hallway arrival with transit, 73.050 m ending at the hallway side of the door", False)
    elif rooms == {"08-267", "10-2066"}:
        e = route(cid, 34.019, README + ": 08-267 <-> 10-2066, all four walking settings 34.019 m")
    else:
        (room,) = rooms - {"06-364"}
        assert room in DEFAULT_ISLAND | TRANSIT_ONLY_ISLAND, room
        routes = transit if room in TRANSIT_ONLY_ISLAND else True
        assert not (mode == "hallway" and transit), cid
        if not routes:
            e = refusal(cid, README + ": 06-372 to 06-386 are reachable only through another room (hallways)", constraint="hallways")
        else:
            documented = DOCUMENTED_ISLAND.get((room, mode, transit))
            if documented is not None:
                e = route(cid, documented, JOURNEYS + " / " + README + ": routed island journeys use reviewed link 1780077 -> 1779222", True)
            else:
                n = pinned[cid]["normal"]
                assert n["available"], cid
                e = route(cid, round(n["distanceMetres"], 3), PIN + "; routed island journeys use reviewed link 1780077 -> 1779222", True)
    # The README rules must agree with the committed matrix on outcome kind.
    assert (e["expect"] == "route") == pinned[cid]["normal"]["available"], cid
    out.append(e)

json.dump({
    "format": "explicit-policy-expectations-v1",
    "casesSha256": hashlib.sha256(cases_bytes).hexdigest(),
    "note": "Expected outcome per case of POLICY-CASES.json; see tools/write-policy-expectations.py for the sources.",
    "toleranceMetres": TOL,
    "expectations": out,
}, open(out_path, "w"), indent=1)
open(out_path, "a").write("\n")
print(len(out), sum(e["expect"] == "route" for e in out), "routes")
