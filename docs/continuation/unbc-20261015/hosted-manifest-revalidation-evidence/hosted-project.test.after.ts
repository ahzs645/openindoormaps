import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchHostedProject } from "../../app/indoor-project/hosted-project";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const pieces = [new Uint8Array([80, 75, 3]), new Uint8Array([4, 5, 6])];
  const bytes = new Uint8Array(pieces.flatMap((p) => [...p]));
  const manifest = {
    version: 1,
    format: "openindoormaps-hosted-project-v1",
    fileName: "map.zip",
    bytes: bytes.length,
    sha256: hash(bytes),
    parts: pieces.map((p) => ({
      path: `parts/${hash(p)}.bin`,
      bytes: p.length,
      sha256: hash(p),
    })),
  };
  const requests: string[] = [];
  const requestOptions: (RequestInit | undefined)[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    requestOptions.push(init);
    if (url.endsWith("project.json")) return Response.json(manifest);
    const index = manifest.parts.findIndex((p) => url.endsWith(p.path));
    return index < 0
      ? new Response(null, { status: 404 })
      : new Response(pieces[index]);
  }) as typeof fetch;
  return { manifest, bytes, pieces, requests, requestOptions, fetcher };
}
const url = "https://maps.example.test/campus/project.json";
test("revalidates the mutable manifest while retaining content-addressed part and verified ZIP behavior", async () => {
  for (const savedZip of [false, true]) {
    const f = fixture();
    const controller = new AbortController();
    const progress: number[] = [];
    const result = await fetchHostedProject(url, {
      signal: controller.signal,
      fetcher: f.fetcher,
      cachedBytes: savedZip ? f.bytes : undefined,
      onProgress: (received) => progress.push(received),
    });
    assert.equal(f.requests[0], url);
    assert.equal(f.requestOptions[0]?.cache, "no-cache");
    assert.ok(
      f.requestOptions.every((init) => init?.signal === controller.signal),
    );
    assert.ok(f.requestOptions.slice(1).every((init) => init?.cache === undefined));
    assert.equal(result.cached, savedZip);
    assert.deepEqual(result.bytes, f.bytes);
    assert.deepEqual(progress, savedZip ? [6] : [3, 6]);
    assert.equal(f.requests.length, savedZip ? 1 : 3);
    if (savedZip) assert.equal(result.bytes, f.bytes);
  }
});
test("reassembles the original archive in order with per-part and whole-archive checks", async () => {
  const f = fixture(),
    progress: number[] = [];
  const result = await fetchHostedProject(url, {
    signal: new AbortController().signal,
    fetcher: f.fetcher,
    onProgress: (received) => progress.push(received),
  });
  assert.deepEqual(result.bytes, f.bytes);
  assert.equal(result.cached, false);
  assert.deepEqual(progress, [3, 6]);
  assert.equal(f.requests.length, 3);
});
test("a verified saved ZIP avoids all part downloads; a different saved ZIP is replaced", async () => {
  const f = fixture();
  const cached = await fetchHostedProject(url, {
    signal: new AbortController().signal,
    fetcher: f.fetcher,
    cachedBytes: f.bytes,
  });
  assert.equal(cached.cached, true);
  assert.deepEqual(f.requests, [url]);
  f.requests.length = 0;
  const result = await fetchHostedProject(url, {
    signal: new AbortController().signal,
    fetcher: f.fetcher,
    cachedBytes: new Uint8Array([0, 0, 0, 0, 0, 0]),
  });
  assert.equal(result.cached, false);
  assert.equal(f.requests.length, 3);
});
test("corrupt parts and a wrong overall digest never reach the package reader", async () => {
  const f = fixture();
  f.pieces[0][0] = 0;
  await assert.rejects(
    fetchHostedProject(url, {
      signal: new AbortController().signal,
      fetcher: f.fetcher,
    }),
    /checksum/,
  );
  assert.equal(f.requests.length, 2);
  const other = fixture();
  other.manifest.sha256 = "f".repeat(64);
  await assert.rejects(
    fetchHostedProject(url, {
      signal: new AbortController().signal,
      fetcher: other.fetcher,
    }),
    /checksum/,
  );
});
test("rejects external/traversing part paths and inconsistent sizes before downloading parts", async () => {
  for (const path of [
    "../other.bin",
    "https://other.test/file.bin",
    "//other.test/file.bin",
  ]) {
    const f = fixture();
    f.manifest.parts[0].path = path;
    await assert.rejects(
      fetchHostedProject(url, {
        signal: new AbortController().signal,
        fetcher: f.fetcher,
      }),
      /Invalid hosted map part/,
    );
    assert.equal(f.requests.length, 1);
  }
  const f = fixture();
  f.manifest.bytes++;
  await assert.rejects(
    fetchHostedProject(url, {
      signal: new AbortController().signal,
      fetcher: f.fetcher,
    }),
    /sizes/,
  );
});
test("cancelling a superseded load stops before requesting the next part", async () => {
  const f = fixture(),
    controller = new AbortController();
  await assert.rejects(
    fetchHostedProject(url, {
      signal: controller.signal,
      fetcher: f.fetcher,
      onProgress: () => controller.abort(),
    }),
    /abort/i,
  );
  assert.equal(f.requests.length, 2);
});
