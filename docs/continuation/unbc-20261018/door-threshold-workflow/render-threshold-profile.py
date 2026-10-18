"""Analytical source-envelope proposal, not a route or body certificate.
Usage: python render-threshold-profile.py FIVE-PROPOSALS.json OUTPUT.png
"""
import json
import math
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

data = json.loads(Path(sys.argv[1]).read_text())
case = next(row for row in data['proposals'] if row['nativeDoorElementId'] == 2315416)
points = list(reversed(case['thresholdProfileProposal']['displayProfileFeet']))
base = case['elevationFeet']
x = [math.hypot(p[0]-points[0][0], p[1]-points[0][1])*.3048 for p in points]
z = [(p[2]-base)*304.8 for p in points]
fig, ax = plt.subplots(figsize=(11, 3.5), constrained_layout=True)
fig.patch.set_facecolor('#f8fafb')
ax.set_facecolor('#f8fafb')
ax.fill_between([x[1], x[3]], [0, 0], [50, 50], color='#e2ad59', alpha=.45)
ax.plot([x[0], x[-1]], [0, 0], '--', color='#a2a9af', lw=2, label='Flat crossing conflicts with modeled sill')
ax.plot(x, z, color='#168a8b', lw=3, marker='o', ms=4, label='Proposed stepped profile; not enabled')
ax.annotate('50 mm source sill', xy=((x[1]+x[3])/2, 50), xytext=((x[1]+x[3])/2, 73),
            ha='center', arrowprops={'arrowstyle':'->','color':'#5b6570'}, color='#263642')
ax.text(x[0], -15, '08-360\nLink to Building 04', ha='left', va='top', color='#263642')
ax.text(x[-1], -15, '08-316\nBuilding 08 hallway', ha='right', va='top', color='#263642')
ax.set_ylim(-42, 90)
ax.set_xlim(-.04, x[-1]+.04)
ax.set_xlabel('Distance along proposed crossing (m)')
ax.set_ylabel('Height above native floor (mm)')
ax.set_yticks([0, 25, 50, 75])
ax.spines[['top', 'right']].set_visible(False)
ax.set_title('Floor 3 · door 2315416 · retain the height change', loc='left', fontweight='bold')
ax.grid(axis='y', color='#dce1e3', lw=.5)
ax.legend(loc='upper right', frameon=False, fontsize=9)
fig.savefig(sys.argv[2], dpi=160)
