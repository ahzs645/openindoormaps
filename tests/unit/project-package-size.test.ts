import assert from "node:assert/strict";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";
import { readIndoorProject } from "../../app/indoor-project/package";

// Exercise the ZIP preflight without allocating or inflating huge payloads.
function declaredSize(name: string, bytes: number): Uint8Array {
  const zip = zipSync({ [name]: strToU8("{}") }, { level: 0 });
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = 0; i + 46 <= zip.length; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, bytes, true);
      return zip;
    }
  throw new Error("Missing central directory");
}
test("native dataset entry permits the new bounded range before manifest validation", async () => {
  await assert.rejects(
    readIndoorProject(declaredSize("viewer/indoor.json", 137_323_822)),
    /Missing Reviter manifest/,
  );
  await assert.rejects(
    readIndoorProject(declaredSize("viewer/indoor.json", 192 * 1024 * 1024)),
    /Missing Reviter manifest/,
  );
});
test("native dataset and other entry caps still reject oversized ZIP declarations", async () => {
  await assert.rejects(
    readIndoorProject(
      declaredSize("viewer/indoor.json", 192 * 1024 * 1024 + 1),
    ),
    /oversized ZIP entry/,
  );
  await assert.rejects(
    readIndoorProject(declaredSize("floors/rooms.json", 64 * 1024 * 1024 + 1)),
    /oversized ZIP entry/,
  );
  await assert.rejects(
    readIndoorProject(declaredSize("unexpected.json", 2)),
    /oversized ZIP entry/,
  );
});
