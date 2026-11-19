#!/usr/bin/env python3
"""Compare scoped compiler guides without presenting them as published routes."""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
from fractions import Fraction
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D

spec = importlib.util.spec_from_file_location("route_review", Path(__file__).with_name("render-route-review.py"))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def guides(path):
    source = review.load_json(path)
    if not isinstance(source, dict):
        raise ValueError(f"Expected source-bound diagnostic export: {path}")
    rows = source.get("guides", [])
    if not rows:
        raise ValueError(f"No guides in {path}")
    edge_rows = source.get("edges", [])
    edges = {edge["id"]: edge for edge in edge_rows}
    if not edges or len(edges) != len(edge_rows):
        raise ValueError(f"Missing or duplicate original source edges in {path}")
    ids = set()
    for row in rows:
        edge_id, points, joins = row.get("edgeId"), row.get("pointsFeet", []), row.get("hallwayJoins", [])
        if not edge_id or edge_id in ids:
            raise ValueError(f"Missing or duplicate guide edge ID in {path}: {edge_id}")
        ids.add(edge_id)
        if (len(points) < 2 or len(joins) != 2
                or any(len(p) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in p)
                       for p in points)
                or any(type(i) is not int for i in joins)
                or not 0 <= joins[0] <= joins[1] < len(points)):
            raise ValueError(f"Expected complete PreparedRouting guide: {row.get('edgeId')}")
        original = edges.get(edge_id, {}).get("pointsFeet", [])
        if len(original) < 2 or points[0] != original[0] or points[-1] != original[-1]:
            raise ValueError(f"Guide does not preserve its included original source-edge endpoints: {edge_id}")
    return source, rows, edges


def verified_provenance(args, atlas, before, after, before_edges, after_edges):
    producer = review.load_json(args.producer_receipt)
    manifest = review.load_json(args.export_manifest)
    fields = ("sourceSha256", "contextSha256", "compilerBinding",
              "cacheCompressedSha256", "cacheLogicalSha256")
    for field in fields:
        value = producer.get(field)
        if (not isinstance(value, str) or len(value) != 64
                or any(value != item.get(field) for item in (before, after, manifest))):
            raise ValueError(f"Diagnostic provenance mismatch: {field}")
    if producer["sourceSha256"] != args.dataset_sha256 or producer["sourceSha256"] != atlas["summary"]["source"]:
        raise ValueError("Diagnostic source does not match the released atlas floor context")
    for item in (producer, before, after):
        if item.get("status") != "scoped-compiler-diagnostic-only" or item.get("navigationAuthority") is not False:
            raise ValueError("Only explicitly scoped, non-navigation diagnostic exports are supported")
        if item.get("source") != producer.get("source") or not item.get("source"):
            raise ValueError("Original model provenance is missing or differs")
    if manifest.get("diagnosticReceiptSha256") != review.sha(args.producer_receipt):
        raise ValueError("Export manifest does not bind the exact producer receipt")
    files = manifest.get("files", [])
    entries = {item["file"]: item for item in files}
    if not files or len(entries) != len(files):
        raise ValueError("Missing or duplicate export manifest file records")
    cell = before.get("cell", {})
    if not cell.get("id") or cell != after.get("cell") or args.level not in cell.get("levelIds", []):
        raise ValueError("Compared exports do not share the requested original physical cell and level")
    if before_edges != after_edges:
        raise ValueError("Compared exports do not contain identical original source edges")
    for path, role in ((args.before, "control"), (args.after, args.after_role)):
        entry = entries.get(path.name, {})
        if (entry.get("sha256") != review.sha(path) or entry.get("cellId") != cell["id"]
                or entry.get("role") != role):
            raise ValueError(f"Export manifest does not bind exact {role} input: {path.name}")
    summaries = [item for item in producer.get("cells", []) if item.get("cellId") == cell["id"]]
    if len(summaries) != 1:
        raise ValueError("Producer receipt lacks a unique summary of the compared cell")
    summary = summaries[0]
    if (summary.get("originalEdges") != len(before_edges)
            or summary.get("controlGuides") != len(before["guides"])
            or summary.get(args.after_role + "Guides") != len(after["guides"])
            or type(summary.get("withdrawn")) is not bool
            or before.get("withdrawn") != summary["withdrawn"]
            or after.get("withdrawn") != summary["withdrawn"]):
        raise ValueError("Diagnostic summary disagrees with the compared guide exports")
    return producer, summary


