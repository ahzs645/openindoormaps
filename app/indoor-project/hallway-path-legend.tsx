export function HallwayPathLegend() {
  return (
    <div className="project-path-legend" aria-label="Hallway path legend">
      <span>
        <i className="project-path-trunk" />
        Hallway centerline
      </span>
      <span>
        <i className="project-path-approach" />
        Room door approach
      </span>
      <span>
        <i className="project-path-transition" />
        Lift, ramp or stair connection
      </span>
      <p>
        Passage connections are solid. Directions check access and clearance.
        Held stair links remain unavailable for directions.
      </p>
    </div>
  );
}
