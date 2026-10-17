import assert from "node:assert/strict";
import test from "node:test";
import {
  watchVisitorRender,
  type VisitorRenderMap,
} from "../../app/indoor-project/visitor-render-readiness";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const events = new Map<
    string,
    Set<(e?: { sourceId?: string; error?: Error }) => void>
  >();
  const sources = new Map<
    string,
    { serialize: () => { data: { features: unknown[] } }; loaded: boolean }
  >();
  const layers = new Map<string, unknown>();
  let paints = 0;
  const map: VisitorRenderMap = {
    on: (name, listener) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name)!.add(listener);
    },
    off: (name, listener) => events.get(name)?.delete(listener),
    getSource: (id) => sources.get(id),
    isSourceLoaded: (id) => sources.get(id)?.loaded ?? false,
    getStyle: () => ({
      sources: Object.fromEntries([...sources].map(([id]) => [id, {}])),
    }),
    getLayer: (id) => layers.get(id),
    triggerRepaint: () => {
      paints++;
    },
  };
  const emit = (name: string, e?: { sourceId?: string; error?: Error }) => {
    for (const listener of events.get(name) ?? []) listener(e);
  };
  const setSource = (id: string, count: number, loaded: boolean) =>
    sources.set(id, {
      serialize: () => ({ data: { features: Array.from({ length: count }) } }),
      loaded,
    });
  return {
    map,
    emit,
    sources,
    setSource,
    layers,
    events,
    paints: () => paints,
  };
}

test("decoded native geometry waits through initial empty source and indexing before its painted frame", async () => {
  const f = fixture(),
    ready: boolean[] = [];
  f.setSource("native-explore-fill", 0, true);
  watchVisitorRender({
    map: f.map,
    sourceFeatureCounts: { "native-explore-fill": 3 },
    onReady: () => ready.push(true),
    onError: (e) => {
      throw e;
    },
  });
  await Promise.resolve();
  f.emit("render");
  assert.equal(ready.length, 0);
  f.setSource("native-explore-fill", 3, false);
  f.emit("render");
  assert.equal(ready.length, 0);
  f.sources.get("native-explore-fill")!.loaded = true;
  f.emit("sourcedata");
  assert.equal(ready.length, 0);
  f.emit("render");
  assert.equal(ready.length, 1);
  assert.ok([...f.events.values()].every((s) => s.size === 0));
});

test("custom floor union readiness requires a later paint and does not depend on idle camera", async () => {
  const f = fixture(),
    union = deferred();
  let ready = false;
  f.setSource("project-areas", 2, true);
  f.layers.set("floor", { implementation: { whenReady: union.promise } });
  watchVisitorRender({
    map: f.map,
    sourceFeatureCounts: { "project-areas": 2 },
    customLayerIds: ["floor"],
    onReady: () => {
      ready = true;
    },
    onError: (e) => {
      throw e;
    },
  });
  await Promise.resolve();
  f.emit("render");
  assert.equal(ready, false);
  union.resolve();
  await Promise.resolve();
  assert.equal(ready, false);
  assert.ok(f.paints() > 0);
  // A moving camera still emits render; an idle event is deliberately absent.
  f.emit("render");
  assert.equal(ready, true);
});

test("cancelled scope ignores pending union success and failure and removes listeners", async () => {
  for (const failure of [false, true]) {
    const f = fixture(),
      union = deferred();
    const results: unknown[] = [];
    f.setSource("project-areas", 1, true);
    f.layers.set("floor", { implementation: { whenReady: union.promise } });
    const stop = watchVisitorRender({
      map: f.map,
      sourceFeatureCounts: { "project-areas": 1 },
      customLayerIds: ["floor"],
      onReady: () => results.push("ready"),
      onError: (e) => results.push(e),
    });
    await Promise.resolve();
    stop();
    f.map.getLayer = () => {
      throw new Error("removed map must not be read");
    };
    if (failure) union.reject(new Error("old floor"));
    else union.resolve();
    await Promise.resolve();
    f.emit("render");
    assert.deepEqual(results, []);
    assert.ok([...f.events.values()].every((s) => s.size === 0));
  }
});

test("replacement custom layer cannot reuse the removed layer's completed promise", async () => {
  const f = fixture(),
    old = deferred(),
    next = deferred();
  let ready = false;
  f.setSource("project-areas", 1, true);
  f.layers.set("floor", { implementation: { whenReady: old.promise } });
  watchVisitorRender({
    map: f.map,
    sourceFeatureCounts: { "project-areas": 1 },
    customLayerIds: ["floor"],
    onReady: () => {
      ready = true;
    },
    onError: (e) => {
      throw e;
    },
  });
  await Promise.resolve();
  old.resolve();
  await Promise.resolve();
  f.layers.set("floor", { implementation: { whenReady: next.promise } });
  f.emit("render");
  assert.equal(ready, false);
  next.resolve();
  await Promise.resolve();
  f.emit("render");
  assert.equal(ready, true);
});

test("indoor source failure is shown instead of claiming a drawn floor", async () => {
  const f = fixture(),
    errors: string[] = [];
  let ready = false;
  f.setSource("project-areas", 1, false);
  watchVisitorRender({
    map: f.map,
    sourceFeatureCounts: { "project-areas": 1 },
    onReady: () => {
      ready = true;
    },
    onError: (e) => errors.push(e.message),
  });
  f.emit("error", {
    sourceId: "project-areas",
    error: new Error("indexing failed"),
  });
  f.sources.get("project-areas")!.loaded = true;
  f.emit("render");
  assert.equal(ready, false);
  assert.deepEqual(errors, ["indexing failed"]);
});

test("a removed custom layer rejection cannot fail its replacement", async () => {
  const f = fixture(),
    old = deferred(),
    next = deferred(),
    errors: string[] = [];
  let ready = false;
  f.setSource("project-areas", 1, true);
  f.layers.set("floor", { implementation: { whenReady: old.promise } });
  watchVisitorRender({
    map: f.map,
    sourceFeatureCounts: { "project-areas": 1 },
    customLayerIds: ["floor"],
    onReady: () => {
      ready = true;
    },
    onError: (e) => errors.push(e.message),
  });
  await Promise.resolve();
  f.layers.set("floor", { implementation: { whenReady: next.promise } });
  old.reject(new Error("removed layer failed"));
  await Promise.resolve();
  f.emit("render");
  assert.deepEqual(errors, []);
  assert.equal(ready, false);
  next.resolve();
  await Promise.resolve();
  f.emit("render");
  assert.equal(ready, true);
});
