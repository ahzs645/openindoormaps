# Restoring archived raw completion evidence

Large frozen diagnostic JSONs, native frame captures and earlier browser traces
are preserved in [EVIDENCE-005-frozen-source-and-browser-raw.tar.gz](https://drive.google.com/file/d/1dbbiB-ILlyBAuw4EOzr9pfA94YdM5fd0/view).
They were downloaded back and verified before moving their repository copies to
retained scratch storage. Small summaries, replay scripts and all implementation
and test fixtures remain in the source trees.

The archive is 14,616,582 bytes with SHA-256
`5f3a3e06dc41d0d74af05e03a7f9935c017967f47329951153ecb3c92990503a`.
[Its receipt](checkpoints/EVIDENCE-005-frozen-source-and-browser-verification.json)
lists every original relative path, byte count and SHA-256. The 21 repository
members begin `docs/`; four additional threshold proofs begin
`threshold-frozen-evidence/`. Historical browser failures and intermediate source
captures remain labelled as historical; preserving them does not make them a pass.

For a historical replay that refers to one of those raw files, download and
verify the complete archive first. In a fresh matching source tree, extract its
`docs/` members at the repository root. For example with GNU tar:

```sh
sha256sum EVIDENCE-005-frozen-source-and-browser-raw.tar.gz
tar -xzf EVIDENCE-005-frozen-source-and-browser-raw.tar.gz \
  -C /absolute/path/to/fresh/openindoormaps --wildcards 'docs/*'
```

Compare the printed archive checksum with the value above and verify extracted
member hashes against the receipt before running the corresponding replay.
Use a fresh tree to avoid overwriting unrelated work. Current source/route
qualification must still rerun its actual original-input producer.

The corrected-label/shared-plan browser results are preserved separately in
[EVIDENCE-004](https://drive.google.com/file/d/1oSl4LjBoPBNUzCS08RKn5eYJNP_Sl90Q/view),
with its [verified inventory](checkpoints/EVIDENCE-004-compact-browser-verification.json).
The complete numbered source checkpoints additionally preserve the exact
in-progress source inventories as recorded at capture time.
