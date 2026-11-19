"""Portable fallback for copying a live compiler checkpoint tree to durable storage."""
import os
from pathlib import Path
import shutil
import sys
from tempfile import NamedTemporaryFile


def copy_tree(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    for path in source.rglob("*"):
        if ".tmp-" in path.name or path.name.startswith(".sync-") or not path.is_file():
            continue
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Immutable snapshots are large. Landing journals, in contrast, grow
        # under the same filename. Copy the opened file to a temporary sibling
        # so an interrupted transfer leaves the last complete snapshot usable.
        with path.open("rb") as reader:
            src = os.fstat(reader.fileno())
            if target.exists():
                dst = target.stat()
                if (src.st_size, src.st_mtime_ns) == (dst.st_size, dst.st_mtime_ns):
                    continue
            temp = None
            try:
                with NamedTemporaryFile(dir=target.parent, prefix=".sync-", delete=False) as writer:
                    temp = Path(writer.name)
                    shutil.copyfileobj(reader, writer, length=1024 * 1024)
                os.utime(temp, ns=(src.st_atime_ns, src.st_mtime_ns))
                os.replace(temp, target)
            finally:
                if temp is not None:
                    temp.unlink(missing_ok=True)


if __name__ == "__main__":
    copy_tree(Path(sys.argv[1]), Path(sys.argv[2]))
