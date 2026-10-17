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
      <p>
        Internal passage doors are omitted. Directions also check access and
        step-free availability.
      </p>
    </div>
  );
}
