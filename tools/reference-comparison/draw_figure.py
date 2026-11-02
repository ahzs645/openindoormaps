"""Draw our Floor 2 next to one Mappedin reference floor in one visual style.

Navigation edges teal, destination nodes orange, space outlines grey.
Panels: (1) reference floor, (2) our whole Floor 2, (3) a detail of our
Floor 2 at the reference panel's scale (metres per pixel). Run with
`python3 -I`; the reference bundle is parsed as JSON only.

    python3 -I tools/reference-comparison/draw_figure.py \
        --mvf BOWIE_MVF_DIR --mvf-floor "Floor 2 (TML)" \
        --ours docs/continuation/unbc-20261031/campus/map/floors/floor-2.json \
        --detail-room 04-204 --metrics METRICS.json --out FIGURE.png
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navgraph as ng  # noqa: E402

TEAL = (0, 128, 128)
ORANGE = (230, 120, 20)
GREY = (175, 175, 175)
INK = (40, 40, 40)
BG = (255, 255, 255)
W, H, PAD, TOP = 760, 1000, 24, 120


def font(size, bold=False):
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


class Panel:
    def __init__(self, img, x0, bbox, scale=None):
        self.img, self.x0 = img, x0
        self.d = ImageDraw.Draw(img)
        minx, miny, maxx, maxy = bbox
        aw, ah = W - 2 * PAD, H - TOP - PAD - 40
        self.s = scale or min(aw / (maxx - minx), ah / (maxy - miny))
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        self.ox = x0 + W / 2 - cx * self.s
        self.oy = TOP + ah / 2 + cy * self.s
        self.clip = (x0 + PAD, TOP, x0 + W - PAD, TOP + ah)

    def p(self, x, y):
        return (self.ox + x * self.s, self.oy - y * self.s)

    def line(self, pts, fill, width):
        q = [self.p(*t) for t in pts]
        if len(q) >= 2:
            self.d.line(q, fill=fill, width=width)

    def dot(self, x, y, r, fill):
        a, b = self.p(x, y)
        self.d.ellipse((a - r, b - r, a + r, b + r), fill=fill)

    def scalebar(self, metres, label):
        x, y = self.clip[0] + 8, self.clip[3] + 18
        self.d.line((x, y, x + metres * self.s, y), fill=INK, width=3)
        self.d.text((x, y + 6), label, fill=INK, font=font(14))


def title(d, x0, t, sub):
    d.text((x0 + PAD, 18), t, fill=INK, font=font(22, True))
    yy = 52
    for line in sub:
        d.text((x0 + PAD, yy), line, fill=INK, font=font(14))
        yy += 19


def bbox_of(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mvf", required=True)
    ap.add_argument("--mvf-floor", required=True)
    ap.add_argument("--mvf-label", default="Mappedin reference")
    ap.add_argument("--ours", required=True)
    ap.add_argument("--detail-room", required=True)
    ap.add_argument("--metrics", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    M = json.load(open(a.metrics))

    graphs, floors, spaces, _facts = ng.load_mvf(a.mvf)
    mid = next(k for k, v in floors.items() if (v.get("name") or "").strip() == a.mvf_floor)
    rg = graphs[mid]
    rspace = spaces.get(mid, [])
    d = json.load(open(a.ours))
    og, _d, _f = ng.load_ours(a.ours)

    img = Image.new("RGB", (3 * W, H), BG)
    draw = ImageDraw.Draw(img)

    # Panel 1: reference
    rb = bbox_of(list(rg.pos.values()) + [p for r in rspace for p in r])
    p1 = Panel(img, 0, rb)
    for r in rspace:
        p1.line(r, GREY, 1)
    for e in rg.edges:
        u, v = tuple(e)
        p1.line([rg.pos[u], rg.pos[v]], TEAL, 3)
    for n in rg.dest:
        p1.dot(*rg.pos[n], 3, ORANGE)
    rm = M["references"]["mappedin-bowie"]["floors"].get(a.mvf_floor, {}).get("drawnUnion", {})
    title(
        draw,
        0,
        f"{a.mvf_label}: {a.mvf_floor}",
        [
            f"{rm.get('nodes')} nodes, {rm.get('lengthM')} m of edges; hand-authored graph",
            f"spine turns >5 deg: {rm.get('spineTurnsOver5DegPer100m')} per 100 m; straight-run share {rm.get('spineStraightRunShare')}",
            f"branches within 10 deg of 90: {round(100 * (rm.get('branchAttachmentWithin10DegOf90') or 0))} %",
        ],
    )
    p1.scalebar(10, "10 m")

    # Panel 2: our whole floor
    cell_rings = [[(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)] for c in d["cells"] for r in c[2]]
    ob = bbox_of([p for r in cell_rings for p in r])
    p2 = Panel(img, W, ob)
    for r in cell_rings:
        p2.line(r, GREY, 1)
    for line, _cat, _ei in d["net"]:
        p2.line([(line[i] / 10, line[i + 1] / 10) for i in range(0, len(line), 2)], TEAL, 1)
    for n in og.dest:
        p2.dot(*og.pos[n], 1.5, ORANGE)
    om = M["ours"]["floors"]["floor-2"]["drawnUnion"]
    title(
        draw,
        W,
        "UNBC: Floor 2 (whole campus floor)",
        [
            f"{om.get('nodes')} nodes, {om.get('lengthM')} m (drawn union); compiled from native walls",
            f"spine turns >5 deg: {om.get('spineTurnsOver5DegPer100m')} per 100 m; straight-run share {om.get('spineStraightRunShare')}",
            f"branches within 10 deg of 90: {round(100 * (om.get('branchAttachmentWithin10DegOf90') or 0))} %",
        ],
    )
    p2.scalebar(50, "50 m")

    # Panel 3: detail of our floor at the reference panel's scale
    room = next(n for n in d["names"] if n[0] == a.detail_room)
    cx, cy = room[4][0] / 10, room[4][1] / 10
    s = p1.s
    aw, ah = W - 2 * PAD, H - TOP - PAD - 40
    hw, hh = aw / 2 / s, ah / 2 / s
    p3 = Panel(img, 2 * W, (cx - hw, cy - hh, cx + hw, cy + hh), scale=s)
    # frame on panel 2
    a0, b0 = p2.p(cx - hw, cy + hh)
    a1, b1 = p2.p(cx + hw, cy - hh)
    draw.rectangle((a0, b0, a1, b1), outline=INK, width=2)
    sub = Image.new("RGB", (W, H), BG)
    p3s = Panel(sub, 0, (cx - hw, cy - hh, cx + hw, cy + hh), scale=s)
    for r in cell_rings:
        p3s.line(r, GREY, 1)
    for line, _cat, _ei in d["net"]:
        p3s.line([(line[i] / 10, line[i + 1] / 10) for i in range(0, len(line), 2)], TEAL, 3)
    for n in og.dest:
        p3s.dot(*og.pos[n], 3, ORANGE)
    crop = sub.crop((PAD, TOP, W - PAD, TOP + ah))
    img.paste(crop, (2 * W + PAD, TOP))
    title(
        draw,
        2 * W,
        f"UNBC Floor 2 detail around {a.detail_room}",
        [
            "Same metres per pixel as the reference panel.",
            "All stored walk lines drawn (accepted guides and saved walks);",
            "overlapping shared lanes appear as one line.",
        ],
    )
    p3.scalebar(10, "10 m")
    for x in (W, 2 * W):
        draw.line((x, 0, x, H), fill=(220, 220, 220), width=1)
    # legend
    ly = H - 22
    lx = 2 * W + W - 420
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
