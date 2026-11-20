#!/usr/bin/env python3
"""Plot only the three exact guides in the fresh doorway-junction receipt.

Run from any directory. Inputs resolve relative to this script; the full
compiler guides are pinned by SHA256. No historical source context, wall
geometry, generated path, or recorded journey is loaded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import MultipleLocator
import numpy as np

BASE = Path(__file__).resolve().parent
EXPECTED = {
    "control": "283e947c94f516b8fa07e837c443b246d376e9be3d0f182040bfe5fdaafae2a2",
    "candidate": "4aaa4b74810178432fd31ddd88bea07f0a7e07bc6043096b80d19341b8b49d98",
}
TERMINAL = "door:400176:2262854:0"
FEET_TO_METRES = 0.3048
PRIMARY = "#BE6A21"
EXISTING = "#007A89"
THROUGH = "#99A9B3"
DARK = "#203B4A"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--control", default="../cell-918-control/prepared-routing.json")
    parser.add_argument("--candidate", default="../cell-918-retained/prepared-routing.json")
    parser.add_argument("--output-stem", default="one-doorway-one-shared-station")
    args = parser.parse_args()
    paths = {"control": (BASE / args.control).resolve(), "candidate": (BASE / args.candidate).resolve()}
    for side, path in paths.items():
        assert sha(path) == EXPECTED[side], f"Unexpected {side} prepared-guide bytes"
    datasets = {side: read(path) for side, path in paths.items()}
    guides = {side: {g["edgeId"]: g for g in data["guides"]} for side, data in datasets.items()}
    assert len(guides["control"]) == len(guides["candidate"]) == 69
    assert set(guides["control"]) == set(guides["candidate"])
    for key in ("sourceModelSha256", "sourceGeometryKey", "resolverVersion"):
        assert datasets["control"][key] == datasets["candidate"][key]
    reports = {side: read(path.parent / "report.json") for side, path in paths.items()}
    for key in ("inputJsonSha256", "inputZipSha256", "sourceModelSha256", "sourceGeometryKey", "compilerBinding"):
        assert reports["control"]["binding"][key] == reports["candidate"]["binding"][key]
    cell = reports["candidate"]["cells"][0]
    assert cell["straightRunsWithdrawn"] is False
    assert cell["straightRunsComparison"]["missingGuideIds"] == []
    assert cell["straightRunsComparison"]["newContactCount"] == 0
    receipts = [r for r in cell["recoveredDoorwayJunctions"] if r["terminalId"] == TERMINAL]
    assert len(receipts) == 1
    junction = receipts[0]
    assert len(junction["incidentGuideIds"]) == 2 and len(junction["throughGuideIds"]) == 1
    members = set(junction["incidentGuideIds"] + junction["throughGuideIds"])
    changed = [gid for gid in members if guides["control"][gid] != guides["candidate"][gid]]
    assert len(changed) == 1
    primary_id = changed[0]
    existing_id = next(gid for gid in junction["incidentGuideIds"] if gid != primary_id)
    through_id = junction["throughGuideIds"][0]
    assert primary_id in junction["incidentGuideIds"]
    original_door = np.asarray(junction["approachFeet"][0], dtype=float)
    common = np.asarray(junction["pointFeet"], dtype=float)

    def approach(guide):
        points = guide["pointsFeet"]
        first, last = guide["hallwayJoins"]
        if points[0] == original_door.tolist():
            return points[:first + 1]
        assert points[-1] == original_door.tolist()
        return points[last:][::-1]

    for gid in guides["control"]:
        before, after = guides["control"][gid], guides["candidate"][gid]
        assert before["pointsFeet"][0] == after["pointsFeet"][0]
        assert before["pointsFeet"][-1] == after["pointsFeet"][-1]
    old_end = np.asarray(approach(guides["control"][primary_id])[-1])
    old_through = np.asarray(approach(guides["control"][existing_id])[-1])
    assert old_through.tolist() == common.tolist()
    for gid in junction["incidentGuideIds"]:
        assert approach(guides["candidate"][gid]) == junction["approachFeet"]
    separation = float(np.linalg.norm(old_end - old_through) * FEET_TO_METRES)
    assert abs(separation - 0.13605062142592286) < 1e-12
    # A proper shared rotation, with the unchanged original doorway at (0,0).
    y_axis = common[:2] - original_door[:2]
    y_axis /= np.linalg.norm(y_axis)
    x_axis = np.array([y_axis[1], -y_axis[0]])
    basis = np.vstack([x_axis, y_axis])
    assert abs(np.linalg.det(basis) - 1) < 1e-12

    def local(points):
        p = np.asarray(points, dtype=float)
        return (p[..., :2] - original_door[:2]) @ basis.T * FEET_TO_METRES

    station = local(common)
    old_station = local(old_end)
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 10,
        "svg.fonttype": "none", "svg.hashsalt": "unbc-doorway-station-geometry",
        "axes.labelcolor": "#4D6271", "xtick.color": "#6B7D89", "ytick.color": "#6B7D89",
    })
    fig = plt.figure(figsize=(12, 7.4), facecolor="white")
    fig.text(0.06, 0.945, "One doorway, one shared station", fontsize=25, fontweight="bold", color=DARK)
    fig.text(0.06, 0.895, "Door 2262854:0  ·  Native cell 918  ·  Exact compiled guide geometry", fontsize=12, color="#526A79")
    for side, x, title, subtitle in [
        ("control", 0.06, "Control · two stations", f"Station separation: {separation * 100:.3f} cm"),
        ("candidate", 0.55, "Candidate · one shared station", "Existing through-station reused"),
    ]:
        fig.text(x, 0.835, title, fontsize=14, fontweight="bold", color=DARK)
        fig.text(x, 0.795, subtitle, fontsize=12, color=PRIMARY if side == "control" else EXISTING)
        ax = fig.add_axes([x, 0.285, 0.40, 0.475])
        # All lines are direct views of saved point sequences, clipped by the
        # same axes limits. The larger gray line exposes exact shared tails.
        for gid, color, width in [(through_id, THROUGH, 4.4), (existing_id, EXISTING, 2.2)]:
            p = local(guides[side][gid]["pointsFeet"])
            ax.plot(p[:, 0], p[:, 1], color=color, lw=width, solid_capstyle="round", zorder=2)
        guide = guides[side][primary_id]
        p = local(guide["pointsFeet"])
        ax.plot(p[:, 0], p[:, 1], color=PRIMARY, lw=2.5, solid_capstyle="round", zorder=3)
        if side == "candidate":
            # Show the two exact coincident approaches without inventing a
            # connection or offsetting either line for visual separation.
            p = local(junction["approachFeet"])
            ax.plot(p[:, 0], p[:, 1], color=EXISTING, lw=3.6, zorder=4)
            ax.plot(p[:, 0], p[:, 1], color=PRIMARY, lw=2.2, ls=(0, (4, 3)), zorder=5)
        ax.scatter([0], [0], s=65, c=DARK, edgecolors="white", linewidths=1.4, zorder=8)
        ax.annotate("Original doorway\nunchanged", xy=(0, 0), xytext=(0.11, 0.075), ha="left", va="center", color=DARK, fontsize=10)
        ax.scatter([station[0]], [station[1]], s=110, facecolors="white", edgecolors=EXISTING, linewidths=2.5, zorder=8)
        if side == "control":
            ax.scatter([old_station[0]], [old_station[1]], s=110, facecolors="white", edgecolors=PRIMARY, linewidths=2.5, zorder=8)
            ax.annotate("Run-end station", xy=old_station, xytext=(-0.67, 0.75), color=PRIMARY, fontsize=10.5, fontweight="bold", arrowprops={"arrowstyle": "-", "color": PRIMARY, "lw": 1.1}, zorder=7)
            ax.annotate("Through-station", xy=station, xytext=(0.12, 0.75), color=EXISTING, fontsize=10.5, fontweight="bold", arrowprops={"arrowstyle": "-", "color": EXISTING, "lw": 1.1}, zorder=7)
            shift = np.array([0.0, 0.07])
            a, b = old_station + shift, station + shift
            ax.plot([old_station[0], a[0]], [old_station[1] + 0.018, a[1]], color="#687985", lw=0.8)
            ax.plot([station[0], b[0]], [station[1] + 0.018, b[1]], color="#687985", lw=0.8)
            ax.annotate("", xy=a, xytext=b, arrowprops={"arrowstyle": "<->", "color": DARK, "lw": 1.0, "shrinkA": 0, "shrinkB": 0})
            ax.text((a[0] + b[0]) / 2, a[1] + 0.027, f"{separation * 100:.3f} cm", ha="center", color=DARK, fontsize=9.5, bbox={"facecolor": "white", "edgecolor": "none", "pad": 1.5})
        else:
            ax.annotate("One shared station", xy=station, xytext=(0.10, 0.75), color=EXISTING, fontsize=10.5, fontweight="bold", arrowprops={"arrowstyle": "-", "color": EXISTING, "lw": 1.1}, zorder=7)
        ax.set(xlim=(-0.75, 0.55), ylim=(-0.12, 0.94), xlabel="Local x (m)")
        if side == "control":
            ax.set_ylabel("Local y (m)")
        ax.set_aspect("equal")
        ax.xaxis.set_major_locator(MultipleLocator(0.25))
        ax.yaxis.set_major_locator(MultipleLocator(0.25))
        ax.grid(color="#E4EBEF", lw=0.7)
        ax.set_axisbelow(True)
        for edge in ("top", "right"):
            ax.spines[edge].set_visible(False)
        for edge in ("left", "bottom"):
            ax.spines[edge].set_color("#BCC8D1")
    fig.legend(handles=[
        Line2D([0], [0], color=PRIMARY, lw=2.5, label="Primary guide"),
        Line2D([0], [0], color=EXISTING, lw=2.5, label="Existing doorway guide"),
        Line2D([0], [0], color=THROUGH, lw=4.2, label="Existing through-guide"),
        Line2D([0], [0], marker="o", color="none", markerfacecolor=DARK, markeredgecolor="white", markersize=7, label="Original doorway"),
    ], loc="center", bbox_to_anchor=(0.5, 0.195), ncol=4, frameon=False, fontsize=10, handlelength=2.0, columnspacing=1.8)
    fig.text(0.06, 0.135, "Current full-source cell compile: 69 guides retained; every original guide endpoint is unchanged.", fontsize=10.5, fontweight="bold", color=DARK)
    fig.text(0.06, 0.095, "Compiler geometry diagnostic. No browser, worker, or physical-journey qualification is claimed.", fontsize=10.5, color="#526A79")
    fig.text(0.06, 0.057, "Only the three receipt-bound guides are shown at the same scale. Orange dashes mark an exact shared approach; no route is inferred.", fontsize=9.2, color="#6B7D89")
    stem = BASE / args.output_stem
    png, svg = stem.with_suffix(".png"), stem.with_suffix(".svg")
    fig.savefig(png, dpi=200, metadata={"Software": "matplotlib; exact compiled guide geometry"})
    fig.savefig(svg, metadata={"Date": None, "Description": "Compiler geometry diagnostic; no browser, worker, or physical-journey qualification."})
    plt.close(fig)
    inputs = {str(path.relative_to(BASE.parent)): sha(path) for path in paths.values()}
    inputs.update({str((path.parent / "report.json").relative_to(BASE.parent)): sha(path.parent / "report.json") for path in paths.values()})
    receipt = {
        "status": "fresh compiled guide geometry diagnostic only",
        "navigationAuthority": False,
        "actualBrowserOrWorkerReplay": False,
        "physicalJourneyQualification": False,
        "inputSha256": inputs,
        "scriptSha256": sha(Path(__file__)),
        "outputSha256": {png.name: sha(png), svg.name: sha(svg)},
        "compilerBinding": reports["candidate"]["binding"]["compilerBinding"],
        "guideRoles": {"primary": primary_id, "existingDoorway": existing_id, "existingThrough": through_id},
        "junctionReceipt": junction,
        "originalDoorwayPointFeet": original_door.tolist(),
        "controlStationsFeet": [old_end.tolist(), old_through.tolist()],
        "candidateSharedStationFeet": common.tolist(),
        "oldStationSeparationCentimetres": separation * 100,
        "newStationSeparationCentimetres": 0,
        "localBasisRows": basis.tolist(),
        "sharedLimitsMetres": {"x": [-0.75, 0.55], "y": [-0.12, 0.94]},
    }
    receipt_path = stem.with_suffix(".receipt.json")
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"png": str(png), "svg": str(svg), "receipt": str(receipt_path), "separationCentimetres": separation * 100}, indent=2))


if __name__ == "__main__":
    main()
