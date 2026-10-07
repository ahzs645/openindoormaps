import type { IndoorDataset } from "./contract";
import type { PinComparisonResult } from "./pin-comparison";
import { coloredComparisonRegions } from "./patch-comparison-colors";

export function PatchComparisonLegend({
  data,
  result,
  after,
}: {
  data: IndoorDataset;
  result: PinComparisonResult;
  after: boolean;
}) {
  const regions = coloredComparisonRegions(result, after);
  return (
    <section aria-label="Patch room colors" className="patch-comparison-legend">
      <strong>
        {after ? "After patch" : "Before patch"} · {regions.length} connected{" "}
        {regions.length === 1 ? "area" : "areas"}
      </strong>
      <p>
        Each color is one connected native area. Multiple labels in one color remain
        connected.
      </p>
      <ul>
        {regions.map(({ region, color }) => (
          <li key={region.id}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                background: color,
                border: "1px solid #444",
                marginRight: 8,
              }}
            />
            {region.roomKeys
              .map((k) => data.records.find((r) => r.key === k)?.number || k)
              .join(" / ") || "Unlabelled area"}
            {region.roomKeys.length > 1 ? " · still shared" : ""} ·{" "}
            {Math.round(region.areaSquareFeet)} sq ft
          </li>
        ))}
      </ul>
      {result.beforeAppliedPatch && !after && (
        <p>
          Reconstructed before view: only the selected applied patch is
          temporarily omitted. Saved geometry stays unchanged.
        </p>
      )}
    </section>
  );
}
