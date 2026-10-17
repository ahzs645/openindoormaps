"""Rasterize a standalone map-data SVG. This never controls a browser."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--svg", required=True, type=Path)
parser.add_argument("--png", required=True, type=Path)
parser.add_argument("--runtime", type=Path, help="Optional directory containing CairoSVG")
parser.add_argument("--width", type=int, default=1680)
args = parser.parse_args()
if args.runtime:
    sys.path.insert(0, str(args.runtime.resolve()))
import cairosvg

assert 320 <= args.width <= 4096
assert not args.png.exists(), "Choose a new PNG output path"
svg = args.svg.read_bytes()
png = cairosvg.svg2png(bytestring=svg, output_width=args.width)
with args.png.open("xb") as output:
    output.write(png)
receipt = {
    "format": "openindoormaps-map-data-svg-rasterization-v1",
    "label": "Map-data render of actual calculated route",
    "browserScreenshot": False,
    "svg": str(args.svg.resolve()),
    "svgSha256": hashlib.sha256(svg).hexdigest(),
    "png": str(args.png.resolve()),
    "pngSha256": hashlib.sha256(png).hexdigest(),
    "outputWidth": args.width,
    "rasterizer": "CairoSVG " + cairosvg.__version__,
}
with args.png.with_suffix(".rasterization.json").open("x") as output:
    json.dump(receipt, output, indent=2)
    output.write("\n")
print(json.dumps(receipt))
