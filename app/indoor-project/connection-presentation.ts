import type { IndoorDataset, IndoorEdge } from "./contract";

export function connectionName(edge: IndoorEdge): string {
  if (edge.kind === "local-steps") return "Local steps";
  if (edge.kind === "stairs") return "Stairs";
  if (edge.kind === "ramp") return "Ramp";
  return edge.kind.charAt(0).toUpperCase() + edge.kind.slice(1);
}

export function connectionAreaName(data: IndoorDataset, key: string): string {
  const room = data.records.find((r) => r.key === key);
  if (room?.number) return room.number;
  if (room && key.startsWith("landing:"))
    return `Building ${room.building} landing (generated; no source room outline)`;
  return room?.name || key;
}

export function connectionLevelChange(
  data: IndoorDataset,
  edge: IndoorEdge,
): string {
  const from = data.nodes.find((n) => n.id === edge.from)!;
  const to = data.nodes.find((n) => n.id === edge.to)!;
  const rise =
    Math.abs(to.pointFeet[2] - from.pointFeet[2]) *
    data.alignment.verticalMetresPerFoot;
  const floor = data.floors.find(
    (f) => f.levelIds.includes(from.levelId) && f.levelIds.includes(to.levelId),
  );
  return `${rise.toFixed(2)} m elevation change${floor ? ` within ${floor.name}` : " between floors"}`;
}

export function rampSourceSlope(edge: IndoorEdge): number | undefined {
  if (edge.kind !== "ramp") return undefined;
  const slopes = edge.pointsFeet.slice(1).map((p, i) => {
    const a = edge.pointsFeet[i],
      run = Math.hypot(p[0] - a[0], p[1] - a[1]);
    return run > 0.001 ? (Math.abs(p[2] - a[2]) / run) * 100 : 0;
  });
  return Math.max(0, ...slopes);
}
