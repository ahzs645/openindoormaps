# Routing: deferred by the owner (2026-10-11)

The routing code and records are committed (see A-routing.md). Real-graph verification is deferred. Open items for when routing resumes:

1. The grid region check in reviter indoor-region.ts scans all 11,378 edges of the giant Floor 1 cell (113,276 sq ft, 154 rooms) on each of about 3M queries. It ran 83 min without finishing. Add an edge index (bbox / uniform grid) so results stay identical, then measure the attach.
2. The real graph with the giant cell attached has never been measured. Target pairs: 04-122->08-107, 04-122->07-180, 07-163->07-180, 07-180/08-107->09-232, 07-180->09-201, 07-225->07-220 (needs the Q5.2 aperture compiled).
3. The B4 Floor 1.25 rooms and 04-126 don't join on the real graph although the proxy says they do: the door edges exist, but no walk reaches them. Cause unknown.
4. 04-122->08-107 and the 09-232 pairs fail on the real graph even with the giant cell counted as connected (upper bound). Investigate after item 1.
5. B4 steps #1588220 (04-124-local-steps) are refused: the curved BRep treads leave plan gaps of 0.075 / 0.195 sq ft to the slabs. Under Q3.12 (the DWG draws the treads), find riser-continuity or drawing evidence.
6. Keep the 08-162 staff access record (Q3.8); the physical-level door matching would otherwise make 08-162 routable.
7. The runtime public graph build takes 19-21 min on this dataset.
