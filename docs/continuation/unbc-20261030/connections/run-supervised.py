#!/usr/bin/env python3
"""Run one acceptance command and retain Linux kernel/cgroup measurements.

The cgroup belongs to the shared task, not just the child. Kernel child ru_maxrss
is collected after wait() and is distinct from that shared measurement. No /proc
PID inference or subprocess-command string matching is used.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import time


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def cgroup_values():
    root = Path("/sys/fs/cgroup")
    result = {}
    for name in ("memory.current", "memory.max"):
        path = root / name
        if path.exists():
            raw = path.read_text().strip()
            result[name] = int(raw) if raw.isdigit() else raw
    path = root / "memory.events"
    if path.exists():
        result["memory.events"] = {
            key: int(value) for key, value in
            (line.split() for line in path.read_text().splitlines())
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", required=True)
    parser.add_argument("--memory-log", required=True)
    parser.add_argument("--execution-report", required=True)
    parser.add_argument("--timeout-seconds", type=float, default=3600)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or args.timeout_seconds <= 0:
        parser.error("A command and positive timeout are required")
    paths = [Path(args.log), Path(args.memory_log), Path(args.execution_report)]
    if len({path.resolve() for path in paths}) != len(paths):
        parser.error("Use separate new evidence paths")
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            parser.error(f"Evidence path already exists: {path}")
    started_at, started = utc_now(), time.monotonic()
    before = cgroup_values()
    peak, samples, timed_out, interrupted = 0, 0, False, False
    with paths[0].open("xb") as log, paths[1].open("x") as memory:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        print(json.dumps({"status": "RUNNING", "pid": process.pid,
                          "startedAt": started_at, "log": str(paths[0])}), flush=True)
        try:
            while True:
                values = cgroup_values()
                current = values.get("memory.current")
                if isinstance(current, int):
                    peak = max(peak, current)
                memory.write(json.dumps({"elapsedSeconds": time.monotonic() - started,
                                         **values}) + "\n")
                memory.flush()
                samples += 1
                if process.poll() is not None:
                    break
                if time.monotonic() - started >= args.timeout_seconds:
                    timed_out = True
                    break
                time.sleep(1)
        except KeyboardInterrupt:
            interrupted = True
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
            exit_code = process.wait()
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    after = cgroup_values()
    events_before, events_after = before.get("memory.events", {}), after.get("memory.events", {})
    report = {
        "format": "supervised-candidate-execution-v1",
        "command": command,
        "workingDirectory": os.getcwd(),
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "seconds": time.monotonic() - started,
        "exitCode": exit_code,
        "timedOut": timed_out,
        "interrupted": interrupted,
        "kernelMaxChildRssKiB": usage.ru_maxrss,
        "kernelChildUserSeconds": usage.ru_utime,
        "kernelChildSystemSeconds": usage.ru_stime,
        "cgroupLimitBytes": before.get("memory.max"),
        "sampledSharedCgroupPeakBytes": peak,
        "sampleIntervalSeconds": 1,
        "samples": samples,
        "cgroupEventDeltas": {key: value - events_before.get(key, 0)
                              for key, value in events_after.items()},
        "measurementScope": "Linux child ru_maxrss after wait() is KiB. Shared task cgroup measurements include other processes and cache. No per-PID /proc reading is used as child RSS evidence.",
    }
    with paths[2].open("x") as target:
        json.dump(report, target, indent=2)
        target.write("\n")
    print(json.dumps(report), flush=True)
    return 124 if timed_out else 130 if interrupted else exit_code if exit_code >= 0 else 128 - exit_code


if __name__ == "__main__":
    raise SystemExit(main())
