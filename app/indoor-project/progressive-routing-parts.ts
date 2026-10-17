import {
  PROGRESSIVE_LIMITS,
  progressiveSha256,
  type ProgressiveAsset,
} from "./progressive-delivery";

type Representation = ProgressiveAsset["representations"][number];
type Part = NonNullable<Representation["parts"]>[number];

/** Reassemble one compressed stream. Parts confer no geometry authority:
 * every part, the whole stored stream and the decoded asset remain checked. */
export async function readProgressiveRoutingParts(
  representation: Representation,
  read: (part: Part) => Promise<Uint8Array>,
) {
  const parts = representation.parts;
  if (
    !parts ||
    parts.length < 2 ||
    parts.length > PROGRESSIVE_LIMITS.representationParts ||
    !Number.isSafeInteger(representation.bytes) ||
    representation.bytes <= 0 ||
    representation.bytes > PROGRESSIVE_LIMITS.storedAssetBytes ||
    parts.some(
      (part) =>
        !Number.isSafeInteger(part.bytes) ||
        part.bytes <= 0 ||
        part.bytes > PROGRESSIVE_LIMITS.storedPartBytes,
    ) ||
    parts.reduce((sum, part) => sum + part.bytes, 0) !== representation.bytes
  )
    throw new Error("Invalid compressed routing parts.");
  const bytes = new Uint8Array(representation.bytes);
  let offset = 0;
  for (const part of parts) {
    const chunk = await read(part);
    if (chunk.length !== part.bytes || progressiveSha256(chunk) !== part.sha256)
      throw new Error("A routing part failed its checksum.");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (progressiveSha256(bytes) !== representation.sha256)
    throw new Error("The compressed routing stream failed its checksum.");
  return bytes;
}
