"""Close-ups of three gaps with their patch strips, in the display frame.
usage: draw-details.py GEOMETRY.json GRAPH-FULL.json FRAME.json CANDIDATES.json OUT.png PATCH-ID..."""
import json, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
geo, graph, frame, cand, out, *ids = sys.argv[1:]
GEO = json.load(open(geo)); G = json.load(open(graph)); F = json.load(open(frame))
C = {c["patch"]["id"]: c for c in json.load(open(cand))["candidates"]}
a, b, c0, dd = F["a"], F["b"], F["c"], F["dd"]
tf = lambda p: (a * p[0] - b * p[1] + c0, b * p[0] + a * p[1] + dd)
nodes = {n["id"]: n for n in G["nodes"]}
fig, axes = plt.subplots(1, len(ids), figsize=(5.2 * len(ids), 5.4))
for ax, pid in zip(axes, ids):
    c = C[pid]; p = c["patch"]; lv = p["levelId"]
    ring = p["ringsFeet"][0]
    cx, cy = tf((sum(q[0] for q in ring) / 4, sum(q[1] for q in ring) / 4))
    H = 0.45
    src, tgt = (w["nativeElementId"] for w in p["wallEvidence"])
    for w in GEO["walls"]:
        if w[0] != lv: continue
        r = [tf(q) for q in w[5][0]]
        if any(abs(x - cx) < 3 and abs(y - cy) < 3 for x, y in r) or w[1] in (src, tgt):
            col = "#3b6ea5" if w[1] == src else "#7a7a7a" if w[1] == tgt else ("#d0d0d0" if w[3] else "#555")
            ax.fill(*zip(*r), color=col, lw=0)
    for e in G["edges"]:
        if e["id"] in c["edgeIds"]:
            ax.plot(*zip(*[tf(q) for q in e["pointsFeet"]]), color="#008080", lw=2)
    ax.fill(*zip(*[tf(q) for q in ring]), color="magenta", alpha=0.85, lw=0)
    ax.set_xlim(cx - H, cx + H); ax.set_ylim(cy - H, cy + H); ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([])
    ax.plot([cx - H + 0.05, cx - H + 0.15], [cy - H + 0.05] * 2, color="k", lw=3)
    ax.text(cx - H + 0.05, cy - H + 0.08, "10 cm", fontsize=8)
    ax.set_title(f"{' / '.join(c['rooms'][:3])}\npartition #{src} (blue) -> #{tgt} (grey)\nexact gap {c.get('exactGapFeet', c['gapFeet']):.2e} ft; strip {p['widthFeet']:.3f} ft long", fontsize=9)
fig.suptitle("Gap close-ups (display frame, 0.9 m wide): teal = saved walks through the gap, magenta = patch strip", fontsize=10)
fig.tight_layout(rect=(0, 0, 1, 0.93)); fig.savefig(out, dpi=110); print("wrote", out)
