"""Summarize local reference networks and recorded HAR route responses.

No requests are replayed. Credentials, request headers and query strings are
never copied to the report. This is an inventory, not a geometry approval.
Usage: python3 scripts/indoor/audit-reference-networks.py output.json [capture.har]
"""
import base64
import collections
import hashlib
import json
import pathlib
import sys
import urllib.parse


def summarize_network(path):
    raw = path.read_bytes()
    data = json.loads(raw)
    lines = [f for f in data["features"] if f["geometry"]["type"] == "LineString"]
    geometry = set()
    for feature in lines:
        props = feature["properties"]
        points = feature["geometry"]["coordinates"]
        if props.get("direction", "both") == "both":
            points = min(points, points[::-1])
        geometry.add(json.dumps([props, points], sort_keys=True, separators=(",", ":")))
    return {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "features": len(data["features"]),
        "kinds": dict(collections.Counter(
            f["properties"].get("network_type", "unspecified") for f in data["features"])),
        "lineFeatures": len(lines),
        "lineCoordinateUses": sum(len(f["geometry"]["coordinates"]) for f in lines),
        "uniqueLinesWithIdenticalProperties": len(geometry),
        "inferredCorridorLines": sum(f["properties"].get("network_type") == "corridor"
                                      and f["properties"].get("inferred") is True for f in lines),
    }


def main():
    if len(sys.argv) not in [2, 3]:
        raise SystemExit(__doc__)
    root = pathlib.Path(__file__).resolve().parents[2]
    report = {"status": "reference-inventory-only", "networks": {
        name: summarize_network(root / "app/data" / name / "indoor-routes.geojson")
        for name in ["bc-hospital", "harrods"]}, "recordedRoutes": [],
        "omittedRouteResponses": []}
    if len(sys.argv) == 3:
        raw = pathlib.Path(sys.argv[2]).read_bytes()
        report["harSha256"] = hashlib.sha256(raw).hexdigest()
        for index, entry in enumerate(json.loads(raw)["log"]["entries"]):
            if not urllib.parse.urlparse(entry["request"]["url"]).path.endswith("/route"):
                continue
            content = entry["response"]["content"]
            text = content.get("text", "")
            if not text:
                report["omittedRouteResponses"].append({
                    "harEntryIndex": index, "status": entry["response"]["status"],
                    "reason": "no-recorded-response-body"})
                continue
            if content.get("encoding") == "base64":
                text = base64.b64decode(text)
            data = json.loads(text)
            if not isinstance(data.get("nodes"), dict):
                continue
            report["recordedRoutes"].append({
                "harEntryIndex": index,
                "distanceMetres": data.get("distanceMeters"),
                "nodeFeatures": len(data["nodes"].get("features", [])),
                "directionFeatures": len(data.get("directions", {}).get("features", [])),
            })
    destination = pathlib.Path(sys.argv[1])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
