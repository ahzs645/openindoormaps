# Provisional construction check broad phase

The measured cold doorway calculation spent most of its time rebuilding the provisional construction checks. A strict bounding-box test already avoided most polygon intersections, but still visited approximately 25 million distant section/row pairs. The new operation-local static index reduces that enumeration before the unchanged exact predicates run.

The OpenIndoorMaps and Reviter implementations are identical apart from import suffixes. Every node bound is a min/max union of original stored coordinates. Queries retain boundary contact, duplicate occurrences, original source order and every unknown, malformed or nonfinite bound. An unknown query returns the complete original collection. No index survives a source edit. Shifted positive-material bands remain unculled; no rounded translated bound establishes absence.

Drawing rows query their unchanged footprints. Ordinary rows query the actual computed `foreignFoot` for positive bands, and retain their original three-dimensional body-bound guard. Original exact material intersections, physical openings, owner contacts, complete foreign-body acknowledgements, drawing evidence and floor/source checks remain in place.

The independent review passed 51 constructor and helper regression tests, including real holes, foreign bodies, contacts, context-only construction, sparse bounds and mutation guards. Whole-UNBC output parity and calculator timing are recorded separately after their actual runs; unit tests alone do not establish a loading or route-speed improvement.

Review receipt: `/workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/provisional-static-index-independent-review.json`. Original constructor sources are retained under `/workspace/scratch/unbc-pathway-repair-20261015/spatial-index/` for differential replay.
