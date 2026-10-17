/** Exact post-compilation projection amendment. This retains already-bound
 * original cells; it changes neither a source proof nor a physical cell digest.
 * Keeping this as an exact byte transform prevents a general frozen-file waiver. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const opening = "export function routeWorkerDataset(data: IndoorDataset): IndoorDataset {\n";
const oldCells = `            cells: data.circulationGeometry.cells.map(
              ({ containedDisplay: _, ...cell }) => cell,
            ),`;
const newCells = `            cells: data.circulationGeometry.cells.map((cell) => {
              if (steppedApproachCellIds.has(cell.id)) return cell;
              const { containedDisplay: _, ...physical } = cell;
              return physical;
            }),`;
const lookup = `  const steppedApproachCellIds = new Set(
    data.edges.flatMap(
      (edge) => edge.nativeSteppedStairV2?.terminalApproaches.map(
        (approach) => approach.nativeCellId,
      ) ?? [],
    ),
  );
`;
export function exactSteppedWorkerProjectionAmendment(original: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(original);
  for (const operand of [opening, oldCells])
    assert.equal(text.split(operand).length, 2,
      "The original worker projection must have one exact reviewed transformation site");
  assert(!text.includes("steppedApproachCellIds"), "The original projection was already amended");
  return new TextEncoder().encode(text.replace(opening, opening + lookup).replace(oldCells, newCells));
}
export function verifyExactSteppedWorkerProjectionAmendment(options: {
  original: Uint8Array;
  current: Uint8Array;
  expectedOriginalSha256: string;
  expectedCurrentSha256: string;
}) {
  assert.equal(hash(options.original), options.expectedOriginalSha256,
    "Historical projection differs from the frozen compiler closure");
  assert.equal(hash(options.current), options.expectedCurrentSha256,
    "Current projection differs from the explicit downstream amendment");
  assert.deepEqual(options.current, exactSteppedWorkerProjectionAmendment(options.original),
    "Projection amendment contains changes beyond retaining exact proof-bound cells");
  return { originalSha256: options.expectedOriginalSha256, currentSha256: options.expectedCurrentSha256,
    exactProofBoundCellRetentionOnly: true, originalPhysicalDigestsAndProofsUnchanged: true,
    requiresFreshWorkerProjectionCacheEngineAndAdmission: true, originalSourceAuthorityGranted: false };
}
