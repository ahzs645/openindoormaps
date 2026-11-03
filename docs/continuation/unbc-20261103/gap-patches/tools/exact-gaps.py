"""Add the exact cap-corner distance to the target's nearest face (rational
arithmetic on the stored IEEE coordinates) to each candidate.
usage: exact-gaps.py CANDIDATES.json OUT.json"""
import json, sys
from fractions import Fraction as Q
C = json.load(open(sys.argv[1]))
def seg_dist2(p, a, b):
    p, a, b = [tuple(map(Q, v)) for v in (p, a, b)]
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    t = min(Q(1), max(Q(0), t))
    qx, qy = a[0] + t * dx - p[0], a[1] + t * dy - p[1]
    return qx * qx + qy * qy
for c in C["candidates"]:
    p = c["patch"]; src, tgt = p["wallEvidence"]
    ring = tgt["ringsFeet"][0]
    # the cap corners are the two source-side corners of the strip moved back by the overlap
    s = src["ringsFeet"][0]
    def inside(q):
        # exact even-odd test; a corner already inside the target has no gap
        x, y = map(Q, q); n = len(ring); hit = False
        for i in range(n):
            (ax, ay), (bx, by) = map(lambda v: tuple(map(Q, v)), (ring[i], ring[(i + 1) % n]))
            if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay): hit = not hit
        return hit
    d = []
    for q in s:
        d.append(Q(0) if inside(q) else min(seg_dist2(q, ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring))))
    two = sorted(d)[:2]
    c["exactGapFeet"] = float(max(two)) ** 0.5
    c["exactCornerDistancesFeet"] = [float(x) ** 0.5 for x in two]
json.dump(C, open(sys.argv[2], "w"))
print(sorted(round(c["exactGapFeet"], 15) for c in C["candidates"])[:5], max(c["exactGapFeet"] for c in C["candidates"]))
