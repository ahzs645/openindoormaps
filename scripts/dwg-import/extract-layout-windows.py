#!/usr/bin/env python3

import json
import math
import sys
from pathlib import Path

try:
    import ezdxf
except ImportError as exc:  # pragma: no cover - runtime dependency
    print(
        json.dumps(
            {
                "error": (
                    "Missing Python dependency 'ezdxf'. "
                    "Install it with: python3 -m pip install --user ezdxf"
                )
            }
        ),
        file=sys.stderr,
    )
    raise SystemExit(2) from exc


def viewport_window(viewport, allow_missing_status=False):
    view_height = float(viewport.dxf.view_height)
    paper_height = float(viewport.dxf.height)
    paper_width = float(viewport.dxf.width)
    if not all(math.isfinite(value) and value > 0 for value in (view_height, paper_height, paper_width)):
        return None

    view_width = view_height * paper_width / paper_height
    center_x, center_y, _ = viewport.dxf.view_center_point
    target_x, target_y, _ = viewport.dxf.view_target_point

    model_center_x = center_x + target_x
    model_center_y = center_y + target_y

    if not all(math.isfinite(value) for value in (model_center_x, model_center_y)):
        return None
    status = int(viewport.dxf.status)
    inferred = status == 0 and int(viewport.dxf.id) == 0
    # LibreDWG can omit both fields. Opt in only for a scaled model viewport,
    # never the sheet's scale-1 overview. Perspective needs another path.
    if status <= 1 and not (
        allow_missing_status and inferred and view_height / paper_height >= 10
        and math.hypot(model_center_x, model_center_y) > 1
    ):
        return None
    if int(viewport.dxf.flags) & 1:
        return None
    twist = float(viewport.dxf.view_twist_angle)
    if not math.isfinite(twist):
        return None
    width = abs(math.cos(twist)) * view_width + abs(math.sin(twist)) * view_height
    height = abs(math.sin(twist)) * view_width + abs(math.cos(twist)) * view_height

    return {
        "bbox": [
            model_center_x - width / 2,
            model_center_y - height / 2,
            model_center_x + width / 2,
            model_center_y + height / 2,
        ],
        "modelCenter": [model_center_x, model_center_y],
        "paperCenter": [float(viewport.dxf.center.x), float(viewport.dxf.center.y)],
        "paperSize": [paper_width, paper_height],
        "viewSize": [view_width, view_height],
        "status": status,
        "viewportHandle": viewport.dxf.handle,
        "statusInferred": status <= 1,
        "viewTwistRadians": twist,
        "boundsEncloseRotatedWindow": abs(twist) > 1e-6,
    }


def main():
    if len(sys.argv) not in (2, 3):
        print(
            "Usage: extract-layout-windows.py <path/to/file.dxf> [--allow-missing-status]",
            file=sys.stderr,
        )
        raise SystemExit(1)

    dxf_path = Path(sys.argv[1]).resolve()
    document = ezdxf.readfile(dxf_path)

    layouts = []
    for layout in document.layouts:
        if layout.name == "Model":
            continue

        viewports = [(entity, viewport_window(entity, "--allow-missing-status" in sys.argv))
                     for entity in layout if entity.dxftype() == "VIEWPORT"]
        viewports = [(entity, window) for entity, window in viewports if window is not None]
        if not viewports:
            continue

        primary_viewport, window = max(
            viewports,
            key=lambda pair: float(pair[0].dxf.width) * float(pair[0].dxf.height),
        )

        layouts.append(
            {
                "name": layout.name,
                "viewportCount": len(viewports),
                **window,
            }
        )

    print(json.dumps({"layouts": layouts}, indent=2))


if __name__ == "__main__":
    main()
