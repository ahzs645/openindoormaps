# Independent SketchGrid role review

The complete original native SketchGrid semantic role may establish that its own
self-contained graphics are a nonmaterial work-plane/view grid. This is an
independent semantic role qualification, not a proof that a Geometry control
command is a no-op or that an apparently flat physical body has no material.

Primary Autodesk documentation defines work planes as virtual two-dimensional
surfaces used for views and sketching, and describes their displayed grids:

- https://help.autodesk.com/cloudhelp/2022/ENU/Revit-Model/files/GUID-D6D431AD-46C6-49A9-AA8B-436DE67C51E2.htm
- https://help.autodesk.com/cloudhelp/2026/ENU/RevitLT-Model/files/GUID-FBBF96B9-C935-4032-B900-7655DFF031D7.htm

The mapping from the internal class to that documented role is an inference from
the exact source class/schema, its sole view-reference payload, actual view
semantics, native ownership, and complete grid-only graphics. A category/name or
bounding box alone cannot establish that mapping for an arbitrary element.

Required code gates:

- Checksum/length-complete schema-backed semantic frame and complete FIFO.
- Exact SketchGrid class/root contract, including null parameter, geometry-step,
  geometry-table and cell descriptors; no additional child or semantic material
  references. Preserve inherited fields and exact native IDs.
- Actual referenced DBView695 separately resolved from original checksummed
  semantic source; a valid native parent316 (parent312) cannot substitute for it.
- Unique original header and ElementTable ownership; no owned children.
- Complete self-contained drawing graph, exact parent roles and no material,
  external instance or unsupported branch. Retain literal drawing command
  values; do not whitelist unknown commands as general material absence.
- Exclude only the proven original GElement variant, or qualify the entire ID
  only if every source variant is resolved. Missing, corrupt, unconsumed,
  oversized or ambiguous variants must remain conservative.
- A fresh private original-source census must construct the resulting role.
  Serialized proofs and cached legacy envelope rows cannot grant it directly.

The initial command mutation (source inspector28391c14..., actual1605B drawing
Geometry command at byte575 changed to2147483647 with a valid checksum) was
accepted. Under the independent view-role contract this demonstrates that drawing
command semantics remain unqualified; it is not itself a material counterexample.
That distinction was explicitly reported to root. Unknown commands still block
interpreting or tightening MATERIAL bodies, including the unused stair/floor
boundary-family prototypes.

Final implementation review must use stable hashes after the role/variant gates
land. No production source was modified by this review; no native geometry or
full-source physical profile was run.
