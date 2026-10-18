/** Geometry experiment only: these proposals never add graph links, confer
 * access, replace original terminals or issue a route-validation receipt.
 * Candidate runs must come from the corridor's physical free space. A caller
 * supplies its continuous support predicate; there is deliberately no permissive
 * default. Production adoption also needs full-width/material/door/policy replay.
 */
export type Point = [number, number, number];
export type CorridorRun = {
  id: string;
  levelId: number;
  roomKeys: string[];
  pointsFeet: Point[];
};
export type CorridorTerminal = {
  nodeId: string;
  entranceEdgeId: string;
  roomKey: string;
  levelId: number;
  pointFeet: Point;
};

export function proposeCorridorBackbone(
  runs: readonly CorridorRun[],
  terminals: readonly CorridorTerminal[],
  supported: (path: Point[], terminal?: CorridorTerminal) => boolean,
) {
  const pointValid = (p: Point) => p.length === 3 && p.every(Number.isFinite);
  const ids = new Set<string>();
  const accepted = runs.filter((run) => {
    if (ids.has(run.id)) throw new Error("Duplicate corridor run identity");
    ids.add(run.id);
    return (
      run.roomKeys.length > 0 &&
      run.pointsFeet.length >= 2 &&
      run.pointsFeet.length <= 10_000 &&
      run.pointsFeet.every(
        (p) => pointValid(p) && p[2] === run.pointsFeet[0][2],
      ) &&
      supported(run.pointsFeet.map((p) => [...p]))
    );
  });
  const branchIds = new Set<string>();
  const branches: {
    nodeId: string;
    entranceEdgeId: string;
    runId: string;
    segmentIndex: number;
    fraction: number;
    pointsFeet: Point[];
    lengthFeet: number;
  }[] = [];
  const unattached: { nodeId: string; reason: string }[] = [];
  for (const terminal of terminals) {
    if (branchIds.has(terminal.nodeId))
      throw new Error("Duplicate corridor terminal identity");
    branchIds.add(terminal.nodeId);
    if (!pointValid(terminal.pointFeet)) {
      unattached.push({ nodeId: terminal.nodeId, reason: "invalid-terminal" });
      continue;
    }
    const candidates = accepted
      .flatMap((run) => {
        if (
          run.levelId !== terminal.levelId ||
          !run.roomKeys.includes(terminal.roomKey) ||
          run.pointsFeet[0][2] !== terminal.pointFeet[2]
        )
          return [];
        return run.pointsFeet.slice(1).flatMap((b, i) => {
          const a = run.pointsFeet[i];
          const dx = b[0] - a[0],
            dy = b[1] - a[1];
          const length2 = dx * dx + dy * dy;
          if (length2 === 0) return [];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((terminal.pointFeet[0] - a[0]) * dx +
                (terminal.pointFeet[1] - a[1]) * dy) /
                length2,
            ),
          );
          const join: Point = [a[0] + dx * t, a[1] + dy * t, a[2]];
          return [
            {
              runId: run.id,
              segmentIndex: i,
              fraction: t,
              pointsFeet: [[...terminal.pointFeet], join] as Point[],
              lengthFeet: Math.hypot(
                join[0] - terminal.pointFeet[0],
                join[1] - terminal.pointFeet[1],
              ),
            },
          ];
        });
      })
      .sort(
        (a, b) =>
          a.lengthFeet - b.lengthFeet ||
          (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0) ||
          a.segmentIndex - b.segmentIndex,
      );
    // A closer projection may cross an island/wall. Try the next supported
    // segment without moving the original doorway or borrowing another owner.
    const branch = candidates.find((candidate) =>
      supported(
        candidate.pointsFeet.map((p) => [...p]),
        terminal,
      ),
    );
    if (branch)
      branches.push({
        nodeId: terminal.nodeId,
        entranceEdgeId: terminal.entranceEdgeId,
        ...branch,
      });
    else
      unattached.push({
        nodeId: terminal.nodeId,
        reason:
          candidates.length > 0
            ? "unsupported-door-approach"
            : "no-compatible-run",
      });
  }
  return {
    status: "proposal-only" as const,
    graphChanged: false as const,
    runs: accepted.map((run) => ({
      ...run,
      roomKeys: [...run.roomKeys],
      pointsFeet: run.pointsFeet.map((p): Point => [...p]),
    })),
    refusedRunIds: runs
      .filter((run) => !accepted.includes(run))
      .map((run) => run.id),
    branches,
    unattached,
  };
}
