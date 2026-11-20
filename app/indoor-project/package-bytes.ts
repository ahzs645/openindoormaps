/** Hash the exact view. WebCrypto already snapshots its input; copying a whole
 * source entry first doubles that transient allocation for large archives. */
export async function packageBytesSha256(bytes: Uint8Array) {
  // Shared buffers are not WebCrypto BufferSources. Preserve the previous
  // snapshot behaviour for those callers without copying ordinary ZIP views.
  const input =
    bytes.buffer instanceof ArrayBuffer ? bytes : new Uint8Array(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", input as BufferSource),
  );
  return [...digest].map((n) => n.toString(16).padStart(2, "0")).join("");
}

// Multiples of three/four keep every intermediate base64 chunk complete.
const BYTE_CHUNK = 3 * 8192;
const TEXT_CHUNK = (BYTE_CHUNK / 3) * 4;

/** Only the result grows with the input; no whole-entry binary string or
 * temporary iterable-to-number array is constructed. */
export function packageBytesBase64(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK)
    parts.push(
      btoa(
        String.fromCodePoint(...bytes.subarray(offset, offset + BYTE_CHUNK)),
      ),
    );
  return parts.join("");
}

/** Decode the same forgiving base64 accepted by atob, in bounded chunks.
 * Wire validators retain their existing stricter alphabet/size checks. */
export function packageBase64Bytes(value: string) {
  // atob permits precisely these ASCII whitespace characters. Most archive
  // values have none; replace then returns the original string unchanged.
  const text = value.replaceAll(/[\t\n\f\r ]/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text))
    throw new Error("Invalid base64 payload.");
  // Validate padding and incomplete final groups with the native decoder
  // before allocating the result. Earlier groups contain only the alphabet.
  const tailStart =
    Math.max(0, Math.floor((text.length - 1) / TEXT_CHUNK)) * TEXT_CHUNK;
  const tail = atob(text.slice(tailStart));
  const bytes = new Uint8Array((tailStart / 4) * 3 + tail.length);
  let target = 0;
  for (let offset = 0; offset < tailStart; offset += TEXT_CHUNK) {
    const chunk = atob(text.slice(offset, offset + TEXT_CHUNK));
    for (let i = 0; i < chunk.length; i++)
      bytes[target++] = chunk.codePointAt(i) ?? 0;
  }
  for (let i = 0; i < tail.length; i++)
    bytes[target++] = tail.codePointAt(i) ?? 0;
  return bytes;
}

/** Exact canonical spelling check without allocating a full second base64
 * string. Noncanonical legacy companions are still preserved separately. */
export function packageBase64Matches(bytes: Uint8Array, text: string) {
  if (text.length !== 4 * Math.ceil(bytes.length / 3)) return false;
  for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK) {
    const part = btoa(
      String.fromCodePoint(...bytes.subarray(offset, offset + BYTE_CHUNK)),
    );
    if (part !== text.slice((offset / 3) * 4, (offset / 3) * 4 + part.length))
      return false;
  }
  return true;
}

export function samePackageBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
