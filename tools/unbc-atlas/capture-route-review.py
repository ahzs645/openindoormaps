#!/usr/bin/env python3
"""Capture measured walks through the atlas's public desktop/mobile controls."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

CASES = [
    ("building-10", "b10-upper", "10-3026", "10-3060"),
    ("building-06-bay", "b06-bay", "06-205", "06-209"),
    ("stair-6-landing", "stair-6-upper-hall", "06-370", "06-390"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--label", default="baseline")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    receipt = {"kind": "atlas-browser-route-captures",
               "captureScriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "atlasSha256": hashlib.sha256(args.atlas.read_bytes()).hexdigest(),
               "label": args.label, "captures": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium, headless=True,
                                    args=["--no-sandbox", "--disable-dev-shm-usage"])
        receipt["browserVersion"] = browser.version
        for viewport, width, height in [("desktop", 1440, 1100), ("mobile", 390, 844)]:
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(args.atlas.resolve().as_uri(), wait_until="load")
            for case_id, area, origin, destination in CASES:
                page.locator("#hall").select_option(area)
                page.locator("#traceWalks").get_by_role("button", name=f"{origin} → {destination}", exact=True).click()
                page.locator("#rooms").check()
                page.locator("#map").scroll_into_view_if_needed()
                page.evaluate("() => new Promise(requestAnimationFrame)")
                name = f"{args.label}-{case_id}-{viewport}.png"
                page.locator(".mapbox").screenshot(path=str(args.output/name))
                receipt["captures"].append({"image": name, "viewport": {"width": width, "height": height},
                    "origin": origin, "destination": destination, "area": area,
                    "mapTitle": page.locator("#mapTitle").inner_text(),
                    "mapNote": page.locator("#mapNote").inner_text(),
                    "sha256": hashlib.sha256((args.output/name).read_bytes()).hexdigest()})
            if errors:
                raise RuntimeError(f"Atlas browser errors: {errors}")
            page.close()
        browser.close()
    (args.output/f"{args.label}-browser-capture-receipt.json").write_text(json.dumps(receipt, indent=2)+"\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
