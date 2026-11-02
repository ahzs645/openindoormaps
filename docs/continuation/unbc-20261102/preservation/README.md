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

## Bundle of the actual tested files (November 2, 2026)

The actual bytes of the final development candidate were packed into one tar
archive and split into ten parts: nine of 94,371,840 bytes and one of
17,827,840 bytes. All ten were delivered to the owner as files in the
session. The bundle holds:

- the master `6e7971f8…`;
- the catalog `1c3011ff…`;
- the candidate `32c395e1…`;
- the independent visitor ZIP `e60634aa…`, whose `viewer/indoor.json` is
  `6abc227a…`;
- the complete progressive export (revision `fa6d2935…`);
- the directions carrier `3d27eaa5…` with its receipt and proof;
- the seven plan carriers;
- the gate 4 and 5 admission reports and receipts.

Before delivery, the parts were reassembled and extracted in a separate
directory, and all 284 file checksums matched.

- [BUNDLE-PARTS.SHA256SUMS](BUNDLE-PARTS.SHA256SUMS) lists the parts.
- [BUNDLE-FILES.SHA256SUMS](BUNDLE-FILES.SHA256SUMS) lists every file.
- [BUNDLE-RESTORE.md](BUNDLE-RESTORE.md) gives the restore steps.

The bundle counts as preserved only after the owner stores the parts (for
example in the recovery Drive folder) and checks them against
`BUNDLE-PARTS.SHA256SUMS` after download.
