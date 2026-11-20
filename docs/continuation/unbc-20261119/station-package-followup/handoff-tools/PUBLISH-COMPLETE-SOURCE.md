# Publish and verify the complete source recovery package

Run `prepare-complete-handoff.py` **after** the intended OpenIndoorMaps commit is published. Supply its full 40-character commit ID. The unchanged Reviter identity is fixed to `4a8fe6a8bd6b085e7725bb4ea18bb32d519e00a4`.

The publisher reads local Git objects and does not fetch or check GitHub. The supplied OpenIndoorMaps commit must be the actual published commit, verified by the person running the release. No current `HEAD`, abbreviated ref, uncommitted change, or working-tree copy is substituted.

## Invocation

Use Python 3.12+, Git and gzip, with a new output directory on a filesystem preserving Unix file modes. Keep all files in this `handoff-tools` directory together. Do not include its `__pycache__` directory.

```sh
python3 /workspace/scratch/3d6560c4a7bf/pr4-work/continuation-20261120/handoff-tools/prepare-complete-handoff.py \
  --openindoormaps-repo /workspace/scratch/3d6560c4a7bf/pr4-work/openindoormaps \
  --openindoormaps-commit ACTUAL_PUBLISHED_FULL_OIM_COMMIT \
  --reviter-repo /workspace/scratch/3d6560c4a7bf/pr4-work/reviter \
  --reviter-commit 4a8fe6a8bd6b085e7725bb4ea18bb32d519e00a4 \
  --output-dir /workspace/scratch/3d6560c4a7bf/pr4-work/continuation-20261120/complete-source-ACTUAL_PUBLISHED_FULL_OIM_COMMIT
```

Replace both `ACTUAL_PUBLISHED_FULL_OIM_COMMIT` occurrences with the real hash. The output directory must not already exist; a failed attempt remains available for diagnosis and is not silently overwritten on a retry.

## What the publisher does

1. Checks both exact commit objects and reads every regular-file blob ID and executable mode with `git ls-tree -r -z --full-tree`. It refuses tracked `.git` or `node_modules` paths, symbolic links, submodules and other unsupported file kinds. It never silently excludes tracked files to make a snapshot appear complete.
2. Streams `git -c tar.umask=0002 archive --format=tar --prefix=REPOSITORY/ COMMIT` into `gzip -n`. Git's commit PAX header is preserved. Neither node_modules nor Git history is added from the working directory.
3. Splits only compressed archives larger than **75 MiB** into ordered parts of at most `75 * 1024 * 1024` bytes, using 1 MiB copy buffers.
4. Calls the restore helper's `describe` command to verify the actual parts, complete archive, Git commit header and complete per-file SHA-256/restored-mode inventory. These real descriptors become `continuation-manifest.json`.
5. Restores the final manifest from the prepared parts into a fresh `restored-source/` directory, through the real restore helper. The complete helper receipt and stderr are saved.
6. Independently walks the restored source and computes **Git blob SHA-1** for each file: SHA-1 of `blob BYTE_COUNT` followed by a NUL byte and the exact file bytes. It compares those results directly with `git ls-tree`, verifies the exact file set/count, and checks executable files as `0755` and non-executable files as `0644`. This check does not use the manifest's SHA-256 file identities.
7. Writes a complete package receipt, per-file Git verification record, status, and upload index. Any failed gate leaves `package-status.json` marked failed and the process exits nonzero. Do not publish such an output.

No production build, native preparation, routing replay, dependency installation, original-model restore, repository mutation or upload is performed. This tool validates **source recovery**, not the status of runtime qualification.

## Output and evidence

- `continuation-manifest.json`: real source archive/part identities and source-file inventories; original master/viewer references are not downloaded.
- `restore-receipt.json`: full restore command, exit status and returned receipt.
- `restore-helper.stdout.json` and `restore-verification.log`: the helper's original output.
- `git-blob-verification.json`: both repositories' expected and restored counts, executable counts, and every file's expected/restored Git blob ID and mode.
- `package-receipt.json`: exact commits, archive hashes, verification summary, timing, tool versions and hashes of earlier metadata files.
- `package-status.json`: final complete/failed status and receipt identity.
- `upload-files.json`: logical source parts and recovery/verification files with exact byte counts and SHA-256 values. It does not hash itself; verify that uploaded file separately.
- `restored-source/`, `reconstructed-archives/`, and complete `.tar.gz` files: retained locally for review. Avoid duplicating a split archive's full file in the upload.

The hash relationships are deliberately one-way: the source manifest hashes source content only; the package receipt can hash that manifest and earlier receipts; the upload index can hash the package receipt. No manifest or index includes its own hash or a mutually dependent later receipt.

The upload index is a list of logical files produced locally. If small ancillary tools and logs are combined into a verification ZIP for Drive, produce a **separate final Drive save index** for the files actually uploaded, including the ZIP's actual byte count and checksum. Keep the real source manifest, source parts, restore helper and Start Here guide directly accessible. Do not represent individual logical members as separately uploaded when they are only inside the verification ZIP.

The publisher never uploads. The uploader should verify the raw bytes returned from Drive against the final save index after upload.

## Small tests

```sh
python3 -m unittest discover -s /absolute/path/handoff-tools \
  -p 'test_prepare_complete_handoff.py' -v
```

These tests check the independent verifier against `git hash-object`, detect changed file bytes/modes and missing/extra paths, reject a committed dependency tree, and exercise the strict split threshold with tiny synthetic files. They neither create Git commits nor package a production checkout. They do not replace the full clean restore performed by the publisher on the actual release.
