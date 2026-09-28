#!/usr/bin/env python3

import json
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


def viewport_window(viewport):
    view_height = float(viewport.dxf.view_height)
    paper_height = float(viewport.dxf.height)
    paper_width = float(viewport.dxf.width)
    if paper_height == 0:
        return None

    view_width = view_height * paper_width / paper_height
    center_x, center_y, _ = viewport.dxf.view_center_point
    target_x, target_y, _ = viewport.dxf.view_target_point

    model_center_x = center_x + target_x
    model_center_y = center_y + target_y

    return {
        "bbox": [
            model_center_x - view_width / 2,
            model_center_y - view_height / 2,
            model_center_x + view_width / 2,
            model_center_y + view_height / 2,
        ],
        "modelCenter": [model_center_x, model_center_y],
        "paperCenter": [float(viewport.dxf.center.x), float(viewport.dxf.center.y)],
        "paperSize": [paper_width, paper_height],
        "viewSize": [view_width, view_height],
        "status": int(viewport.dxf.status),
    }


def main():
    if len(sys.argv) != 2:
        print(
            "Usage: extract-layout-windows.py <path/to/file.dxf>",
            file=sys.stderr,
        )
        raise SystemExit(1)

    dxf_path = Path(sys.argv[1]).resolve()
    document = ezdxf.readfile(dxf_path)

    layouts = []
    for layout in document.layouts:
        if layout.name == "Model":
            continue

        viewports = [
            entity
            for entity in layout
            if entity.dxftype() == "VIEWPORT" and int(entity.dxf.status) > 1
        ]
        if not viewports:
            continue

        primary_viewport = max(
            viewports,
            key=lambda viewport: float(viewport.dxf.width)
            * float(viewport.dxf.height),
        )
        window = viewport_window(primary_viewport)
        if window is None:
            continue

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
