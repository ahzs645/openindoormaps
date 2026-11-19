#!/usr/bin/env python3
"""Draw exact recorded worker paths on the released atlas floor geometry.

The figures are route evidence, not a replacement atlas or native-model proof.
They deliberately omit the atlas's old overview network, which may differ from
the candidate's graph. A changed dataset requires a separate physical-context
comparison receipt; no route vertices are fitted, simplified or rounded here.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D


CASES = [
    {"id": "building-10", "a": "10-3026", "b": "10-3060", "level": 400176,
     "detail": "b10-upper", "name": "Building 10 · upper-floor corridor"},
    {"id": "building-06-bay", "a": "06-205", "b": "06-209", "level": 694,
     "detail": "b06-bay", "name": "Building 06 · vestibule approach"},
    {"id": "stair-6-landing", "a": "06-370", "b": "06-390", "level": 1487353,
     "name": "Building 06 · flat landing beside Stair 6"},
    {"id": "buildings-04-07", "a": "04-150", "b": "07-114", "level": 311,
     "name": "Buildings 04–07 · Floor 1 passage"},
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == ".gz" else raw)


def atlas_data(path: Path):
    text = path.read_text()
    marker = "const data="
    if marker not in text:
        raise ValueError("Expected the UNBC atlas's embedded const data value")
    return json.JSONDecoder().raw_decode(text.split(marker, 1)[1])[0]


def indexed_rows(measurements, atlas):
    names = {row[6]: row[0] for row in atlas["rooms"]}
    rows = measurements.get("rows", measurements.get("trips", []))
    result = {}
    for row in rows:
        a, b = row.get("a", row.get("from")), row.get("b", row.get("to"))
        key = names.get(a, a), names.get(b, b), row["mode"]
        if key in result and result[key] != row:
            # The browser audit can contain both record keys and room aliases.
            # Prefer the actual room-number request and reject differing paths.
            old = result[key]
            if old.get("paths") != row.get("paths") or old.get("metres") != row.get("metres"):
                raise ValueError(f"Conflicting route records for {key}")
        result[key] = row
    return result


def level_parts(row, level):
    if row is None or row.get("metres") is None:
        return []
    return [path["pointsFeet"] for path in row.get("paths", [])
            if set(path.get("levelIds", [])) == {level} and len(path["pointsFeet"]) > 1]


def continuous_runs(parts):
    runs = []
    for part in parts:
        if runs and math.dist(runs[-1][-1], part[0]) < 1e-6:
            runs[-1].extend(part[1:])
        else:
            runs.append(list(part))
    return runs


def bends(parts, box=None):
    values = []
    for run in continuous_runs(parts):
        for a, b, c in zip(run, run[1:], run[2:]):
            if box and not (box[0] <= b[0] <= box[2] and box[1] <= b[1] <= box[3]):
                continue
            u = b[0] - a[0], b[1] - a[1]
            v = c[0] - b[0], c[1] - b[1]
            den = math.hypot(*u) * math.hypot(*v)
            if den > 1e-12:
                angle = math.degrees(math.acos(max(-1, min(1, sum(x*y for x, y in zip(u, v))/den))))
                values.append((angle, b[:2]))
    return values


def full_box(parts):
    points = [p for collection in parts for part in collection for p in part]
    if not points:
        raise ValueError("No returned route geometry for this floor")
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 12)
    pad = max(8, span * 0.12)
    return [min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad]


def draw_context(ax, geo, box, endpoints):
    rings = [[geo["coords"][i] for i in ring] for ring in geo["rings"]]
    rings.extend(geo.get("fallback", []))
    lines = [ring + [ring[0]] for ring in rings if ring]
    ax.add_collection(LineCollection(lines, colors="#c6cdc9", linewidths=0.75, zorder=1))
    labels = [(name, point) for name, point, _ in geo.get("labels", [])
              if box[0] <= point[0] <= box[2] and box[1] <= point[1] <= box[3]]
    for name, point in labels:
        if name in endpoints or len(labels) <= 36:
            ax.annotate(name, point, xytext=(3, 3), textcoords="offset points",
                        color="#65716d", fontsize=7.5, zorder=2, clip_on=True,
                        bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.72, "pad": 0.7})
    ax.set(xlim=(box[0], box[2]), ylim=(box[1], box[3]))
    ax.set_aspect("equal", adjustable="box")
    ax.set_facecolor("#fafcfb")
    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    for spine in ax.spines.values():
        spine.set_color("#d7dfdb")


def scale_bar(ax, box):
    # SI units are a display conversion only; paths stay in native feet.
    available_m = (box[2] - box[0]) * 0.3048 * 0.22
    metres = max((v for v in [0.5, 1, 2, 5, 10, 20, 50] if v <= available_m), default=0.5)
    length = metres / 0.3048
    x = box[0] + (box[2] - box[0]) * 0.055
    y = box[1] + (box[3] - box[1]) * 0.06
    ax.plot([x, x+length], [y, y], color="#394b44", linewidth=2.5, zorder=6)
    ax.annotate(f"{metres:g} m", (x+length/2, y), xytext=(0, 6), textcoords="offset points",
                ha="center", color="#394b44", fontsize=8, zorder=6,
                bbox={"facecolor": "white", "edgecolor": "none", "alpha": .9, "pad": 1.5})


def draw_route(ax, row, parts, box, color, show_turn):
    if row is None:
        ax.text(.5, .5, "Not measured", transform=ax.transAxes, ha="center", fontsize=16)
        return
    if row.get("metres") is None:
        ax.text(.5, .5, "No route returned", transform=ax.transAxes, ha="center", fontsize=16)
        return
    for part in parts:
        x, y = zip(*[p[:2] for p in part])
        ax.plot(x, y, color="white", linewidth=6.8, zorder=3,
                solid_capstyle="round", solid_joinstyle="round")
        ax.plot(x, y, color=color, linewidth=3.2, zorder=4,
                solid_capstyle="round", solid_joinstyle="round")
    for label, field, marker, fill in [("Start", "departure", "o", "#16677e"),
                                      ("Destination", "arrival", "s", "#b55e2e")]:
        endpoint = row.get(field) or {}
        point = endpoint.get("pointFeet")
        if point and box[0] <= point[0] <= box[2] and box[1] <= point[1] <= box[3]:
            ax.scatter([point[0]], [point[1]], s=65, marker=marker, color=fill,
                       edgecolors="white", linewidths=1.5, zorder=7)
    if show_turn:
        turns = [item for item in bends(parts, box) if item[0] >= 145]
        if turns:
            angle, point = max(turns)
            ax.scatter([point[0]], [point[1]], s=160, facecolors="none", edgecolors="#b04a36", linewidths=1.3, zorder=6)
            ax.annotate(f"{angle:.1f}° turn-back", point, xytext=(25, 30),
                        textcoords="offset points", fontsize=9, color="#963f2e",
                        arrowprops={"arrowstyle": "-", "color": "#963f2e", "lw": .9},
                        bbox={"facecolor": "white", "edgecolor": "#e3c6be", "boxstyle": "round,pad=.35"}, zorder=8)


def render_case(atlas, case, before, after, output, labels, detail=False, single_role="baseline"):
    geo = atlas["geo"][str(case["level"])]
    parts = [level_parts(row, case["level"]) for row in [before, after]]
    view = next((v for v in atlas.get("reviewedViews", []) if v["id"] == case.get("detail")), None)
    box = view["box"] if detail and view else full_box(parts)
    rows = [before] if after is None else [before, after]
    colors = ["#496783", "#087e91"]
    fig, axes = plt.subplots(1, len(rows), figsize=(8.4*len(rows), 8.0), squeeze=False)
    fig.set_facecolor("white")
    route_title = f"{case['a']} → {case['b']}"
    qualifier = " · detail crop" if detail else ""
    fig.suptitle(route_title + qualifier, x=.055, y=.955, ha="left", fontsize=23, fontweight="bold", color="#193b34")
    endpoint_modes = ((before.get("departure") or {}).get("mode"),
                      (before.get("arrival") or {}).get("mode"))
    endpoint_label = " / Hallway stations" if endpoint_modes == ("pathway", "pathway") else ""
    fig.text(.055, .907, f"{case['name']}  /  {geo['name']}  /  Ordinary Walking{endpoint_label}",
             fontsize=10.5, color="#53665d")
    metrics = []
    for index, (row, ax) in enumerate(zip(rows, axes[0])):
        draw_context(ax, geo, box, (case["a"], case["b"]))
        draw_route(ax, row, parts[index], box, colors[index], detail)
        scale_bar(ax, box)
        distance = "No route" if row.get("metres") is None else f"{row['metres']:.2f} m full journey"
        ax.set_title(f"{labels[index]}\n{distance}", loc="left", pad=15, fontsize=12, color="#263f36", linespacing=1.6)
        values = bends(parts[index], box)
        metrics.append({"label": labels[index], "metres": row.get("metres"),
                        "endpointModes": [(row.get("departure") or {}).get("mode"),
                                          (row.get("arrival") or {}).get("mode")],
                        "maximumTurnDegreesInView": max((v[0] for v in values), default=0),
                        "turnsAtLeast145DegreesInView": sum(v[0] >= 145 for v in values),
                        "pathSectionsOnLevel": len(parts[index])})
    fig.legend(handles=[Line2D([0], [0], color="#7e9188", lw=1, label="Released floor context"),
                        Line2D([0], [0], color="#087e91" if len(rows)>1 else colors[0], lw=3, label="Returned route geometry"),
                        Line2D([0], [0], marker="o", linestyle="none", color="#16677e", label="Start"),
                        Line2D([0], [0], marker="s", linestyle="none", color="#b55e2e", label="Destination")],
               loc="lower left", bbox_to_anchor=(.045, .045), ncol=4, frameon=False, fontsize=9)
    fig.text(.055, .022, "Exact worker path points. Floor context is the unchanged release atlas; shared overview lines are omitted. Step-free is assessed separately.",
             fontsize=8, color="#66766d")
    fig.subplots_adjust(left=.055, right=.965, top=.80, bottom=.12, wspace=.12)
    name = case["id"] + ("-detail" if detail else "-route") + ("-comparison" if after else f"-{single_role}") + ".png"
    fig.savefig(output/name, dpi=170, facecolor="white")
    plt.close(fig)
    return {"image": name, "origin": case["a"], "destination": case["b"],
            "physicalLevel": case["level"], "boxFeet": box, "detailCrop": detail, "measurements": metrics,
            "sha256": sha(output/name)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--atlas", type=Path, required=True)
    p.add_argument("--before", type=Path, required=True)
    p.add_argument("--after", type=Path)
    p.add_argument("--context-receipt", type=Path,
                   help="Required for changed datasets: source-bound equality receipt for physical floor context")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--before-label", default="Published baseline")
    p.add_argument("--after-label", default="PR candidate")
    p.add_argument("--candidate-singles", action="store_true",
                   help="Also render each candidate as its own larger panel")
    p.add_argument("--case", action="append", choices=[c["id"] for c in CASES])
    args = p.parse_args()
    atlas = atlas_data(args.atlas)
    before = load_json(args.before)
    after = load_json(args.after) if args.after else None
    if before.get("datasetSha256") != atlas["summary"]["source"]:
        raise ValueError("Baseline worker data and floor-context source do not match")
    context = None
    if after and before.get("datasetSha256") != after.get("datasetSha256"):
        if not args.context_receipt:
            raise ValueError("Candidate source dataset differs; provide --context-receipt for unchanged physical geometry")
        context = load_json(args.context_receipt)
        projection = context.get("physicalContext", {})
        if (context.get("baselineDatasetSha256") != before.get("datasetSha256")
                or context.get("candidateDatasetSha256") != after.get("datasetSha256")
                or not projection.get("fields")
                or not projection.get("sha256Before")
                or projection.get("sha256Before") != projection.get("sha256After")):
            raise ValueError("Physical context receipt is missing, stale or reports changed floor geometry")
    before_rows = indexed_rows(before, atlas)
    after_rows = indexed_rows(after, atlas) if after else {}
    args.output.mkdir(parents=True, exist_ok=True)
    result = {"kind": "recorded-worker-route-review", "rendererSha256": sha(Path(__file__)), "atlasSha256": sha(args.atlas),
              "baselineFileSha256": sha(args.before), "baselineRuntime": before.get("runtimeSha256"),
              "baselineDatasetSha256": before.get("datasetSha256"), "figures": []}
    if after:
        result.update(candidateFileSha256=sha(args.after), candidateRuntime=after.get("runtimeSha256"),
                      candidateDatasetSha256=after.get("datasetSha256"))
    if context:
        result.update(physicalContextReceiptSha256=sha(args.context_receipt), physicalContext=context["physicalContext"])
    for case in CASES:
        if args.case and case["id"] not in args.case:
            continue
        key = case["a"], case["b"], "public"
        if key not in before_rows or (after and key not in after_rows):
            raise ValueError(f"Missing measured request: {key}")
        for detail in [False, True] if case.get("detail") else [False]:
            result["figures"].append(render_case(atlas, case, before_rows[key], after_rows.get(key),
                                                 args.output, [args.before_label, args.after_label], detail))
            if after and args.candidate_singles:
                result["figures"].append(render_case(atlas, case, after_rows[key], None, args.output,
                                                     [args.after_label], detail, single_role="candidate"))
    (args.output/"route-figure-receipt.json").write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
