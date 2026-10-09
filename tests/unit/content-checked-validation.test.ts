import assert from "node:assert/strict";
import test from "node:test";
import { createContentCheckedValidation } from "../../app/indoor-project/content-checked-validation";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
test("unchanged mutable carrier reuses full proof and concurrent calls share it", async () => {
  const data = {
    source: { declaredSha: "fixed", geometry: [1, 2] },
    mapping: { face: [3] },
  };
  const g = gate();
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (snapshot) => {
      calls++;
      assert.notEqual(snapshot, data);
      assert.deepEqual(snapshot, data);
      await g.promise;
    },
  );
  const a = validate(data),
    b = validate(data);
  await Promise.resolve();
  assert.equal(calls, 1);
  g.release();
  await Promise.all([a, b]);
  await validate(data);
  assert.equal(calls, 1);
  await validate(structuredClone(data));
  assert.equal(calls, 2);
});
test("changed source or forged mapping with same declared hashes runs full proof", async () => {
  const data = {
    source: { sha: "fixed", geometry: 1 },
    mapping: { sha: "fixed", face: 1 },
  };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (snapshot) => {
      calls++;
      assert.equal(snapshot.source.geometry, 1);
      assert.equal(snapshot.mapping.face, 1);
    },
  );
  await validate(data);
  data.source.geometry = 2;
  await assert.rejects(validate(data));
  data.source.geometry = 1;
  data.mapping.face = 2;
  await assert.rejects(validate(data));
  data.mapping.face = 1;
  await validate(data);
  await validate(data);
  assert.equal(calls, 4);
});
test("unknown undefined own keys cannot hide behind identical JSON SHA", async () => {
  const data: Record<string, unknown> = { known: 1 };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (snapshot) => {
      calls++;
      assert.deepEqual(Object.keys(snapshot), ["known"]);
    },
  );
  await validate(data);
  data.unapproved = undefined;
  await assert.rejects(validate(data));
  await assert.rejects(validate(data));
  assert.equal(calls, 3);
});
test("array holes, explicit undefined/null and special numbers retain distinct fingerprints", async () => {
  const data: { values: unknown[] } = { values: [null] };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(async () => {
    calls++;
  });
  await validate(data);
  data.values[0] = undefined;
  await validate(data);
  delete data.values[0];
  await validate(data);
  data.values[0] = NaN;
  await validate(data);
  data.values[0] = Infinity;
  await validate(data);
  data.values[0] = -Infinity;
  await validate(data);
  data.values[0] = -0;
  await validate(data);
  data.values[0] = 0;
  await validate(data);
  await validate(data);
  assert.equal(calls, 8);
});
test("failed validation never becomes a reusable result", async () => {
  let calls = 0;
  const validate = createContentCheckedValidation(async (_data: object) => {
    calls++;
    throw new Error("full proof failed");
  });
  const data = {};
  await assert.rejects(validate(data), /full proof failed/);
  await assert.rejects(validate(data), /full proof failed/);
  assert.equal(calls, 2);
});
test("mutation during awaited proof rejects and snapshot is not changed by ABA", async () => {
  const data = { geometry: 1 };
  const g = gate();
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (snapshot) => {
      calls++;
      await g.promise;
      assert.equal(snapshot.geometry, 1);
    },
  );
  const pending = validate(data);
  await Promise.resolve();
  data.geometry = 2;
  g.release();
  await assert.rejects(pending, /changed during validation/);
  data.geometry = 1;
  await validate(data);
  assert.equal(calls, 2);

  const abaGate = gate();
  const invalid = { geometry: 0 };
  const abaValidate = createContentCheckedValidation<typeof invalid>(
    async (snapshot) => {
      await abaGate.promise;
      assert.equal(snapshot.geometry, 1);
    },
  );
  const aba = abaValidate(invalid);
  await Promise.resolve();
  invalid.geometry = 1;
  invalid.geometry = 0;
  abaGate.release();
  await assert.rejects(aba); // old invalid snapshot, never a mixed-state proof
});
test("older failing pending proof cannot evict a newer content proof", async () => {
  const data = { geometry: 1 };
  const g = gate();
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (snapshot) => {
      calls++;
      if (snapshot.geometry === 1) {
        await g.promise;
        throw Error("old");
      }
    },
  );
  const old = validate(data);
  await Promise.resolve();
  data.geometry = 2;
  await validate(data);
  g.release();
  await assert.rejects(old, /old/);
  await validate(data);
  assert.equal(calls, 2);
});
test("non-JSON shapes retain original input validation without memoization", async () => {
  class Custom {
    value = 1;
  }
  const symbol = Symbol("own");
  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get: () => 1,
  });
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  const array = Object.assign([1], { extra: 1 });
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  for (const data of [
    new Custom(),
    { [symbol]: 1 },
    accessor,
    hidden,
    array,
    cycle,
    { fn: () => 1 },
  ]) {
    let calls = 0;
    const validate = createContentCheckedValidation(
      async (snapshot: object) => {
        calls++;
        assert.equal(snapshot, data);
      },
    );
    await validate(data);
    await validate(data);
    assert.equal(calls, 2);
  }
});

