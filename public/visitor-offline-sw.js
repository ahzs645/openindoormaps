/* Explicit visitor app-shell download. Map data is verified separately in IDB.
 * No precaching happens on install, ordinary navigation or authoring writes. */
(() => {
  const FORMAT = "openindoormaps-visitor-offline-shell-v1";
  const PREFIX = "openindoormaps-visitor-shell-v1-";
  const META = "openindoormaps-visitor-shell-metadata-v1";
  const MAX_BYTES = 128 * 1024 * 1024;
  const MAX_ASSET = 64 * 1024 * 1024;
  const MAX_MANIFEST = 2 * 1024 * 1024;
  const MAX_ENTRIES = 2048;
  const base = new URL(globalThis.registration.scope);
  const manifestUrl = new URL("visitor-offline-shell.json", base).href;
  const activeKey = new URL("__visitor_offline_active__", base).href;
  const cacheManifestKey = new URL("__visitor_offline_manifest__", base).href;
  const hashPattern = /^[a-f0-9]{64}$/;
  const jobs = new Map();
  let queue = Promise.resolve();
  const abort = (signal) => {
    if (signal?.aborted) throw new Error("Offline app download cancelled.");
  };
  const sha = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  const body = (m) => ({
    format: m.format,
    version: m.version,
    basePath: m.basePath,
    assets: m.assets,
    totalBytes: m.totalBytes,
  });
  function assetUrl(path) {
    if (
      typeof path !== "string" ||
      path.length > 1024 ||
      /[\\%?#:]/.test(path) ||
      path.startsWith("/") ||
      path.split("/").some((s) => !s || s === "." || s === "..") ||
      (path !== "index.html" &&
        path !== "glyphs/LICENSE.txt" &&
        !(path.startsWith("glyphs/") && path.endsWith(".pbf")) &&
        !/\.(?:m?js|css|wasm|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|gif|ico|webmanifest)$/i.test(
          path,
        ))
    )
      throw new Error("Invalid offline app asset path.");
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
      throw new Error(
        "Offline app assets must stay in this app's origin and scope.",
      );
    return url.href;
  }
  async function validate(m) {
    if (
      !m ||
      Object.keys(m).sort().join(",") !==
        "assets,basePath,format,revisionSha256,totalBytes,version" ||
      m.format !== FORMAT ||
      m.version !== 1 ||
      m.basePath !== base.pathname ||
      !hashPattern.test(m.revisionSha256) ||
      !Array.isArray(m.assets) ||
      m.assets.length === 0 ||
      m.assets.length > MAX_ENTRIES ||
      !Number.isSafeInteger(m.totalBytes) ||
      m.totalBytes <= 0 ||
      m.totalBytes > MAX_BYTES
    )
      throw new Error("Invalid or oversized offline app inventory.");
    let total = 0;
    const paths = new Set();
    for (const a of m.assets) {
      if (
        !a ||
        Object.keys(a).sort().join(",") !== "bytes,path,sha256" ||
        !hashPattern.test(a.sha256) ||
        !Number.isSafeInteger(a.bytes) ||
        a.bytes <= 0 ||
        a.bytes > MAX_ASSET ||
        paths.has(a.path)
      )
        throw new Error("Invalid or repeated offline app asset.");
      assetUrl(a.path);
      paths.add(a.path);
      total += a.bytes;
    }
    if (
      !paths.has("index.html") ||
      total !== m.totalBytes ||
      (await sha(new TextEncoder().encode(JSON.stringify(body(m))))) !==
        m.revisionSha256
    )
      throw new Error("Offline app inventory checksum mismatch.");
    return m;
  }
  async function read(response, maximum, signal) {
    if (!response?.ok || response.type === "opaque" || !response.body)
      throw new Error("Offline app asset request failed.");
    const reader = response.body.getReader();
    const parts = [];
    let length = 0;
    const cancelled = () => {
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", cancelled, { once: true });
    try {
      while (length <= maximum) {
        abort(signal);
        const next = await reader.read();
        abort(signal);
        if (next.done) break;
        length += next.value.length;
        if (length > maximum) {
          // A cloned/tee response can wait for its unread sibling on cancel.
          // Reject the oversized asset immediately instead of awaiting that.
          void reader.cancel().catch(() => {});
          throw new Error("Offline app asset exceeds its declared size.");
        }
        parts.push(next.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      return bytes;
    } finally {
      signal?.removeEventListener("abort", cancelled);
      reader.releaseLock();
    }
  }
  async function checked(response, asset, signal) {
    const bytes = await read(response, asset.bytes, signal);
    if (bytes.length !== asset.bytes || (await sha(bytes)) !== asset.sha256)
      throw new Error("Offline app asset checksum mismatch.");
    return bytes;
  }
  function mime(path) {
    if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
    if (path.endsWith(".pbf")) return "application/x-protobuf";
    if (path.endsWith(".wasm")) return "application/wasm";
    if (/\.m?js$/.test(path)) return "text/javascript; charset=utf-8";
    if (path.endsWith(".css")) return "text/css; charset=utf-8";
    if (path.endsWith(".html")) return "text/html; charset=utf-8";
    if (path.endsWith(".svg")) return "image/svg+xml";
    if (path.endsWith(".woff2")) return "font/woff2";
    if (path.endsWith(".woff")) return "font/woff";
    return "application/octet-stream";
  }
  const response = (bytes, path) =>
    new Response(bytes, {
      headers: { "Content-Type": mime(path), "Cache-Control": "no-cache" },
    });
  async function savedManifest() {
    const metadata = await caches.open(META);
    const saved = await metadata.match(activeKey);
    if (!saved) return;
    try {
      return await validate(
        JSON.parse(new TextDecoder().decode(await read(saved, MAX_MANIFEST))),
      );
    } catch {
      return;
    }
  }
  async function prepare(port, signal) {
    let manifest;
    let fetched;
    abort(signal);
    try {
      fetched = await fetch(manifestUrl, {
        cache: "reload",
        credentials: "same-origin",
        redirect: "error",
        signal,
      });
    } catch (error) {
      abort(signal);
      // Only a transport failure may reuse a completed inventory. A received
      // malformed/stale inventory must remain an explicit failure.
      if (!(error instanceof TypeError)) throw error;
      manifest = await savedManifest();
      if (!manifest) throw error;
    }
    if (fetched)
      manifest = await validate(
        JSON.parse(
          new TextDecoder("utf8", { fatal: true }).decode(
            await read(fetched, MAX_MANIFEST, signal),
          ),
        ),
      );
    abort(signal);
    const previous = await savedManifest();
    const name = PREFIX + manifest.revisionSha256;
    const previousName = previous
      ? PREFIX + previous.revisionSha256
      : undefined;
    // Keep one completed revision while building the next. At most two bounded
    // 128 MiB inventories coexist; orphaned/interrupted older caches are removed.
    for (const old of await caches.keys())
      if (old.startsWith(PREFIX) && old !== name && old !== previousName)
        await caches.delete(old);
    const cache = await caches.open(name);
    let completedAssets = 0,
      verifiedBytes = 0;
    const progress = () =>
      port.postMessage({
        kind: "progress",
        completedAssets,
        totalAssets: manifest.assets.length,
        verifiedBytes,
        totalBytes: manifest.totalBytes,
      });
    progress();
    try {
      for (const asset of manifest.assets) {
        abort(signal);
        const url = assetUrl(asset.path);
        let bytes;
        const existing = await cache.match(url);
        if (existing) {
          try {
            bytes = await checked(existing, asset, signal);
          } catch {
            abort(signal);
            await cache.delete(url);
          }
        }
        if (!bytes && previousName && previousName !== name) {
          const previousCache = await caches.open(previousName);
          const reusable = await previousCache.match(url);
          if (reusable) {
            try {
              bytes = await checked(reusable, asset, signal);
              await cache.put(url, response(bytes, asset.path));
            } catch {
              abort(signal);
            }
          }
        }
        if (!bytes) {
          const fetched = await fetch(url, {
            cache: "reload",
            credentials: "same-origin",
            redirect: "error",
            signal,
          });
          bytes = await checked(fetched, asset, signal);
          abort(signal);
          // Fetch decoded HTTP encodings already. Do not retain Content-Encoding
          // or Content-Length headers for the uncompressed cached response.
          await cache.put(url, response(bytes, asset.path));
        }
        completedAssets++;
        verifiedBytes += asset.bytes;
        progress();
      }
      // Detect quota/eviction after later writes, not only immediately after each.
      for (const asset of manifest.assets) {
        abort(signal);
        await checked(await cache.match(assetUrl(asset.path)), asset, signal);
      }
      await cache.put(cacheManifestKey, new Response(JSON.stringify(manifest)));
      const metadata = await caches.open(META);
      abort(signal);
      await metadata.put(activeKey, new Response(JSON.stringify(manifest)));
      const reread = await savedManifest();
      if (reread?.revisionSha256 !== manifest.revisionSha256)
        throw new Error(
          "The browser did not retain the offline app inventory.",
        );
      return {
        complete: true,
        revisionSha256: manifest.revisionSha256,
        assetCount: manifest.assets.length,
        bytes: manifest.totalBytes,
      };
    } catch (error) {
      if (name !== previousName) await caches.delete(name);
      throw error;
    }
  }
  async function cached(requestUrl, path) {
    const current = await savedManifest();
    if (!current) return;
    const currentName = PREFIX + current.revisionSha256;
    const allNames = await caches.keys();
    const names = [
      currentName,
      ...allNames.filter((n) => n.startsWith(PREFIX) && n !== currentName),
    ];
    for (const name of names.slice(0, 2)) {
      const cache = await caches.open(name);
      let manifest = current;
      if (name !== currentName) {
        const entry = await cache.match(cacheManifestKey);
        if (!entry) continue;
        try {
          manifest = await validate(
            JSON.parse(
              new TextDecoder().decode(await read(entry, MAX_MANIFEST)),
            ),
          );
        } catch {
          continue;
        }
      }
      const asset = manifest.assets.find((a) =>
        path ? a.path === path : assetUrl(a.path) === requestUrl,
      );
      if (!asset) continue;
      const entry = await cache.match(assetUrl(asset.path));
      if (!entry) continue;
      try {
        return response(await checked(entry, asset), asset.path);
      } catch {
        await cache.delete(assetUrl(asset.path));
      }
    }
    return;
  }
  globalThis.addEventListener("install", (event) =>
    event.waitUntil(globalThis.skipWaiting()),
  );
  globalThis.addEventListener("activate", (event) =>
    event.waitUntil(globalThis.clients.claim()),
  );
  globalThis.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data.requestId !== "string") return;
    if (data.kind === "OIM_VISITOR_SHELL_CANCEL") {
      jobs.get(data.requestId)?.abort();
      return;
    }
    if (data.kind !== "OIM_VISITOR_SHELL_PREPARE" || !event.ports[0]) return;
    const port = event.ports[0];
    const sourceUrl = event.source?.url && new URL(event.source.url);
    if (
      !sourceUrl ||
      sourceUrl.origin !== base.origin ||
      !sourceUrl.pathname.startsWith(base.pathname)
    ) {
      port.postMessage({
        kind: "error",
        message:
          "Offline app requests require a page in this app's origin and scope.",
      });
      return;
    }
    const controller = new AbortController();
    jobs.set(data.requestId, controller);
    const job = queue
      .catch(() => {})
      .then(async () => {
        try {
          const value = await prepare(port, controller.signal);
          port.postMessage({ kind: "complete", value });
        } catch (error) {
          port.postMessage({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          jobs.delete(data.requestId);
          port.close();
        }
      });
    queue = job;
    event.waitUntil(job);
  });
  globalThis.addEventListener("fetch", (event) => {
    const request = event.request,
      url = new URL(request.url);
    if (
      request.method !== "GET" ||
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname)
    )
      return;
    const visitor = base.pathname + "projects/visitor";
    if (
      request.mode === "navigate" &&
      // HashRouter's /#/projects/visitor is sent to the server as the app
      // entry path: URL fragments are never included in service-worker fetches.
      (url.pathname === base.pathname ||
        url.pathname === base.pathname + "index.html" ||
        url.pathname === visitor ||
        url.pathname === visitor + "/")
    ) {
      event.respondWith(
        (async () => {
          let network;
          try {
            network = await fetch(request);
            if (network.ok) return network;
          } catch {
            /* The checked offline index is the navigation fallback. */
          }
          return (
            (await cached(undefined, "index.html")) ??
            network ??
            new Response(
              "The visitor app has not been downloaded for offline use.",
              { status: 503 },
            )
          );
        })(),
      );
      return;
    }
    if (
      url.pathname !== base.pathname + "glyphs/LICENSE.txt" &&
      !(
        url.pathname.startsWith(base.pathname + "glyphs/") &&
        url.pathname.endsWith(".pbf")
      ) &&
      !/\.(?:m?js|css|wasm|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|gif|ico|webmanifest)$/i.test(
        url.pathname,
      )
    )
      return;
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          if (network.ok) return network;
          const hit = await cached(url.href);
          return hit ?? network;
        } catch (error) {
          const hit = await cached(url.href);
          if (hit) return hit;
          throw error;
        }
      })(),
    );
  });
})();
