# Restore the complete continuation source

This helper restores independent source snapshots for OpenIndoorMaps and Reviter from the versioned continuation package. It needs **Python 3.12 or later**, the final `continuation-manifest.json`, and every archive part named in that manifest. It uses only the Python standard library and makes no network requests.

Use a filesystem that preserves Unix file permissions, such as Linux, macOS, or a Linux filesystem inside WSL. Exact executable/non-executable mode verification is part of restoration. Allow room for the downloaded parts, reconstructed archives, temporary verified archive copies, and the extracted source.

These are complete snapshots of the committed, tracked source. They do not contain Git history or `.git` directories. Dependency installations and the original model/viewer inputs are separate. A successful source restoration is an integrity check; the current qualification report determines which runtime and routing checks have passed.

## Restore downloaded files

Place the final manifest, helper, and every named part in a download directory. Keep the original filenames. An archive smaller than or equal to 75 MiB is normally one `.tar.gz` file; larger archives are split into ordered `.part001`, `.part002`, and subsequent files.

Choose an explicit **missing or empty** destination whose parent already exists:

```sh
python3 /absolute/path/downloads/restore-continuation.py restore \
  --manifest /absolute/path/downloads/continuation-manifest.json \
  --parts-dir /absolute/path/downloads \
  --destination /absolute/path/work/unbc-continuation
```

The result has sibling source directories:

```text
unbc-continuation/openindoormaps/
unbc-continuation/reviter/
```

Reconstructed complete archives are kept in the download directory. To keep them elsewhere, add `--archives-dir /absolute/path/verified-archives`. That directory must be outside the extraction destination.

The helper verifies each part's byte count and SHA-256 in the order recorded by the manifest, then verifies the assembled archive's byte count and SHA-256. It never relies on guessed filename order. An already present complete archive is reused only if its bytes match the manifest; different content is refused. All source parts are verified even when a matching complete archive already exists. The source parts are never overwritten or deleted.

Every archive is checked before extraction. Paths must remain under its declared root. Absolute paths, traversal, duplicate members, `.git` entries, links and special files are rejected. The Git archive's PAX commit header must match the manifest's full source commit ID. Extraction uses Python's explicit `filter="data"` into a private staging directory. Only after verification does the helper move the finished directory into the chosen destination. A nonempty destination is refused, including hidden files; the helper does not merge into an existing checkout.

When the manifest supplies an inventory, the exact regular-file set, file byte counts, SHA-256 values and restored permission modes must match it. The helper also hashes every extracted regular file and checks its mode against the verified archive, whether or not a publisher inventory was supplied. Directory timestamps, ownership and directory permission modes are not part of the per-file inventory. Git archive modes such as `0664` and `0775` become `0644` and `0755` under the data filter; `describe` records those restored modes.

On failure, the extraction destination is not populated. Verified reconstructed archives can remain for a later attempt. The exit status is nonzero and the error identifies the failing input or check. On success, stdout contains a JSON receipt with the restored commit IDs, destination, file count and inventory status.

## Original master and historical viewer

