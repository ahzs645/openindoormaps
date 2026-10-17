import test from "node:test";
import assert from "node:assert/strict";
import { readCheckedDownload } from "../../app/indoor-project/checked-download";
test("checked downloads cancel an oversized response during streaming and retain bounded valid bytes", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(readCheckedDownload(response, 4), /exceeds/);
  assert.equal(cancelled, true);
  assert.deepEqual(
    await readCheckedDownload(new Response(new Uint8Array([1, 2, 3])), 3),
    new Uint8Array([1, 2, 3]),
  );
});
