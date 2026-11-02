# Preserving the chosen candidate — November 2, 2026

The large files (master, candidate, visitor, progressive export) cannot be
uploaded from the cloud container: the Drive connector takes files inline and
is not suited to 250 MB archives. Instead, the chain is made reproducible
from inputs the owner already holds plus this repository.

## Corrected master `6e7971f8…`

Re-running `scripts/indoor/add-reviewed-circulation-link.ts` on the canonical
October 22 master `d4d36d18…` (`UNBC.master.reviter.zip`) with the recorded
arguments reproduced every content entry byte for byte
([MASTER-REPRODUCTION.json](MASTER-REPRODUCTION.json); 5,179 s, peak RSS
5.7 GB). Only `manifest.json`'s `createdAt` field and the ZIP entry times
differ, so the archive hash is `4d4cbcd6…` rather than `6e7971f8…`. Compare
masters by entry hashes, not by archive hash.

The guide catalog of the final candidate is committed with its candidate
records, so candidate, visitor and directions cache can be rebuilt from the
canonical master with the commands in those records.