The original master/model and historical viewer remain reference-only in the [original Drive handoff](https://drive.google.com/drive/folders/1PdyETAWsVOPcPPC-RAOUSaJmqXEh-rWU). The continuation source package does not duplicate them or fetch them automatically.

Use the original `archive-parts.json` and `restore_archives.py` with their recorded identities when those inputs are needed. Follow the recovery input guide for the master-only command: the original restore helper's default restores both the master and viewer and therefore requires both sets of parts. Source restoration with this helper does not establish that the historical viewer has been updated or that a new complete worker replay passed.

## Manifest files

- `continuation-manifest.schema.json` describes the final manifest's shape. The restore helper enforces its operational checks itself; no JSON Schema package is needed.
- `continuation-manifest.example.json` is a **template with deliberately invalid placeholders**. It asserts no final source commit, archive checksum, or byte count. It cannot be used for restoration.
- The final publisher-generated `continuation-manifest.json` contains actual archive identities and ordered parts. Keep it with the downloaded files.

The helper additionally checks relationships that are not expressed by the schema: unique archive roots and names, safe paths, unique parts, part-size sums, no input/output name collisions, exact concatenated hashes, the Git commit header, and the exact extracted inventory.

## Publisher: make the complete source archives

Finish and commit the intended source first. The commands below package `HEAD`; uncommitted or untracked work is not included. Review the working trees before publishing. Do not substitute an earlier source snapshot or a delta-only bundle for these complete archives.

In Bash, fill in the paths and create a new, empty output directory:

```sh
set -euo pipefail
CONTINUATION_OIM_REPO=/absolute/path/openindoormaps
CONTINUATION_REVITER_REPO=/absolute/path/reviter
CONTINUATION_RELEASE=/absolute/path/new-release-package
CONTINUATION_TOOLS=/absolute/path/handoff-tools

git -C "$CONTINUATION_OIM_REPO" diff --quiet
git -C "$CONTINUATION_OIM_REPO" diff --cached --quiet
git -C "$CONTINUATION_REVITER_REPO" diff --quiet
git -C "$CONTINUATION_REVITER_REPO" diff --cached --quiet
mkdir "$CONTINUATION_RELEASE"

CONTINUATION_OIM_COMMIT=$(git -C "$CONTINUATION_OIM_REPO" rev-parse HEAD)
CONTINUATION_REVITER_COMMIT=$(git -C "$CONTINUATION_REVITER_REPO" rev-parse HEAD)

git -C "$CONTINUATION_OIM_REPO" archive --format=tar --prefix=openindoormaps/ "$CONTINUATION_OIM_COMMIT" \
  | gzip -n > "$CONTINUATION_RELEASE/openindoormaps-$CONTINUATION_OIM_COMMIT.tar.gz"
git -C "$CONTINUATION_REVITER_REPO" archive --format=tar --prefix=reviter/ "$CONTINUATION_REVITER_COMMIT" \
  | gzip -n > "$CONTINUATION_RELEASE/reviter-$CONTINUATION_REVITER_COMMIT.tar.gz"
```

`gzip -n` omits the input filename and gzip timestamp. Use the exact final commit ID, rather than a tree object, so `git archive` includes the commit identity checked by the helper. Do not add symlinks, hard links, device nodes, FIFOs or `.git` contents to these source archives; the current two source trees have no tracked symbolic links or submodules.

The following standard-library publisher snippet splits **only files larger than 75 MiB**, generates each descriptor from actual archive and part bytes, and writes the final manifest without overwriting an existing one. The 75 MiB limit is `75 * 1024 * 1024` bytes. File copying uses 1 MiB buffers.

```sh
python3 - "$CONTINUATION_TOOLS/restore-continuation.py" "$CONTINUATION_RELEASE" \
  "$CONTINUATION_OIM_COMMIT" "$CONTINUATION_REVITER_COMMIT" <<'PY'
import datetime
import json
from pathlib import Path
import subprocess
import sys

helper, release, oim_commit, reviter_commit = sys.argv[1:]
release = Path(release)
limit = 75 * 1024 * 1024
entries = []
upload_sources = []
for name, commit in [("openindoormaps", oim_commit), ("reviter", reviter_commit)]:
    archive = release / f"{name}-{commit}.tar.gz"
    parts = []
    remaining = archive.stat().st_size
    if remaining > limit:
        with archive.open("rb") as source:
            index = 1
            while remaining:
                part = release / f"{archive.name}.part{index:03d}"
                to_write = min(limit, remaining)
                with part.open("xb") as target:
                    while to_write:
                        chunk = source.read(min(1024 * 1024, to_write))
                        if not chunk:
                            raise RuntimeError("Archive ended during splitting")
                        target.write(chunk)
                        to_write -= len(chunk)
                        remaining -= len(chunk)
                parts.append(part)
                index += 1
    else:
        parts = [archive]
    command = [sys.executable, helper, "describe", "--archive", str(archive),
               "--id", name, "--root", name,
               "--repository", f"https://github.com/ahzs645/{name}",
               "--commit", commit]
    for part in parts:
        command.extend(["--part", str(part)])
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    entries.append(json.loads(result.stdout))
    upload_sources.extend(part.name for part in parts)

manifest = {
    "format": "unbc-continuation-source-v1",
    "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "archives": entries,
    "references": [{
        "id": "original-master-and-viewer",
        "url": "https://drive.google.com/drive/folders/1PdyETAWsVOPcPPC-RAOUSaJmqXEh-rWU",
        "download_automatically": False,
        "description": "Existing original master/model and historical viewer parts.",
        "restore_note": "Use the original archive-parts.json, restore_archives.py and recovery input guide."
    }]
}
with (release / "continuation-manifest.json").open("x", encoding="utf-8") as output:
    json.dump(manifest, output, indent=2, ensure_ascii=False)
    output.write("\n")
print(json.dumps({"upload_source_files": upload_sources}, indent=2))
PY
```

Keep the complete archives locally. Upload only the source files listed by that snippet, plus the final manifest, helper, schema, instructions, tests/receipt and the separately prepared qualification and recovery documents. Splitting avoids duplicate uploads of both a large whole archive and its parts. References to the original model/viewer parts remain in the manifest.

For an individual descriptor, `describe` is also available directly:

```sh
python3 restore-continuation.py describe \
  --archive /absolute/path/openindoormaps-FULL_COMMIT.tar.gz \
  --id openindoormaps --root openindoormaps \
  --repository https://github.com/ahzs645/openindoormaps \
  --commit FULL_COMMIT \
  --part /absolute/path/openindoormaps-FULL_COMMIT.tar.gz.part001 \
  --part /absolute/path/openindoormaps-FULL_COMMIT.tar.gz.part002
```

Repeat `--part` for **every** part in order. Omit all `--part` arguments for an unsplit archive. The command scans the archive without extracting it, verifies the commit header, checks the concatenated parts, and emits a real per-file inventory by default. `--without-inventory` is available but is not recommended for this handoff.

Before upload, run a real restore from the final manifest to a new empty directory. Record the helper's JSON receipt and verify that the restored source commit identities match the intended release. The small-fixture tests below are evidence about helper behavior; they do not replace this final archive restore.

## Run the small offline tests

```sh
python3 -m unittest discover -s /absolute/path/handoff-tools \
  -p 'test_restore_continuation.py' -v
```

The tests exercise split and unsplit restoration; exact content and executable modes; same-size part corruption; a wrong whole-archive hash; refusal to overwrite a different archive or nonempty destination; acceptance of an empty destination; traversal; links and special files; `.git` entries; changed/missing inventory records; wrong commit headers; and placeholder rejection. Test commit IDs and file contents are explicitly synthetic.

The helper, test suite and schema are local files. No upload, deployment, Git commit, dependency installation or original-model restoration is performed by the helper.
