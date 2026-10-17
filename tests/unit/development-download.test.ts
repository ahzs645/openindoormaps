import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildDevelopmentDownload,
  validateDevelopmentSnapshot,
  type DevelopmentSnapshot,
} from "../../app/indoor-project/development-download";
import { hostedDevelopmentOffer } from "../../app/indoor-project/hosted-project";
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const base = "https://maps.example.test/data/unbc-development/manifest.json";
function fixture() {
  const blobs = new Map<string, Uint8Array>();
  const source = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
  const viewer = new Uint8Array([80, 75, 3, 4]);
  const repositories = (["openindoormaps", "reviter"] as const).map(
    (name, i) => {
      const b = source[i],
        sha256 = hash(b),
        path = `parts/${sha256}.bin`;
      blobs.set(new URL(path, base).href, b);
      return {
        name,
        commit: String(i + 1).repeat(40),
        branch: "test",
        repositoryUrl: `https://github.com/ahzs645/${name}`,
        sha256,
        bytes: b.length,
        parts: [{ path, sha256, bytes: b.length }],
      };
    },
  );
  const snapshot: DevelopmentSnapshot = {
    format: "openindoormaps-development-v1",
    version: 1,
    releaseId: "a".repeat(12),
    createdAt: new Date().toISOString(),
    fileName: `UNBC.development-${"a".repeat(12)}.zip`,
    viewer: {
      manifestPath: "/data/unbc-full/project.json",
      sha256: hash(viewer),
      bytes: viewer.length,
    },
    repositories,
    nativeRebuildReady: false,
    missingInputs: [{ name: "Native inputs", reason: "Not present" }],
    readme: "Missing authoring inputs",
    restoreScript: "# restore",
  };
  const manifest = {
    format: "openindoormaps-hosted-project-v1",
    version: 1,
    fileName: "map.zip",
    bytes: viewer.length,
    sha256: hash(viewer),
    parts: [
      {
        path: `parts/${hash(viewer)}.bin`,
        sha256: hash(viewer),
        bytes: viewer.length,
      },
    ],
    developmentSnapshot: "/data/unbc-development/manifest.json",
  };
  blobs.set(
    `https://maps.example.test/data/unbc-full/parts/${hash(viewer)}.bin`,
    viewer,
  );
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    const url = String(input);
    requests.push(url);
    if (url === base) return Response.json(snapshot);
    if (url.endsWith("/unbc-full/project.json")) return Response.json(manifest);
    const bytes = blobs.get(url);
    return bytes
      ? new Response(new Uint8Array(bytes).buffer)
      : new Response(null, { status: 404 });
  }) as typeof fetch;
  return { snapshot, manifest, fetcher, requests, blobs, source, viewer };
}
test("development download verifies sources and exact visitor without geometry preparation", async () => {
  const f = fixture();
  const offer = await hostedDevelopmentOffer(
    "https://maps.example.test/data/unbc-full/project.json",
    new AbortController().signal,
    f.fetcher,
  );
  assert.equal(offer?.url, base);
  assert.equal(f.requests.length, 1);
  const result = await buildDevelopmentDownload(base, offer!.viewerSha256, {
    signal: new AbortController().signal,
    fetcher: f.fetcher,
  });
  const files = unzipSync(result.bytes);
  assert.equal(Object.keys(files).length, 6);
  assert.deepEqual(files["data/UNBC.campus-viewer.zip"], f.viewer);
  for (const [i, name] of ["openindoormaps", "reviter"].entries())
    assert.deepEqual(files[`sources/${name}.source.tar.xz`], f.source[i]);
  assert.equal(
    JSON.parse(strFromU8(files["RELEASE.json"])).nativeRebuildReady,
    false,
  );
  assert.equal(hash(result.bytes), result.sha256);
});
test("changed publication and corrupt source parts cannot produce a development ZIP", async () => {
  const f = fixture();
  await assert.rejects(
    buildDevelopmentDownload(base, "f".repeat(64), {
      signal: new AbortController().signal,
      fetcher: f.fetcher,
    }),
    /another map release/,
  );
  f.blobs.set(
    new URL(f.snapshot.repositories[0].parts[0].path, base).href,
    new Uint8Array([9, 9, 9]),
  );
  await assert.rejects(
    buildDevelopmentDownload(base, f.manifest.sha256, {
      signal: new AbortController().signal,
      fetcher: f.fetcher,
    }),
    /checksum/,
  );
  const changed = fixture();
  changed.manifest.sha256 = "b".repeat(64);
  await assert.rejects(
    buildDevelopmentDownload(base, changed.snapshot.viewer.sha256, {
      signal: new AbortController().signal,
      fetcher: changed.fetcher,
    }),
    /checksum|changed/,
  );
});
test("download validation refuses path escapes, false completeness, size mismatch and foreign offers", async () => {
  for (const edit of [
    (d: DevelopmentSnapshot) => {
      d.repositories[0].parts[0].path = "../escape";
    },
    (d: DevelopmentSnapshot) => {
      d.nativeRebuildReady = true;
      d.missingInputs = [];
    },
    (d: DevelopmentSnapshot) => {
      d.repositories[0].bytes++;
    },
  ]) {
    const f = fixture();
    edit(f.snapshot);
    assert.throws(() => validateDevelopmentSnapshot(f.snapshot));
  }
  const f = fixture();
  f.manifest.developmentSnapshot = "https://foreign.example/manifest.json";
  await assert.rejects(
    hostedDevelopmentOffer(
      "https://maps.example.test/data/unbc-full/project.json",
      new AbortController().signal,
      f.fetcher,
    ),
    /own origin/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    buildDevelopmentDownload(base, f.manifest.sha256, {
      signal: controller.signal,
      fetcher: f.fetcher,
    }),
    /abort/i,
  );
});
