#!/usr/bin/env python3
"""Save exact command output, exit status, elapsed time and child peak RSS."""
import argparse
import datetime
import json
import os
from pathlib import Path
import resource
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
parser.add_argument("--cwd", required=True)
parser.add_argument("--env", action="append", default=[])
parser.add_argument("--unset", action="append", default=[])
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ["--"] else args.command
if not command:
    parser.error("a command is required")
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
environment = os.environ.copy()
overrides = {}
for name in args.unset:
    environment.pop(name, None)
    overrides[name] = None
for pair in args.env:
    name, value = pair.split("=", 1)
    environment[name] = value
    overrides[name] = value
start = time.monotonic()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
with output.with_suffix(".log").open("x") as log:
    result = subprocess.run(command, cwd=args.cwd, env=environment,
                            stdout=log, stderr=subprocess.STDOUT)
receipt = {
    "schemaVersion": 1,
    "startedAt": started,
    "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "cwd": str(Path(args.cwd).resolve()),
    "command": command,
    "environmentOverrides": overrides,
    "exitCode": result.returncode,
    "seconds": time.monotonic() - start,
    "peakRssKiB": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
    "log": output.with_suffix(".log").name,
}
output.with_suffix(".json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
with output.with_suffix(".log").open("rb") as log:
    log.seek(0, 2)
    log.seek(max(0, log.tell() - 12000))
    print(log.read().decode("utf-8", errors="replace"))
raise SystemExit(result.returncode if result.returncode >= 0 else 128-result.returncode)