def segments(rows):
    cores, branches, ends = {}, {}, set()
    for row in rows:
        points = row["pointsFeet"]
        first, last = row["hallwayJoins"]
        ends.update([tuple(points[0][:2]), tuple(points[-1][:2])])
        for i, (a, b) in enumerate(zip(points, points[1:])):
            if a[:2] == b[:2]:
                continue
            key = tuple(sorted((tuple(a[:2]), tuple(b[:2]))))
            target = cores if first <= i < last else branches
            target[key] = [a[:2], b[:2]]
    return list(cores.values()), list(branches.values()), list(ends)


def contact_geometry(summary, guide_ids):
    """Use producer-reported exact contact locations, converting only for plotting."""
    result = []
    for item in summary.get("newContacts", []):
        if not item.get("edgeIds") or any(edge_id not in guide_ids for edge_id in item["edgeIds"]):
            raise ValueError("Reported contact does not refer to the displayed proposal's guide records")
        ends = item.get("at", "").split(":")
        if len(ends) != 2:
            raise ValueError("Expected exact rational contact endpoints")
        points = [[float(Fraction(value)) for value in end.split(",")] for end in ends]
        if any(len(point) != 2 or not all(math.isfinite(v) for v in point) for point in points):
            raise ValueError("Invalid reported contact coordinate")
        result.append({"edgeIds": item["edgeIds"], "at": item["at"], "displayPointsFeet": points})
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--atlas", required=True, type=Path)
    p.add_argument("--before", required=True, type=Path)
    p.add_argument("--after", required=True, type=Path)
    p.add_argument("--level", required=True, type=int)
    p.add_argument("--scope", required=True)
    p.add_argument("--view", help="Optional fixed detail crop ID from the released atlas")
    p.add_argument("--dataset-sha256", required=True)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--before-label", default="Control compiler output")
    p.add_argument("--label")
    p.add_argument("--after-role", choices=("guarded", "proposed"), default="guarded")
    p.add_argument("--producer-receipt", required=True, type=Path)
    p.add_argument("--export-manifest", required=True, type=Path,
                   help="Source-bound manifest of exact guide export and producer receipt hashes")
    args = p.parse_args()
    atlas = review.atlas_data(args.atlas)
    if atlas["summary"]["source"] != args.dataset_sha256:
        raise ValueError("Scoped compiler input does not match released physical floor context")
    before_source, before, before_edges = guides(args.before)
    after_source, after, after_edges = guides(args.after)
    producer, summary = verified_provenance(args, atlas, before_source, after_source, before_edges, after_edges)
    if args.label is None:
        if args.after_role == "guarded":
            args.label = "Guarded output · proposal withdrawn" if summary["withdrawn"] else "Guarded diagnostic output"
        else:
            args.label = "Proposed guides · withdrawn" if summary["withdrawn"] else "Proposed diagnostic guides"
    before_by_id, after_by_id = [{g["edgeId"]: g for g in rows} for rows in (before, after)]
    common = set(before_by_id) & set(after_by_id)
    if not common:
        raise ValueError("No matched source edges to compare")
    changed = [key for key in common if before_by_id[key]["pointsFeet"] != after_by_id[key]["pointsFeet"]]
    endpoints_unchanged = all(before_by_id[key]["pointsFeet"][0] == after_by_id[key]["pointsFeet"][0]
                              and before_by_id[key]["pointsFeet"][-1] == after_by_id[key]["pointsFeet"][-1]
                              for key in common)
    if not endpoints_unchanged:
        raise ValueError("Compared guides moved an original terminal")
    box = review.full_box([[g["pointsFeet"] for g in rows] for rows in (before, after)])
    if args.view:
        views = [view for view in atlas.get("reviewedViews", []) if view.get("id") == args.view]
        if len(views) != 1:
            raise ValueError("Requested detail crop is not uniquely present in the released atlas")
        box = views[0]["box"]
    contacts = contact_geometry(summary, set(after_by_id)) if args.after_role == "proposed" else []
    geo = atlas["geo"][str(args.level)]
    fig, axes = plt.subplots(1, 2, figsize=(16.8, 8.2))
    fig.set_facecolor("white")
    fig.suptitle(f"{args.scope} · shared corridor guides", x=.055, y=.955, ha="left", fontsize=23,
                 fontweight="bold", color="#193b34")
    fig.text(.055, .907, f"{geo['name']}  /  Scoped compiler comparison  /  Full cell: {len(changed)} of {len(common)} matched guides changed",
             fontsize=11, color="#53665d")
    for index, (ax, rows, label, color) in enumerate(zip(axes, (before, after), (args.before_label, args.label), ("#496783", "#087e91"))):
        review.draw_context(ax, geo, box, ())
        cores, branches, ends = segments(rows)
        ax.add_collection(LineCollection(branches, colors="#9caeaa", linewidths=1.2, zorder=3))
        ax.add_collection(LineCollection(cores, colors="white", linewidths=5.5, zorder=4))
        ax.add_collection(LineCollection(cores, colors=color, linewidths=2.4, zorder=5))
        x, y = zip(*ends)
        ax.scatter(x, y, s=13, color="#bd733b", edgecolors="white", linewidths=.5, zorder=6)
        review.scale_bar(ax, box)
        if index == 1:
            for number, contact in enumerate(contacts, 1):
                a, b = contact["displayPointsFeet"]
                if a != b:
                    ax.plot([a[0], b[0]], [a[1], b[1]], color="#b04a36", linewidth=3, zorder=7)
                if box[0] <= a[0] <= box[2] and box[1] <= a[1] <= box[3]:
                    ax.scatter([a[0]], [a[1]], s=105, facecolors="none", edgecolors="#b04a36", linewidths=1.4, zorder=8)
                    offsets = [(12, -16), (-18, -16), (12, 16), (-18, 16)]
                    ax.annotate(str(number), a, xytext=offsets[(number-1) % len(offsets)], textcoords="offset points", fontsize=8,
                                color="#963f2e", zorder=9,
                                arrowprops={"arrowstyle":"-","color":"#b04a36","lw":.7},
                                bbox={"facecolor":"white","edgecolor":"none","alpha":.9,"pad":1})
        title_color = "#963f2e" if index == 1 and args.after_role == "proposed" and summary["withdrawn"] else "#263f36"
        ax.set_title(f"{label}\n{len(rows)} guide records in the full cell", loc="left", pad=15, fontsize=12, color=title_color, linespacing=1.6)
    legend = [Line2D([0], [0], color="#c6cdc9", lw=1, label="Released floor context"),
                        Line2D([0], [0], color="#087e91", lw=3, label="Shared corridor core"),
                        Line2D([0], [0], color="#9caeaa", lw=1.2, label="Terminal approaches"),
                        Line2D([0], [0], marker="o", linestyle="none", color="#bd733b", label="Original terminals")]
    if contacts:
        legend.append(Line2D([0], [0], marker="o", linestyle="none", color="#b04a36", markerfacecolor="none", label="Reported new contact"))
    fig.legend(handles=legend, loc="lower left", bbox_to_anchor=(.045, .052), ncol=len(legend), frameon=False, fontsize=9)
    fig.text(.055, .027, "Exact compiler guide coordinates; same extent in both panels. Scoped diagnostic only: no journey, runtime, browser or publication acceptance.",
             fontsize=8.5, color="#66766d")
    fig.subplots_adjust(left=.055, right=.965, top=.80, bottom=.13, wspace=.12)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, dpi=170, facecolor="white")
    plt.close(fig)
    receipt = {"kind": "scoped-corridor-compiler-figure", "rendererSha256": review.sha(Path(__file__)),
               "contextRendererSha256": review.sha(Path(__file__).with_name("render-route-review.py")),
               "scope": args.scope, "physicalLevel": args.level,
               "beforeLabel": args.before_label, "afterLabel": args.label,
               "afterRole": args.after_role, "cellId": summary["cellId"],
               "status": producer["status"], "navigationAuthority": False,
               "withdrawn": summary["withdrawn"], "limits": producer.get("limits"),
               "sourceDatasetSha256": args.dataset_sha256, "atlasSha256": review.sha(args.atlas),
               "beforeGuidesSha256": review.sha(args.before), "afterGuidesSha256": review.sha(args.after),
               "beforeGuides": len(before), "afterGuides": len(after), "changedGuides": len(changed),
               "gainedGuides": sorted(set(after_by_id)-set(before_by_id)),
               "lostGuides": sorted(set(before_by_id)-set(after_by_id)),
               "matchedOriginalEndpointsUnchanged": endpoints_unchanged,
               "allGuideEndpointsMatchIncludedSourceEdges": True, "boxFeet": box,
               "detailView": args.view, "reportedNewContactCount": summary.get("newContactCount"),
               "displayedContactGeometry": contacts,
               "imageSha256": review.sha(args.output)}
    receipt["producerReceiptSha256"] = review.sha(args.producer_receipt)
    receipt["exportManifestSha256"] = review.sha(args.export_manifest)
    args.output.with_suffix(".json").write_text(json.dumps(receipt, indent=2)+"\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
