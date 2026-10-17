import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { writeVisitorOfflineShellManifest } from "../../scripts/indoor/visitor-offline-shell-build";
import { prepareVisitorOfflineShell } from "../../app/indoor-project/visitor-offline-shell-client";

const base = "https://offline.test/openindoormaps/";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "visitor-shell-"));
  await mkdir(path.join(directory, "assets"));
  await mkdir(path.join(directory, "glyphs/Noto Sans Regular"), {
    recursive: true,
  });
  for (const [name, contents] of Object.entries({
    "index.html":
      '<!doctype html><script type="module" src="/openindoormaps/assets/app.js"></script>',
    "assets/app.js":
      'const __vite__mapDeps=()=>["assets/authoring.js","assets/demo.js"]; export const visitor=()=>import("./progressive-visitor-page.js"); export const other=()=>import("./authoring.js");',
    "assets/progressive-visitor-page.js":
      'import "./visitor.css"; new Worker(new URL("./floor.worker.js",import.meta.url)); new Worker(new URL("./route.worker.js",import.meta.url));',
    "assets/visitor.css": '@font-face { src:url("./font.woff2"); }',
    "assets/floor.worker.js":
      'const geos=new URL("./kernel.wasm",import.meta.url);',
    "assets/route.worker.js":
      'const geos=new URL("./kernel.wasm",import.meta.url); self.onmessage = () => self.postMessage("worker ready");',
    "assets/authoring.js":
      'const sourceConverter=new URL("./rvt-converter.wasm",import.meta.url);',
    "assets/rvt-converter.wasm": "unrelated source converter",
    "assets/demo.js": "unrelated venue dataset",
    "assets/kernel.wasm": "\0asm\u0001\0\0\0",
    "assets/font.woff2": "font bytes",
    "glyphs/Noto Sans Regular/0-255.pbf": "same-origin glyph bytes",
    "glyphs/LICENSE.txt": "original open font license",
    "model.rvt": "private source",
    "scene.glb": "private scene",
    "map.zip": "map archive",
    "viewer.json": "raw map data",
    "visitor-offline-sw.js": "the registered worker is not an app cache asset",
  }))
    await writeFile(path.join(directory, name), contents);
  const manifest = await writeVisitorOfflineShellManifest(
    directory,
    "/openindoormaps/",
  );
  const http = new Map<string, Uint8Array>([
    [
      new URL("visitor-offline-shell.json", base).href,
      new TextEncoder().encode(JSON.stringify(manifest)),
    ],
  ]);
  for (const asset of manifest.assets)
    http.set(
      new URL(asset.path, base).href,
      await readFile(path.join(directory, asset.path)),
    );
  return { directory, manifest, http };
}
class Cache {
  entries = new Map<string, Response>();
  evict = false;
  async match(url: string) {
    return this.entries.get(String(url))?.clone();
  }
  async put(url: string, response: Response) {
    if (this.evict) this.entries.clear();
    this.entries.set(String(url), response.clone());
  }
  async delete(url: string) {
    return this.entries.delete(String(url));
  }
}
async function worker(http: Map<string, Uint8Array>, evict = false) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Cache>();
  const requests: string[] = [];
  let offline = false;
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) {
        const c = new Cache();
        c.evict = evict && name.startsWith("openindoormaps-visitor-shell-v1-");
        stores.set(name, c);
      }
      return stores.get(name)!;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  const self = {
    registration: { scope: base },
    clients: { async claim() {} },
    async skipWaiting() {},
    addEventListener(type: string, callback: (event: unknown) => void) {
      handlers.set(type, callback);
    },
  };
  const source = await readFile(
    new URL("../../public/visitor-offline-sw.js", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(source, {
    self,
    ...self,
    caches,
    crypto: webcrypto,
    URL,
    Response,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortController,
    TypeError,
    Error,
    fetch: async (request: string | Request) => {
      const url = typeof request === "string" ? request : request.url;
      requests.push(url);
      if (offline) throw new TypeError("Network offline");
      const bytes = http.get(url);
      return new Response(bytes?.slice().buffer ?? "missing", {
        status: bytes ? 200 : 404,
      });
    },
  });
  let sequence = 0;
  async function prepare(cancelAt?: number) {
    const requestId = `test-${++sequence}`;
    const messages: {
      kind: string;
      value?: { complete: boolean };
      message?: string;
      completedAssets?: number;
    }[] = [];
    let completion!: Promise<unknown>;
    const port = {
      postMessage(value: (typeof messages)[number]) {
        messages.push(value);
        if (value.kind === "progress" && value.completedAssets === cancelAt)
          handlers.get("message")!({
            data: { kind: "OIM_VISITOR_SHELL_CANCEL", requestId },
          });
      },
      close() {},
    };
    handlers.get("message")!({
      data: { kind: "OIM_VISITOR_SHELL_PREPARE", requestId },
      source: { url: base + "projects/visitor" },
      ports: [port],
      waitUntil(value: Promise<unknown>) {
        completion = value;
      },
    });
    await completion;
    return messages;
  }
  async function fetchEvent(url: string, mode = "cors", method = "GET") {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { url, mode, method },
      respondWith(value: Promise<Response>) {
        response = value;
      },
    });
    return {
      intercepted: !!response,
      response: response ? await response : undefined,
    };
  }
  return {
    stores,
    requests,
    prepare,
    fetchEvent,
    setOffline(value: boolean) {
      offline = value;
    },
    handlers,
  };
}

