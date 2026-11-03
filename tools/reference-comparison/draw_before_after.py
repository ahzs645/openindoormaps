"""Draw one area of our floor before and after a guide-catalog change, in the
reference-comparison figure style (navigation edges teal, destination nodes
orange, space outlines grey), with full-precision guide geometry.

    python3 -I tools/reference-comparison/draw_before_after.py \
        --floor docs/continuation/unbc-20261031/campus/map/floors/floor-2.json \
        --graph CAND_FINAL/graph-full.json --frame CAND_FINAL/frame-1a127847.json \
        --before BEFORE/PREPARED-ROUTING.json --after AFTER/prepared-routing.json \
        --metrics METRICS.json --room 04-204 --room 08-216 --out FIGURE.png

Each catalog replaces only the accepted-guide lines (net categories 0/2);
saved walks are drawn from the same stored geometry in both columns.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navgraph as ng  # noqa: E402
from draw_figure import BG, GREY, INK, ORANGE, PAD, TEAL, font  # noqa: E402

W, H, TOP = 760, 860, 96


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor", required=True)
    ap.add_argument("--graph", required=True)
    ap.add_argument("--frame", required=True)
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--labels", nargs=2, default=["Before", "After"])
    ap.add_argument("--metrics", help="measure_ours.py output for subtitles")
    ap.add_argument("--room", action="append", required=True)
    ap.add_argument("--half-width-m", type=float, default=16.0)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    G = json.load(open(a.graph))
    E = {e["id"]: e for e in G["edges"]}
    fr = json.load(open(a.frame))
    d = json.load(open(a.floor))
    fid = os.path.splitext(os.path.basename(a.floor))[0]
    M = json.load(open(a.metrics)) if a.metrics else None
    catalogs = []
    for path in (a.before, a.after):
        P = {x["edgeId"]: x for x in json.load(open(path))["guides"]}
        g, _d, _f = ng.load_ours(a.floor, (E, P, fr))
        catalogs.append((g, P))
    cell_rings = [[(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)] for c in d["cells"] for r in c[2]]
    rooms = {n[0]: n for n in d["names"]}
    rows = len(a.room)
    img = Image.new("RGB", (2 * W, rows * H), BG)
    draw = ImageDraw.Draw(img)
    aw, ah = W - 2 * PAD, H - TOP - PAD - 30
    s = min(aw, ah) / (2 * a.half_width_m)
    for row, room in enumerate(a.room):
        cx, cy = rooms[room][4][0] / 10, rooms[room][4][1] / 10
        for col, (g, _P) in enumerate(catalogs):
            x0, y0 = col * W, row * H
            sub = Image.new("RGB", (W, H), BG)
            sd = ImageDraw.Draw(sub)

            def p(x, y):
                return (W / 2 + (x - cx) * s, TOP + ah / 2 - (y - cy) * s)

            for r in cell_rings:
                sd.line([p(*t) for t in r + r[:1]], fill=GREY, width=1)
            for e in g.edges:
                u, v = tuple(e)
                sd.line([p(*g.pos[u]), p(*g.pos[v])], fill=TEAL, width=3)
            for n in g.dest:
                q = p(*g.pos[n])
                sd.ellipse((q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3), fill=ORANGE)
            crop = sub.crop((PAD, TOP, W - PAD, TOP + ah))
            img.paste(crop, (x0 + PAD, y0 + TOP))
            label = a.labels[col]
            draw.text((x0 + PAD, y0 + 16), f"{label}: {d['name']} around {room}", fill=INK, font=font(20, True))
            if M:
                key = list(M["catalogs"])[col]
                m = M["catalogs"][key]["floors"][fid]["drawnUnion"]
                gm = M["catalogs"][key]["floors"][fid]["guidesOnly"]
                lines = [
                    f"floor spine turns >5 deg: {m['spineTurnsOver5DegPer100m']} per 100 m (guides only {gm['spineTurnsOver5DegPer100m']})",
                    f"straight-run share {m['spineStraightRunShare']} (guides only {gm['spineStraightRunShare']}); "
                    f"branches within 10 deg of 90: {round(100 * m['branchAttachmentWithin10DegOf90'])} %",
                ]
                for i, t in enumerate(lines):
                    draw.text((x0 + PAD, y0 + 44 + 19 * i), t, fill=INK, font=font(13))
            sx, sy = x0 + PAD + 8, y0 + TOP + ah + 14
            draw.line((sx, sy, sx + 5 * s, sy), fill=INK, width=3)
            draw.text((sx, sy + 6), "5 m", fill=INK, font=font(13))
        draw.line((0, row * H, 2 * W, row * H), fill=(220, 220, 220), width=1)
    draw.line((W, 0, W, rows * H), fill=(220, 220, 220), width=1)
    ly = rows * H - 18
    lx = 2 * W - 420
    draw.line((lx, ly, lx + 24, ly), fill=TEAL, width=3)
    draw.text((lx + 30, ly - 8), "navigation edges", fill=INK, font=font(13))
    draw.ellipse((lx + 160, ly - 4, lx + 168, ly + 4), fill=ORANGE)
    draw.text((lx + 174, ly - 8), "destination nodes", fill=INK, font=font(13))
    draw.line((lx + 300, ly, lx + 324, ly), fill=GREY, width=1)
    draw.text((lx + 328, ly - 8), "spaces", fill=INK, font=font(13))
    out = img.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    out.save(a.out, optimize=True)
    print("wrote", a.out, os.path.getsize(a.out), "bytes")


if __name__ == "__main__":
    main()