test("single tree hashes every finite number, boolean and string scalar, retaining type distinctions", async () => {
  const data: { value: unknown } = { value: 1 };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(async () => {
    calls++;
  });
  const values = [
    1,
    2,
    -1,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    1.0000000000000002,
    true,
    false,
    "true",
    "false",
    "1",
    "2",
    "",
    null,
    undefined,
  ];
  for (const value of values) {
    const previous = calls;
    data.value = value;
    await validate(data);
    assert.equal(
      calls,
      previous + 1,
      "changed actual scalar always revalidates",
    );
    await validate(data);
    assert.equal(calls, previous + 1, "unchanged actual scalar reuses proof");
  }
});

test("JSON-escaped lone surrogates and structural-token text cannot alias strings or keys", async () => {
  const data: Record<string, unknown> = { text: "start" };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(async () => {
    calls++;
  });
  const strings = [
    "\ud800",
    "\ud801",
    "\udfff",
    "\ufffd",
    "\ud83d\ude00",
    'end;key:1:"x";number:2;',
    '";array;2;present;undefined:undefined;end;',
    "\\ud800",
    "\u0000",
    '\n"\\',
  ];
  for (const text of strings) {
    data.text = text;
    const before = calls;
    await validate(data);
    await validate(data);
    assert.equal(calls, before + 1);
  }
  delete data.text;
  for (const key of strings) {
    for (const old of Object.keys(data)) delete data[old];
    data[key] = "same actual value";
    const before = calls;
    await validate(data);
    await validate(data);
    assert.equal(calls, before + 1, "actual key payload remains part of proof");
  }
});

test("presence, nested container shape, key order and empty containers remain proof-bound", async () => {
  const data: { shape: unknown } = { shape: [] };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(async () => {
    calls++;
  });
  const shapes = [
    [],
    {},
    [undefined],
    Array(1),
    [null],
    [[1, 2]],
    [1, [2]],
    { a: 1, b: 2 },
    { b: 2, a: 1 },
    { a: undefined },
    {},
  ];
  for (const shape of shapes) {
    const before = calls;
    data.shape = shape;
    await validate(data);
    await validate(data);
    assert.equal(calls, before + 1);
  }
});

test("exotic hooks and ignored array own keys retain original validation without executing hooks", async () => {
  let hooks = 0;
  class CustomArray extends Array<unknown> {}
  const ownToJSON = Object.assign([1], {
    toJSON() {
      hooks++;
      return [1];
    },
  });
  const getter = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      hooks++;
      return 1;
    },
  });
  const arrayExtra = Object.assign([1], { "4294967295": 1 });
  const arrayHuge = Object.assign([1], { "9007199254740993": 1 });
  const arraySymbol = Object.assign([1], { [Symbol("own")]: 1 });
  const arrayAccessor = Object.defineProperty([1], "0", {
    enumerable: true,
    get() {
      hooks++;
      return 1;
    },
  });
  const arrayHidden = Object.defineProperty([1], "0", {
    value: 1,
    enumerable: false,
  });
  for (const data of [
    new CustomArray(1),
    ownToJSON,
    getter,
    arrayExtra,
    arrayHuge,
    arraySymbol,
    arrayAccessor,
    arrayHidden,
  ]) {
    let calls = 0;
    const validate = createContentCheckedValidation(
      async (original: object) => {
        calls++;
        assert.equal(original, data);
      },
    );
    await validate(data);
    await validate(data);
    assert.equal(calls, 2);
    assert.equal(hooks, 0);
  }
});

