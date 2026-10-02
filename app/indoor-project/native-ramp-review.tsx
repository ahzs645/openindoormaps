import type { IndoorDataset } from "./contract";

type Ramp = NonNullable<IndoorDataset["rampDisplay"]>["ramps"][number];
export function NativeRampReview({
  data,
  onLocate,
}: {
  data: IndoorDataset;
  onLocate: (ramp: Ramp) => void;
}) {
  const ramps = data.rampDisplay?.ramps ?? [];
  if (ramps.length === 0) return null;
  return (
    <section>
      <h2>Native ramps</h2>
      <details>
        <summary>
          {ramps.length} ramps · {ramps.filter((r) => r.displayOnly).length}{" "}
          entrance reviews
        </summary>
        <p>
          Each source ramp is shown once with its measured slope and platform in
          relative 3D.
        </p>
        {ramps.map((r) => {
          const z = r.trianglesFeet.flat().map((p) => p[2]);
          const rise =
            (Math.max(...z) - Math.min(...z)) *
            data.alignment.verticalMetresPerFoot;
          return (
            <button
              className="project-search-item project-native-ramp-item"
              key={r.nativeElementId}
              aria-label={`Show native ramp #${r.nativeElementId}`}
              onClick={() => onLocate(r)}
            >
              <strong>Ramp #{r.nativeElementId}</strong>
              <small>
                {rise.toFixed(2)} m rise ·{" "}
                {r.displayOnly
                  ? "Entrance connection needs review"
                  : "Reviewed route connection"}
              </small>
            </button>
          );
        })}
      </details>
    </section>
  );
}
