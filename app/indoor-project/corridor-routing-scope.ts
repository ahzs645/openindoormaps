import type { IndoorDataset, IndoorEdge } from "./contract";

/** Index the complete original source graph before selecting emitted guides.
 * A building, a displayed floor or an edge replay must not truncate a cell's
 * terminal set. Eligibility proposes geometry; it grants no route permission.
 */
export function indexCorridorRoutingScope(data: IndoorDataset) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const records = new Map(data.records.map((record) => [record.key, record]));
  const edgesByCell = new Map<string, IndoorEdge[]>();
  const doorsByNode = new Map<string, IndoorEdge>();
  const eligible: IndoorEdge[] = [];
  const ineligibleReasons = new Map<string, string>();
  for (const edge of [...data.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const reject = (reason: string) => ineligibleReasons.set(edge.id, reason);
    if (!edge.enabled) {
      reject("disabled-source-edge");
      continue;
    }
    if (edge.kind === "door") {
      for (const id of [edge.from, edge.to])
        if (!doorsByNode.has(id)) doorsByNode.set(id, edge);
    }
    if (edge.kind !== "walk") {
      reject("non-walking-source-edge");
      continue;
    }
    if (!edge.nativeCellId) {
      reject("missing-native-cell");
      continue;
    }
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) {
      reject("unknown-source-terminal");
      continue;
    }
    if (a.levelId !== b.levelId || a.pointFeet[2] !== b.pointFeet[2]) {
      reject("different-physical-levels");
      continue;
    }
    if (!edge.pointsFeet.every((point) => point[2] === a.pointFeet[2])) {
      reject("nonplanar-source-edge");
      continue;
    }
    if (
      ![a, b].every((node) => {
        const owner = records.get(node.roomKey);
        return owner?.circulation && owner.walkable && owner.access !== "staff";
      })
    ) {
      reject("ineligible-terminal-owner");
      continue;
    }
    eligible.push(edge);
    const edges = edgesByCell.get(edge.nativeCellId) ?? [];
    edges.push(edge);
    edgesByCell.set(edge.nativeCellId, edges);
  }
  return {
    nodes,
    records,
    eligible,
    edgesByCell,
    doorsByNode,
    ineligibleReasons,
  };
}

/** Complete inventory, including areas the initial compiler predicate omits.
 * These reason codes explain selection, not source qualification or an access
 * decision. Unrepresented source planes remain a review obligation.
 */
export function corridorRoutingCoverage(
  data: IndoorDataset,
  scope = indexCorridorRoutingScope(data),
) {
  const walksByCell = new Map<string, IndoorEdge[]>();
  for (const edge of data.edges) {
    if (edge.kind !== "walk" || !edge.nativeCellId) continue;
    const walks = walksByCell.get(edge.nativeCellId) ?? [];
    walks.push(edge);
    walksByCell.set(edge.nativeCellId, walks);
  }
  const cells = data.circulationGeometry?.cells ?? [];
  const targetOwners = new Set(
    cells
      .filter((cell) => scope.edgesByCell.has(cell.id))
      .flatMap((cell) => cell.roomKeys),
  );
  const circulationCells = cells
    .filter((cell) =>
      cell.roomKeys.some((key) => scope.records.get(key)?.circulation),
    )
    .sort(
      (a, b) => a.elevationFeet - b.elevationFeet || a.id.localeCompare(b.id),
    )
    .map((cell) => {
      const edges = scope.edgesByCell.get(cell.id) ?? [];
      const walks = walksByCell.get(cell.id) ?? [];
      const circulationRoomKeys = cell.roomKeys
        .filter((key) => scope.records.get(key)?.circulation)
        .sort();
      return {
        cellId: cell.id,
        elevationFeet: cell.elevationFeet,
        levelIds: [...cell.levelIds].sort((a, b) => a - b),
        circulationRoomKeys,
        eligibleEdges: edges.length,
        originalWalkingEdges: walks.length,
        enabledWalkingEdges: walks.filter((edge) => edge.enabled).length,
        terminalCount: new Set(edges.flatMap((edge) => [edge.from, edge.to]))
          .size,
        selectionReason:
          edges.length > 0
            ? "initial-target"
            : walks.length === 0
              ? "no-original-walking-edge"
              : "no-eligible-original-walking-edge",
        sharesTargetCirculationIdentity: circulationRoomKeys.some((key) =>
          targetOwners.has(key),
        ),
        reviewRequired: edges.length === 0,
      };
    });
  const levels = [...(data.nativePhysicalLevels?.levels ?? [])]
    .sort(
      (a, b) =>
        a.elevationFeet - b.elevationFeet || a.nativeLevelId - b.nativeLevelId,
    )
    .map((level) => ({
      ...level,
      compiledCells: cells.filter(
        (cell) => cell.elevationFeet === level.elevationFeet,
      ).length,
      targetCells: circulationCells.filter(
        (cell) =>
          cell.elevationFeet === level.elevationFeet && cell.eligibleEdges > 0,
      ).length,
      reviewRequired: !cells.some(
        (cell) => cell.elevationFeet === level.elevationFeet,
      ),
    }));
  return {
    physicalCells: cells.length,
    initialTargetCells: scope.edgesByCell.size,
    eligibleOriginalEdges: scope.eligible.length,
    eligibleOriginalTerminals: new Set(
      scope.eligible.flatMap((edge) => [edge.from, edge.to]),
    ).size,
    circulationCells,
    levels,
  };
}
