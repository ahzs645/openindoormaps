export function HallwayPathLegend() {
  return (
    <div className="project-path-legend" aria-label="Hallway path legend">
      <span>
        <i className="project-path-trunk" />
        Hallway centerline
      </span>
      <span>
        <i className="project-path-approach" />
        Door approach
      </span>
      <p>
        Prepared guides on this floor. Directions also check access and
        step-free availability.
      </p>
    </div>
  );
}
