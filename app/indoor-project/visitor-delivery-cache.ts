/** Content-addressed verified assets survive map revisions. The client rechecks
 * logical checksums on every read. Persistent records use gzip to avoid keeping
 * hundreds of MB of decoded physical evidence in browser storage. */
export interface VisitorDeliveryCache {
  getAsset(sha256: string): Promise<Uint8Array | undefined>;
  putAsset(sha256: string, bytes: Uint8Array): Promise<void>;
  deleteAsset(sha256: string): Promise<void>;
  getManifest(url: string): Promise<Uint8Array | undefined>;
  putManifest(url: string, bytes: Uint8Array): Promise<void>;
}
export class MemoryVisitorDeliveryCache implements VisitorDeliveryCache {
  private assets = new Map<string, Uint8Array>();
  private manifests = new Map<string, Uint8Array>();
  async getAsset(hash: string) {
    return this.assets.get(hash)?.slice();
  }
  async putAsset(hash: string, bytes: Uint8Array) {
    this.assets.set(hash, bytes.slice());
  }
  async deleteAsset(hash: string) {
    this.assets.delete(hash);
  }
  async getManifest(url: string) {
    return this.manifests.get(url)?.slice();
  }
  async putManifest(url: string, bytes: Uint8Array) {
    this.manifests.set(url, bytes.slice());
  }
}
type CompressedRecord = {
  encoding: "gzip";
  logicalBytes: number;
  bytes: ArrayBuffer;
};
type IndexRow = { key: string; bytes: number; touched: number };
export type VisitorPersistentCacheLimits = {
  maximumStoredAssetBytes: number;
  maximumAssets: number;
  maximumManifests: number;
};
const DEFAULT_LIMITS: VisitorPersistentCacheLimits = {
  maximumStoredAssetBytes: 512 * 1024 * 1024,
  maximumAssets: 8192,
  maximumManifests: 16,
};
async function collect(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Offline map record exceeds its byte limit.");
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    reader.releaseLock();
  }
}
/** A bounded compressed LRU. Quota errors remain visible during explicit offline
 * download. Online viewing can report storage failure and continue normally. */
export class IndexedDbVisitorDeliveryCache implements VisitorDeliveryCache {
  private database?: Promise<IDBDatabase>;
  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly name = "openindoormaps-visitor-delivery-v1",
    private readonly limits: VisitorPersistentCacheLimits = DEFAULT_LIMITS,
  ) {}
  private open() {
    if (!this.database)
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory.open(this.name, 2);
        request.onupgradeneeded = (event) => {
          for (const store of [
            "assets",
            "manifests",
            "asset-index",
            "manifest-index",
          ])
            if (!request.result.objectStoreNames.contains(store))
              request.result.createObjectStore(store);
          // Prototype v1 stored unindexed raw buffers. Do not retain unbounded
          // unreachable records after upgrading to the production storage format.
          if (event.oldVersion === 1) {
            request.transaction!.objectStore("assets").clear();
            request.transaction!.objectStore("manifests").clear();
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            this.database = undefined;
          };
          resolve(request.result);
        };
        request.onerror = () => {
          this.database = undefined;
          reject(request.error);
        };
        request.onblocked = () => {
          this.database = undefined;
          reject(new Error("Offline map storage is blocked by another tab."));
        };
      });
    return this.database;
  }
  private async read(
    store: "assets" | "manifests",
    key: string,
  ): Promise<unknown> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const index = store === "assets" ? "asset-index" : "manifest-index";
      const transaction = database.transaction([store, index], "readwrite");
      const request = transaction.objectStore(store).get(key);
      let value: unknown;
      request.onsuccess = () => {
        value = request.result;
        const row = transaction.objectStore(index).get(key);
        row.onsuccess = () => {
          if (row.result)
            transaction
              .objectStore(index)
              .put({ ...row.result, touched: Date.now() }, key);
        };
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  private async write(
    store: "assets" | "manifests",
    key: string,
    value?: CompressedRecord | ArrayBuffer,
    size = 0,
  ): Promise<void> {
    const database = await this.open();
    const maximumBytes =
      store === "assets"
        ? this.limits.maximumStoredAssetBytes
        : 16 * 2 * 1024 * 1024;
    const maximumEntries =
      store === "assets"
        ? this.limits.maximumAssets
        : this.limits.maximumManifests;
    if (size > maximumBytes || maximumEntries <= 0)
      throw new DOMException(
        "The complete map exceeds the browser cache budget.",
        "QuotaExceededError",
      );
    return new Promise((resolve, reject) => {
      const index = store === "assets" ? "asset-index" : "manifest-index";
      const transaction = database.transaction([store, index], "readwrite");
      const records = transaction.objectStore(store),
        metadata = transaction.objectStore(index);
      if (value === undefined) {
        records.delete(key);
        metadata.delete(key);
      } else {
        const request = metadata.getAll();
        request.onsuccess = () => {
          const rows = (request.result as IndexRow[])
            .filter((row) => row.key !== key)
            .sort((a, b) => a.touched - b.touched);
          let total = rows.reduce((sum, row) => sum + row.bytes, 0) + size;
          while (
            rows.length > 0 &&
            (total > maximumBytes || rows.length >= maximumEntries)
          ) {
            const row = rows.shift()!;
            records.delete(row.key);
            metadata.delete(row.key);
            total -= row.bytes;
          }
          records.put(value, key);
          metadata.put({ key, bytes: size, touched: Date.now() }, key);
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  async getAsset(hash: string): Promise<Uint8Array | undefined> {
    const record = (await this.read("assets", hash)) as
      | CompressedRecord
      | undefined;
    if (!record) return;
    if (
      record.encoding !== "gzip" ||
      !(record.bytes instanceof ArrayBuffer) ||
      !Number.isSafeInteger(record.logicalBytes) ||
      record.logicalBytes < 1 ||
      record.logicalBytes > 256 * 1024 * 1024
    )
      throw new Error("Damaged offline map record.");
    return collect(
      new Blob([record.bytes])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
      record.logicalBytes,
    );
  }
  async putAsset(hash: string, bytes: Uint8Array) {
    const stored = await collect(
      new Blob([bytes.slice().buffer])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
      bytes.length + 65_536,
    );
    await this.write(
      "assets",
      hash,
      { encoding: "gzip", logicalBytes: bytes.length, bytes: stored.buffer },
      stored.length,
    );
  }
  deleteAsset(hash: string) {
    return this.write("assets", hash);
  }
  async getManifest(url: string): Promise<Uint8Array | undefined> {
    const bytes = await this.read("manifests", url);
    return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : undefined;
  }
  putManifest(url: string, bytes: Uint8Array) {
    return this.write("manifests", url, bytes.slice().buffer, bytes.length);
  }
  async close() {
    if (this.database) {
      const database = await this.database;
      database.close();
    }
    this.database = undefined;
  }
}
