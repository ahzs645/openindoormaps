import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  preparedDisplayEngineBinding,
  writePreparedDisplayEngineBinding,
} from "../../scripts/indoor/prepared-display-engine-binding";

test("prepared asset binding changes for nested geometry, WASM and dependency updates, independently of UI", () => {
  const root = mkdtempSync(join(tmpdir(), "native-display-binding-"));
  try {
    const dir = join(root, "app/indoor-project");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, "package-lock.json"), '{"version":1}');
    writeFileSync(
      join(dir, "prepared-floor.ts"),
      'export { floor } from "./helper";',
    );
    writeFileSync(
      join(dir, "native-explore.ts"),
      'const worker = new URL("geometry.worker.ts", import.meta.url);',
    );
    writeFileSync(
      join(dir, "prepared-floor-cache.ts"),
      "export const normalize = true;",
    );
    writeFileSync(
      join(dir, "geometry.worker.ts"),
      'export { floor } from "./helper";',
    );
    writeFileSync(
      join(dir, "helper.ts"),
      'export const floor = new URL("./engine.wasm", import.meta.url);',
    );
    writeFileSync(
      join(dir, "prepared-display-preparation.ts"),
      "export const defaults = true;",
    );
    writeFileSync(join(dir, "engine.wasm"), new Uint8Array([0, 1, 2]));
    let previous = preparedDisplayEngineBinding(root);
    assert(
      previous.modules.some(([path]) => path.endsWith("geometry.worker.ts")),
    );
    assert(previous.modules.some(([path]) => path.endsWith("engine.wasm")));
    writeFileSync(join(dir, "unrelated-ui.tsx"), "export const label = 'new';");
    assert.equal(preparedDisplayEngineBinding(root).sha256, previous.sha256);
    for (const [path, content] of [
      [join(dir, "prepared-floor-cache.ts"), "export const normalize = false;"],
      [
        join(dir, "helper.ts"),
        'export const floor = new URL("./engine.wasm", import.meta.url); // changed',
      ],
      [join(dir, "engine.wasm"), new Uint8Array([0, 1, 3])],
      [join(root, "package-lock.json"), '{"version":2}'],
    ] as const) {
      writeFileSync(path, content);
      const next = preparedDisplayEngineBinding(root);
      assert.notEqual(next.sha256, previous.sha256);
      previous = next;
    }
    writePreparedDisplayEngineBinding(root);
    const generated = readFileSync(
      join(dir, "prepared-display-engine-binding.ts"),
      "utf8",
    );
    writePreparedDisplayEngineBinding(root);
    assert.equal(
      readFileSync(join(dir, "prepared-display-engine-binding.ts"), "utf8"),
      generated,
    );
    assert.equal(preparedDisplayEngineBinding(root).sha256, previous.sha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing imported geometry never creates an apparently fresh asset binding", () => {
  const root = mkdtempSync(join(tmpdir(), "native-display-binding-missing-"));
  try {
    const dir = join(root, "app/indoor-project");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, "package-lock.json"), "{}");
    writeFileSync(join(dir, "prepared-floor.ts"), 'import "./absent";');
    writeFileSync(join(dir, "native-explore.ts"), "export {};");
    assert.throws(
      () => preparedDisplayEngineBinding(root),
      /Missing prepared-display dependency/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
