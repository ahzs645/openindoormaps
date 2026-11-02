"""Approach-topology comparison of two same-input shared-guide candidates.

Usage: python3 -I approach-topology-summary.py BASE_DIR NEW_DIR OUT.json

Reads prepared-routing.json and report.json from each candidate directory.
Descriptive only: no route or navigation acceptance is asserted.

- networkConflicts: generator networks whose per-route statistic
  approachTopologyConflicts (used shared lanes and approaches, exact
  inspection in the compiler) is non-empty, and the guides of those cells
  whose source terminal or destination terminal has a listed approach.
- guideSelfContacts: emitted guides whose own polyline crosses or touches
  itself between non-adjacent segments (an exact rational test on the
  emitted coordinates): the drawn loop of the reviewed defect.
- changedGuides: matched guides whose emitted coordinates or hallway joins
  differ.
"""
import json
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path


def read(directory):
    directory = Path(directory)
    prepared = json.loads((directory / "prepared-routing.json").read_text())
    report = json.loads((directory / "report.json").read_text())
    return prepared, report, {guide["edgeId"]: guide for guide in prepared["guides"]}


def terminal_ids(edge_id):
    body = edge_id.split(":walk:", 1)[-1]
    return body.split("|", 1) if "|" in body else [None, None]


def orient(a, b, c):
    value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return (value > 0) - (value < 0)


def self_contacts(points):
    path = []
    for point in points:
        xy = (Fraction(point[0]), Fraction(point[1]))
        if not path or path[-1] != xy:
            path.append(xy)
    segments = list(zip(path, path[1:]))
    found = []
    for i, (a, b) in enumerate(segments):
        ax0, ax1 = sorted((a[0], b[0]))
        ay0, ay1 = sorted((a[1], b[1]))
        for j in range(i + 2, len(segments)):
            c, d = segments[j]
            if max(c[0], d[0]) < ax0 or min(c[0], d[0]) > ax1:
                continue
            if max(c[1], d[1]) < ay0 or min(c[1], d[1]) > ay1:
                continue
            p, q = orient(a, b, c), orient(a, b, d)
            r, s = orient(c, d, a), orient(c, d, b)
            if p * q > 0 or r * s > 0:
                continue
            if p == q == r == s == 0:
                # Collinear: contact only if the projections overlap.
                axis = 0 if a[0] != b[0] else 1
                lo1, hi1 = sorted((a[axis], b[axis]))
                lo2, hi2 = sorted((c[axis], d[axis]))
                if hi1 < lo2 or hi2 < lo1:
                    continue
            found.append([i, j])
    return found


def network_conflicts(report, guides):
    networks = []
    guide_ids = set()
    for cell in report["cells"]:
        listed = set()
        for index, network in enumerate(cell.get("networks", [])):
            conflicts = network.get("approachTopologyConflicts") or []
            if conflicts:
                networks.append({"cellId": cell["cellId"], "network": index, "conflicts": conflicts})
                listed.update(item[len("approach:"):] for item in conflicts if item.startswith("approach:"))
        if listed:
            for edge_id in cell["guideIds"]:
                if edge_id in guides and set(terminal_ids(edge_id)) & listed:
                    guide_ids.add(edge_id)
    return networks, sorted(guide_ids)


def main():
    base_dir, new_dir, destination = sys.argv[1:]
    base_prepared, base_report, base = read(base_dir)
    new_prepared, new_report, new = read(new_dir)
    for field in ("sourceModelSha256", "sourceGeometryKey"):
        if base_prepared[field] != new_prepared[field]:
            raise ValueError(f"Candidates do not share {field}")
    result = {"status": "descriptive-approach-topology-comparison-only", "navigationAcceptance": False}
    for label, report, guides in (("baseline", base_report, base), ("candidate", new_report, new)):
        networks, guide_ids = network_conflicts(report, guides)
        contacts = {edge_id: self_contacts(guide["pointsFeet"]) for edge_id, guide in guides.items()}
        contacts = {edge_id: pairs for edge_id, pairs in contacts.items() if pairs}
        topology = Counter()
        restricted = 0
        axis = Counter()
        for cell in report["cells"]:
            for network in cell.get("networks", []):
                summary = network.get("approachTopology")
                if summary:
                    topology[summary["result"]] += 1
                    topology["withInitialConflicts"] += bool(summary["initialConflicts"])
                    restricted += len(summary["restrictedTerminals"])
                repair = network.get("axisApproachRepair")
                if repair:
                    axis["networksWithGreedyConflicts"] += repair["conflicts"] > 0
                    axis["changedTerminals"] += repair["changedTerminals"]
        result[label] = {
            "acceptedGuides": len(guides),
            "networks": sum(len(cell.get("networks", [])) for cell in report["cells"]),
            "networksWithApproachTopologyConflicts": len(networks),
            "networksWithApproachConflictEntries": sum(
                any(item.startswith("approach:") for item in n["conflicts"]) for n in networks
            ),
            "guidesAtConflictingApproaches": len(guide_ids),
            "guidesWithSelfContacts": len(contacts),
            "legacyApproachFallbackGuides": sum(
                len(cell.get("legacyApproachFallbackEdgeIds") or []) for cell in report["cells"]
            ),
            "approachTopologyResults": dict(topology) if topology else None,
            "restrictedTerminals": restricted if topology else None,
            "axisApproachRepair": dict(axis) if topology else None,
            "conflictNetworks": networks,
            "conflictGuideIds": guide_ids,
            "selfContactGuides": {edge_id: contacts[edge_id] for edge_id in sorted(contacts)},
        }
    common = sorted(base.keys() & new.keys())
    changed = [
        edge_id
        for edge_id in common
        if base[edge_id]["pointsFeet"] != new[edge_id]["pointsFeet"]
        or base[edge_id].get("hallwayJoins") != new[edge_id].get("hallwayJoins")
    ]
    cell_of = {g: cell["cellId"] for cell in new_report["cells"] for g in cell["guideIds"]}
    result["matchedGuides"] = len(common)
    result["lostGuideIds"] = sorted(base.keys() - new.keys())
    result["gainedGuideIds"] = sorted(new.keys() - base.keys())
    result["changedGuides"] = len(changed)
    result["changedGuidesByCell"] = dict(sorted(Counter(cell_of.get(g, "?") for g in changed).items()))
    result["changedGuideIds"] = changed
    Path(destination).write_text(json.dumps(result, indent=2) + "\n")
    summary = {
        label: {k: v for k, v in result[label].items() if not isinstance(v, (list, dict)) or k in ("approachTopologyResults", "axisApproachRepair")}
        for label in ("baseline", "candidate")
    }
    print(json.dumps({**summary, "matchedGuides": len(common), "lost": len(result["lostGuideIds"]), "gained": len(result["gainedGuideIds"]), "changedGuides": len(changed)}, indent=1))


if __name__ == "__main__":
    main()