test("build inventory deterministically includes lazy JS/WASM/fonts and excludes models, ZIPs and map JSON", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(
      f.manifest.assets.map((a) => a.path),
      [
        "assets/app.js",
        "assets/floor.worker.js",
        "assets/font.woff2",
        "assets/kernel.wasm",
        "assets/progressive-visitor-page.js",
        "assets/route.worker.js",
        "assets/visitor.css",
        "glyphs/LICENSE.txt",
        "glyphs/Noto Sans Regular/0-255.pbf",
        "index.html",
      ],
    );
    assert.deepEqual(
      await writeVisitorOfflineShellManifest(f.directory, "/openindoormaps/"),
      f.manifest,
    );
    for (const a of f.manifest.assets)
      assert.equal(
        hash(await readFile(path.join(f.directory, a.path))),
        a.sha256,
      );
    // Production builds supply Rollup's static chunk and Vite asset/CSS edges.
    // Retain those even when no emitted JavaScript literal names the asset.
    for (const [name, contents] of Object.entries({
      "assets/runtime.js": "export const runtime = true;",
      "assets/runtime.wasm": "required runtime binary",
      "assets/metadata.css": ".visitor { display:block; }",
      "assets/unrelated.css": ".authoring { display:block; }",
    }))
      await writeFile(path.join(f.directory, name), contents);
    const graphManifest = await writeVisitorOfflineShellManifest(
      f.directory,
      "/openindoormaps/",
      {
        "assets/app.js": {
          type: "chunk",
          isEntry: true,
          dynamicImports: [
            "assets/progressive-visitor-page.js",
            "assets/authoring.js",
          ],
        },
        "assets/progressive-visitor-page.js": {
          type: "chunk",
          facadeModuleId: "/repo/app/pages/progressive-visitor-page.tsx",
          imports: ["assets/runtime.js"],
          viteMetadata: { importedCss: new Set(["assets/metadata.css"]) },
        },
        "assets/runtime.js": {
          type: "chunk",
          viteMetadata: { importedAssets: new Set(["assets/runtime.wasm"]) },
        },
      },
    );
    const graphPaths = new Set(graphManifest.assets.map((asset) => asset.path));
    for (const required of [
      "assets/runtime.js",
      "assets/runtime.wasm",
      "assets/metadata.css",
      "assets/floor.worker.js",
      "assets/route.worker.js",
      "assets/kernel.wasm",
    ])
      assert.ok(graphPaths.has(required), required);
    for (const excluded of [
      "assets/authoring.js",
      "assets/rvt-converter.wasm",
      "assets/demo.js",
      "assets/unrelated.css",
    ])
      assert.ok(!graphPaths.has(excluded), excluded);
    await assert.rejects(
      writeVisitorOfflineShellManifest(f.directory, "https://elsewhere.test/"),
      /same-origin/,
    );
    await assert.rejects(
      writeVisitorOfflineShellManifest(f.directory, "/../"),
      /same-origin/,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("only explicit preparation caches a fully verified shell and offline visitor navigation/workers/WASM reopen", async () => {
  const f = await fixture();
  try {
    const w = await worker(f.http);
    for (const type of ["install", "activate"]) {
      let done!: Promise<unknown>;
      w.handlers.get(type)!({
        waitUntil(p: Promise<unknown>) {
          done = p;
        },
      });
      await done;
    }
    assert.equal(w.requests.length, 0);
    assert.equal(w.stores.size, 0);
    const messages = await w.prepare();
    assert.equal(messages.at(-1)?.kind, "complete");
    assert.equal(w.requests.length, f.manifest.assets.length + 1);
    w.setOffline(true);
    const navigation = await w.fetchEvent(
      base + "projects/visitor?manifest=map",
      "navigate",
    );
    assert.equal(
      await navigation.response!.text(),
      new TextDecoder().decode(f.http.get(base + "index.html")),
    );
    // The real site uses HashRouter: the browser's navigation has the base
    // pathname even when its address bar contains /#/projects/visitor.
    for (const entry of [base, base + "index.html"]) {
      const hashNavigation = await w.fetchEvent(entry, "navigate");
      assert.equal(
        await hashNavigation.response!.text(),
        new TextDecoder().decode(f.http.get(base + "index.html")),
      );
    }
    for (const name of [
      "assets/route.worker.js",
      "assets/kernel.wasm",
      "glyphs/Noto Sans Regular/0-255.pbf",
    ]) {
      const response = (await w.fetchEvent(base + name)).response!;
      assert.equal(
        hash(new Uint8Array(await response.arrayBuffer())),
        f.manifest.assets.find((a) => a.path === name)!.sha256,
      );
      assert.match(
        response.headers.get("Content-Type")!,
        name.endsWith("wasm")
          ? /application\/wasm/
          : name.endsWith("pbf")
            ? /application\/x-protobuf/
            : /javascript/,
      );
      assert.equal(response.headers.has("Content-Encoding"), false);
    }
    assert.equal(
      (await w.fetchEvent(base + "projects/indoor", "navigate")).intercepted,
      false,
    );
    assert.equal((await w.fetchEvent(base + "map.zip")).intercepted, false);
    assert.equal((await w.fetchEvent(base + "scene.glb")).intercepted, false);
    assert.equal(
      (await w.fetchEvent(base + "assets/app.js", "cors", "POST")).intercepted,
      false,
    );
    assert.equal(
      (await w.fetchEvent("https://thirdparty.test/tiles.js")).intercepted,
      false,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("corrupt app bytes, changed manifests and incomplete/evicted caches cannot report complete", async () => {
  const f = await fixture();
  try {
    const corrupt = new Map(f.http);
    corrupt.set(base + "assets/app.js", new TextEncoder().encode("corrupted"));
    const bad = await worker(corrupt);
    assert.equal((await bad.prepare()).at(-1)?.kind, "error");
    assert.equal(
      [...bad.stores.keys()].filter((n) =>
        n.startsWith("openindoormaps-visitor-shell-v1-"),
      ).length,
      0,
    );
    const evicted = await worker(f.http, true);
    assert.equal((await evicted.prepare()).at(-1)?.kind, "error");
    const changed = new Map(f.http);
    changed.set(
      base + "visitor-offline-shell.json",
      new TextEncoder().encode(
        JSON.stringify({ ...f.manifest, revisionSha256: "f".repeat(64) }),
      ),
    );
    assert.equal(
      (await (await worker(changed)).prepare()).at(-1)?.kind,
      "error",
    );
    const malformed = new Map(f.http);
    malformed.set(base + "visitor-offline-shell.json", new Uint8Array([255]));
    assert.equal(
      (await (await worker(malformed)).prepare()).at(-1)?.kind,
      "error",
    );
    const preserved = await worker(f.http);
    assert.equal((await preserved.prepare()).at(-1)?.kind, "complete");
    f.http.set(base + "visitor-offline-shell.json", new Uint8Array([255]));
    assert.equal((await preserved.prepare()).at(-1)?.kind, "error");
    preserved.setOffline(true);
    assert.equal(
      (await preserved.fetchEvent(base + "projects/visitor", "navigate"))
        .response?.status,
      200,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("offline cached scripts are rehashed and cancelled preparation never pins an incomplete shell", async () => {
  const f = await fixture();
  try {
    const w = await worker(f.http);
    assert.equal((await w.prepare()).at(-1)?.kind, "complete");
    const cache = [...w.stores].find(([n]) =>
      n.startsWith("openindoormaps-visitor-shell-v1-"),
    )![1];
    await cache.put(
      base + "assets/app.js",
      new Response("tampered cached script".repeat(20)),
    );
    w.setOffline(true);
    await assert.rejects(w.fetchEvent(base + "assets/app.js"), /offline/);
    assert.equal(await cache.match(base + "assets/app.js"), undefined);
    const interrupted = await worker(f.http);
    const messages = await interrupted.prepare(1);
    assert.equal(messages.at(-1)?.kind, "error");
    assert.match(messages.at(-1)?.message ?? "", /cancelled/);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("page helper registers only on explicit use and requires a checked completion receipt", async () => {
  let registrations = 0,
    cancellations = 0;
  const worker = Object.assign(new EventTarget(), {
    state: "activated",
    scriptURL: base + "visitor-offline-sw.js",
    postMessage(data: { kind: string }, ports?: MessagePort[]) {
      if (data.kind === "OIM_VISITOR_SHELL_CANCEL") {
        cancellations++;
        return;
      }
      const port = ports![0];
      port.postMessage({
        kind: "progress",
        completedAssets: 1,
        totalAssets: 1,
        verifiedBytes: 10,
        totalBytes: 10,
      });
      port.postMessage({
        kind: "complete",
        value: {
          complete: true,
          revisionSha256: "a".repeat(64),
          assetCount: 1,
          bytes: 10,
        },
      });
    },
  });
  const registration = {
    active: worker,
    installing: null,
    waiting: null,
  } as unknown as ServiceWorkerRegistration;
  const serviceWorkers = {
    async register() {
      registrations++;
      return registration;
    },
    async getRegistration() {
      return registration;
    },
  };
  assert.equal(registrations, 0);
  const receipt = await prepareVisitorOfflineShell({
    baseUrl: base,
    serviceWorkers,
  });
  assert.equal(registrations, 1);
  assert.equal(receipt.complete, true);
  const controller = new AbortController();
  await assert.rejects(
    prepareVisitorOfflineShell({
      baseUrl: base,
      serviceWorkers,
      signal: controller.signal,
      onProgress() {
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(cancellations, 1);
});

test("app updates reuse unchanged verified files and retain at most two completed shell revisions", async () => {
  const f = await fixture();
  try {
    const w = await worker(f.http);
    assert.equal((await w.prepare()).at(-1)?.kind, "complete");
    for (const revision of [2, 3]) {
      const index = new TextEncoder().encode(
        `<!doctype html>verified build ${revision}<script type="module" src="/openindoormaps/assets/app.js"></script>`,
      );
      await writeFile(path.join(f.directory, "index.html"), index);
      const manifest = await writeVisitorOfflineShellManifest(
        f.directory,
        "/openindoormaps/",
      );
      f.http.set(base + "index.html", index);
      f.http.set(
        base + "visitor-offline-shell.json",
        new TextEncoder().encode(JSON.stringify(manifest)),
      );
      const before = w.requests.length;
      assert.equal((await w.prepare()).at(-1)?.kind, "complete");
      assert.equal(
        w.requests.length - before,
        2,
        "Only the manifest and changed index need network bytes",
      );
    }
    assert.equal(
      [...w.stores.keys()].filter((n) =>
        n.startsWith("openindoormaps-visitor-shell-v1-"),
      ).length,
      2,
    );
    w.setOffline(true);
    assert.equal(
      await (
        await w.fetchEvent(base + "projects/visitor", "navigate")
      ).response!.text(),
      '<!doctype html>verified build 3<script type="module" src="/openindoormaps/assets/app.js"></script>',
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