test("single scalar tree cannot reuse an old validated value after an awaited mutation", async () => {
  const data = { text: "before", number: 1 };
  const g = gate();
  const validate = createContentCheckedValidation<typeof data>(
    async (snapshot) => {
      assert.equal(snapshot.text, "before");
      assert.equal(snapshot.number, 1);
      await g.promise;
    },
  );
  const pending = validate(data);
  await Promise.resolve();
  data.text = "after";
  data.number = 2;
  g.release();
  await assert.rejects(pending, /changed during validation/);
});

test("inherited numeric sparse-array entries cannot reuse proof across prototype edits", async () => {
  const key = "901";
  assert.equal(Object.hasOwn(Array.prototype, key), false);
  const data = { values: Array<unknown>(902) };
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (original) => {
      calls++;
      assert.equal(
        original,
        data,
        "inherited hole is validated by unchanged original-input branch",
      );
      assert.equal(original.values[901], 1);
    },
  );
  try {
    Object.defineProperty(Array.prototype, key, {
      configurable: true,
      writable: true,
      value: 1,
    });
    await validate(data);
    Object.defineProperty(Array.prototype, key, {
      configurable: true,
      writable: true,
      value: 2,
    });
    await assert.rejects(validate(data));
    await assert.rejects(validate(data));
    assert.equal(calls, 3);
  } finally {
    delete (Array.prototype as unknown as Record<string, unknown>)[key];
  }
});

test("inherited sparse-array getters are not executed by the cache fingerprint", async () => {
  const key = "901";
  let hooks = 0,
    calls = 0;
  assert.equal(Object.hasOwn(Array.prototype, key), false);
  const data = { values: Array<unknown>(902) };
  const validate = createContentCheckedValidation<typeof data>(
    async (original) => {
      calls++;
      assert.equal(original, data);
    },
  );
  try {
    Object.defineProperty(Array.prototype, key, {
      configurable: true,
      get() {
        hooks++;
        return 1;
      },
    });
    await validate(data);
    await validate(data);
    assert.equal(calls, 2);
    assert.equal(hooks, 0);
  } finally {
    delete (Array.prototype as unknown as Record<string, unknown>)[key];
  }
});

test("null and changed object prototypes retain original schema validation without normalization", async () => {
  const nullPrototype = Object.assign(Object.create(null), { value: 1 }) as {
    value: number;
  };
  const inherited = Object.assign(Object.create({ inherited: 1 }), {
    value: 1,
  }) as { value: number };
  const data = { value: 1 };
  for (const original of [nullPrototype, inherited]) {
    let calls = 0;
    const validate = createContentCheckedValidation<typeof original>(
      async (actual) => {
        calls++;
        assert.equal(actual, original);
        assert.equal(
          Object.getPrototypeOf(actual),
          Object.getPrototypeOf(original),
        );
      },
    );
    await validate(original);
    await validate(original);
    assert.equal(calls, 2);
  }
  let calls = 0;
  const validate = createContentCheckedValidation<typeof data>(
    async (actual) => {
      calls++;
      assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    },
  );
  await validate(data);
  Object.setPrototypeOf(data, null);
  await assert.rejects(validate(data));
  await assert.rejects(validate(data));
  assert.equal(calls, 3);
});

test("symbols, bigint and callable values continue through unchanged original validator", async () => {
  for (const scalar of [Symbol("value"), 1n, () => 1]) {
    const data = { value: scalar };
    let calls = 0;
    const validate = createContentCheckedValidation<typeof data>(
      async (actual) => {
        calls++;
        assert.equal(actual, data);
        assert.equal(actual.value, scalar);
      },
    );
    await validate(data);
    await validate(data);
    assert.equal(calls, 2);
  }
});

test("numeric getters inherited above Array.prototype fall back before using hash buffers", async () => {
  const previous = Object.getPrototypeOf(Array.prototype);
  const ancestor = Object.create(previous) as object;
  let hooks = 0,
    calls = 0;
  Object.defineProperty(ancestor, "901", {
    get() {
      hooks++;
      return 1;
    },
    configurable: true,
  });
  const data = { values: Array<unknown>(902) };
  const validate = createContentCheckedValidation<typeof data>(
    async (actual) => {
      calls++;
      assert.equal(actual, data);
    },
  );
  try {
    Object.setPrototypeOf(Array.prototype, ancestor);
    await validate(data);
    await validate(data);
    assert.equal(hooks, 0);
    assert.equal(calls, 2);
  } finally {
    Object.setPrototypeOf(Array.prototype, previous);
  }
});
