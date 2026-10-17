import { Inflate } from "fflate";
import { MAX_REVIEW_CONTAINER_BYTES } from "./review-bundle-limits";
const fail = () => {
  throw new Error("Invalid packed review companion container.");
};
const MIN_INPUT_CHUNK = 1024;
const MAX_INPUT_CHUNK = 64 * 1024;
// A length/distance pair emits at most 258 bytes and consumes at least two
// Huffman bits: at most 1032 decoded bytes per compressed byte (RFC 1951).
const MAX_DEFLATE_EXPANSION = 1032;
/** Streaming output count guards prevent an expansion beyond the declared bound. */
export function boundedInflate(bytes: Uint8Array, expected: number) {
  if (
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected > MAX_REVIEW_CONTAINER_BYTES
  )
    return fail();
  const out = new Uint8Array(expected);
  let count = 0,
    finished = false;
  const stream = new Inflate((chunk, final) => {
    if (count + chunk.length > expected) fail();
    out.set(chunk, count);
    count += chunk.length;
    finished = final;
  });
  // Tiny pushes repeatedly copy fflate's pending input and allocate its working
  // buffer. Use larger pushes only while the declared remaining output can
  // accommodate their maximum expansion. Near the limit, retain the original
  // small-chunk bound. Pending stored-block input is bounded by a
  // DEFLATE stored block; it cannot accumulate the complete compressed input.
  try {
    if (bytes.length === 0) stream.push(bytes, true);
    for (let offset = 0; offset < bytes.length; ) {
      const size = Math.max(
        MIN_INPUT_CHUNK,
        Math.min(
          MAX_INPUT_CHUNK,
          Math.floor((expected - count) / MAX_DEFLATE_EXPANSION),
        ),
      );
      const end = Math.min(bytes.length, offset + size);
      stream.push(bytes.subarray(offset, end), end === bytes.length);
      offset = end;
    }
  } catch {
    return fail();
  }
  if (!finished || count !== expected) return fail();
  return out;
}
