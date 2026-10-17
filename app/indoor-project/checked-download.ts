/** Bound a network response while receiving it, before allocating a large
 * combined buffer. A host cannot exceed the verified asset's declared size. */
export async function readCheckedDownload(
  response: Response,
  maximumBytes: number,
) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.length;
      if (count > maximumBytes) {
        await reader.cancel();
        throw new Error("Map download exceeds its checked size.");
      }
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
