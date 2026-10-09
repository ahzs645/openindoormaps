import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "fflate";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import {
  packRoomNativeMaterials,
  hydrateRoomNativeMaterials,
} from "../../app/indoor-project/native-material-wire";

test("large exact native materials survive bounded archive packing without coordinate changes", async () => {
  const descriptor = {
    version: 1 as const,
    sourceModelSha256: "a".repeat(64),
    geometrySha256: "",
    levels: [
      {
        levelId: 311,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [7],
        sections: [
          {
            nativeElementId: 7,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 9,
            partsFeet: [
              [
                [
                  [0.123456789012345, 0],
                  [2, 0],
                  [2, 1],
                  [0.123456789012345, 1],
                ],
              ],
            ] as [number, number][][][],
          },
        ],
      },
    ],
    sourceEvidence: "original source provenance\n".repeat(700000),
  };
  descriptor.geometrySha256 = await nativeMaterialSectionsHash(descriptor);
  const rooms = {
    nativeMaterialSections: descriptor,
    annotations: [{ key: "identity-only" }],
  };
  const original = JSON.stringify(rooms);
  const packed = await packRoomNativeMaterials(rooms);
  assert.ok(JSON.stringify(packed).length < original.length / 10);
  assert.equal(
    JSON.stringify(await hydrateRoomNativeMaterials(packed)),
    original,
  );
  assert.equal(JSON.stringify(rooms), original);
  const wire = structuredClone(packed) as unknown as {
    nativeMaterialSections: {
      bytes: number;
      sha256: string;
      compressedBase64: string;
    };
  };
  wire.nativeMaterialSections.bytes = 64 * 1024 * 1024 + 1;
  await assert.rejects(
    hydrateRoomNativeMaterials(wire),
    /Invalid packed native/,
  );
  wire.nativeMaterialSections.bytes = JSON.stringify(descriptor).length - 1;
  await assert.rejects(
    hydrateRoomNativeMaterials(wire),
    /Invalid packed review/,
  );
  wire.nativeMaterialSections.bytes = JSON.stringify(descriptor).length;
  wire.nativeMaterialSections.sha256 = "c".repeat(64);
  await assert.rejects(
    hydrateRoomNativeMaterials(wire),
    /Invalid packed native/,
  );
  const altered = structuredClone(descriptor);
  altered.levels[0].sections[0].partsFeet[0][0][0][0] = 0.5;
  const bytes = new TextEncoder().encode(JSON.stringify(altered));
  wire.nativeMaterialSections.bytes = bytes.length;
  wire.nativeMaterialSections.sha256 = createHash("sha256")
    .update(bytes)
    .digest("hex");
  wire.nativeMaterialSections.compressedBase64 = Buffer.from(
    deflateSync(bytes),
  ).toString("base64");
  await assert.rejects(
    hydrateRoomNativeMaterials(wire),
    /material checksum changed/,
  );
});

test("legacy small material JSON and metadata are untouched", async () => {
  const rooms = { annotations: [{ key: "old-identity" }] };
  assert.equal(await packRoomNativeMaterials(rooms), rooms);
  assert.equal(await hydrateRoomNativeMaterials(rooms), rooms);
});
