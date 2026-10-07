import type { IndoorDataset, IndoorEdge, IndoorRecord } from "./contract";
import {
  connectionLevelChange,
  connectionName,
} from "./connection-presentation";

/** Informational selection of a stair area/connector is separate from choosing
 * a route destination or authoring a geometry repair. */
export function ConnectorDetails({
  data,
  room,
  edge,
}: {
  data: IndoorDataset;
  room?: IndoorRecord;
  edge?: IndoorEdge;
}) {
  const connections = edge
    ? [edge]
    : data.edges.filter(
        (e) =>
          (e.kind === "stairs" || e.kind === "local-steps") &&
          room &&
          e.roomKeys.includes(room.key),
      );
  const flights = room
    ? (data.stairDisplay?.flights.filter((f) => f.roomKey === room.key) ?? [])
    : [];
  return (
    <div>
      <h3>
        {room
          ? `Stairs · ${room.number || room.name}`
          : edge
            ? connectionName(edge)
            : "Connection"}
      </h3>
      {room && (
        <dl>
          <dt>Building / native level</dt>
          <dd>
            {room.building} · #{room.levelId} · {room.elevationFeet.toFixed(2)}{" "}
            ft
          </dd>
          <dt>Source area</dt>
          <dd>{room.key}</dd>
          <dt>Surface evidence</dt>
          <dd>{room.elevationEvidence}</dd>
        </dl>
      )}
      {!!flights.length && (
        <p>
          Measured source flights:{" "}
          {flights.map((f) => `#${f.stairElementId}`).join(", ")}.
        </p>
      )}
      {connections.length ? (
        connections.map((connection) => (
          <dl key={connection.id}>
            <dt>Movement</dt>
            <dd>{connectionLevelChange(data, connection)}</dd>
            <dt>Native element</dt>
            <dd>
              {connection.nativeElementId
                ? `#${connection.nativeElementId}`
                : "Not recorded"}
            </dd>
            <dt>Connection ID</dt>
            <dd>{connection.id}</dd>
            <dt>Evidence</dt>
            <dd>{connection.evidence}</dd>
            <dt>Routing</dt>
            <dd>
              {connection.enabled
                ? "Enabled connection; directions also check access and the selected route profile."
                : "Disabled connection."}
            </dd>
          </dl>
        ))
      ) : (
        <p>
          No confirmed route connection is associated with this stair area. Its
          outline identifies the landing or area beneath the flight.
        </p>
      )}
      {(room?.stair ||
        edge?.kind === "stairs" ||
        edge?.kind === "local-steps") && (
        <p>
          Stairs are excluded from wheelchair paths. Selecting this marker does
          not change access or routing.
        </p>
      )}
    </div>
  );
}
