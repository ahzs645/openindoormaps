export function HallwayPathLegend() {
  return (
    <div className="project-path-legend" aria-label="Hallway path legend">
      <span>
        <i className="project-path-trunk" />
        Shared hallway guide
      </span>
      <span>
        <i className="project-path-approach" />
        Room door approach
      </span>
      <span>
        <i className="project-path-transition" />
        Lift, ramp or stair connection
      </span>
      <span>Gray lines: saved paths without a shared guide.</span>
      <span>Red stops: a saved walking approach is missing.</span>
      <p>
        Passage and landing approaches are solid. Directions check access and
        clearance. Held stair links remain unavailable for directions.
      </p>
    </div>
  );
}
