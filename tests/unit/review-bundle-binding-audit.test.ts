import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { project } from "../fixtures/native-area-project";
import { readIndoorProject } from "../../app/indoor-project/package";
import { REVIEW_BUNDLE_ARCHIVE_PATH } from "../../app/indoor-project/review-bundle-wire";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
test("a legacy companion cannot masquerade as a bound binary archive reference", async () => {
  const p = await project();
  const rooms = strToU8(
    JSON.stringify({
      ...p.rooms,
      reviewBundle: {
        version: 1,
        masterSha256: "a".repeat(64),
        files: [],
        // Valid legacy schema, but none of the binary reference/codec metadata.
        format: "legacy-placeholder",
        storage: "archive-entry",
        path: "other.bin",
      },
    }),
  );
  const d = structuredClone(p.dataset);
  d.source.roomsSha256 = sha(rooms);
  const indoor = strToU8(JSON.stringify(d)),
    archive = new Uint8Array([1, 2, 3]);
  const m = structuredClone(p.manifest) as any;
  m.floors = {
    path: "floors/rooms.json",
    bytes: rooms.length,
    sha256: sha(rooms),
  };
  m.indoor = {
    path: "viewer/indoor.json",
    bytes: indoor.length,
    sha256: sha(indoor),
  };
  m.reviewBundle = {
    path: REVIEW_BUNDLE_ARCHIVE_PATH,
    bytes: archive.length,
    sha256: sha(archive),
  };
  const bytes = zipSync({
    ...p.files,
    "manifest.json": strToU8(JSON.stringify(m)),
    "floors/rooms.json": rooms,
    "viewer/indoor.json": indoor,
    [REVIEW_BUNDLE_ARCHIVE_PATH]: archive,
  });
  await assert.rejects(readIndoorProject(bytes), /binding|container|reference/);
});

test("legacy review verification rejects an expanding stream masquerading as an empty companion", async () => {
  const { deflateSync } = await import("fflate");
  const { verifyReviewBundle } = await import(
    "../../app/indoor-project/review-bundle"
  );
  const compressed = deflateSync(new Uint8Array(2 * 1024 * 1024));
  await assert.rejects(
    verifyReviewBundle({
      version: 1,
      masterSha256: "a".repeat(64),
      files: [
        {
          path: "review/claimed-empty.txt",
          bytes: 0,
          sha256: sha(new Uint8Array()),
          compressedBase64: Buffer.from(compressed).toString("base64"),
        },
      ],
    }),
    /expansion|companion|length|size|deflate|stream/i,
  );
});

test("sibling package reader and writer verify legacy companion hashes independently of ZIP entry hashes", async () => {
  const { deflateSync, unzipSync, strFromU8 } = await import("fflate");
  const { createProjectPackage, readProjectPackage } = await import(
    "../../../reviter/lib/reviter/project-package"
  );
  const content = strToU8("Original companion evidence");
  const rooms = {
    format: "reviter-room-annotations" as const,
    version: 1 as const,
    coordinateSystem: "revit-model-feet" as const,
    model: { fileName: "Audit.rvt" },
    annotations: [
      {
        key: "a",
        levelId: 1,
        confidence: 1,
        labelPointFeet: [5, 5] as [number, number],
        polygonFeet: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ] as [number, number][],
      },
    ],
    reviewBundle: {
      version: 1,
      masterSha256: "a".repeat(64),
      files: [
        {
          path: "review/evidence.txt",
          bytes: content.length,
          sha256: sha(content),
          compressedBase64: Buffer.from(deflateSync(content)).toString(
            "base64",
          ),
        },
      ],
    },
  };
  const model = new File([new Uint8Array([1, 2, 3])], "Audit.rvt", {
    lastModified: 1,
  });
  const files = unzipSync(await createProjectPackage(model, rooms));
  const bad = structuredClone(rooms);
  bad.reviewBundle.files[0].sha256 = "b".repeat(64);
  await assert.rejects(
    createProjectPackage(model, bad),
    /checksum|damaged|companion|container/i,
  );
  files["floors/rooms.json"] = strToU8(JSON.stringify(bad));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  manifest.floors.bytes = files["floors/rooms.json"].length;
  manifest.floors.sha256 = sha(files["floors/rooms.json"]);
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  await assert.rejects(
    readProjectPackage(zipSync(files)),
    /checksum|damaged|companion|container/i,
  );
});
