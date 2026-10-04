# Native stair surrounds: first visual pass

The visitor map no longer paints an unverified stair-place contour as a floor or extrudes it as a room. A stair label identifies a place; the steps, walls, slab and slab openings identify physical material.

Supported native wall enclosures are intersected with the union of exact-height native slabs, including separate shells and holes, then trimmed at native wall material. These landings are flat blue-grey surfaces. Where the enclosure is still unverified, the existing neutral native slab remains visible beneath the actual stair geometry. This is a physical-floor fallback, not a repaired room boundary or a new public route.

Shared native circulation cells are retained even if their semantic owner is a stair place. Review mode retains the source contours. Visitor hit regions remain available; when a stair place has a current native-flight binding, its actual steps highlight on selection rather than turning its entire source footprint yellow.

Current UNBC master audit: 76 stair places, 32 native enclosure-and-slab landings, 4 displayed shared circulation owners and 40 neutral native-floor fallbacks. No painted raw stair-place contours or raised stair-place volumes remain in the visitor preparation. Existing picking regions are retained; some semantic places already share another place's circulation footprint.

The 40 neutral fallbacks still need enclosure/source review before receiving a distinct landing tint. Some visible native flights still stack together in a cluttered way; their per-floor visibility needs a separate pass. This first pass does not infer headroom underneath stairs, fill stairwell voids, alter access, edit source rooms, or add navigation connections. The source graph and master ZIP remain unchanged.

Validation: 16 unit tests passed (9 optional package tests skipped), 6 desktop/mobile browser tests passed, including the actual Building 6 well opening in both 2D and 3D and native-flight picking. Typecheck and Pages build passed. The package-wide preparation audit confirms that the routing graph is unchanged.

Evidence: `work/stair-surrounds/audit.json`, unit/typecheck/build/browser logs, and desktop/mobile screenshots in `work/stair-surrounds/browser`. The same preparation is used by 2D and 3D views; native relative elevations are retained. This change is local and has not been published.
