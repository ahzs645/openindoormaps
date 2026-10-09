import type { ReviewBundle } from "./review-bundle";
type File = ReviewBundle["files"][number];
type Proof = Pick<File, "path" | "bytes" | "sha256" | "compressedBase64">;
const proofs = new WeakMap<File, Proof>();
export function reviewFileVerificationSnapshot(file: File): Proof | undefined {
  if (Object.getPrototypeOf(file) !== Object.prototype) return;
  const proof = {} as Proof;
  for (const key of ["path", "bytes", "sha256", "compressedBase64"] as const) {
    const d = Object.getOwnPropertyDescriptor(file, key);
    if (!d?.enumerable || !("value" in d)) return;
    Object.assign(proof, { [key]: d.value });
  }
  return proof;
}
/** Only a successful bounded expansion and actual content checksum may call
 * this. Strings are immutable; retaining their full values avoids a second
 * inflate/hash without trusting object identity or a declared checksum. */
export function rememberVerifiedReviewFile(
  file: File,
  proof: Proof | undefined,
): void {
  const current = reviewFileVerificationSnapshot(file);
  if (!proof || !current) return;
  if (
    !Object.keys(proof).every(
      (key) => proof[key as keyof Proof] === current[key as keyof Proof],
    )
  )
    throw new Error("Review companion changed during verification.");
  proofs.set(file, proof);
}
export function hasVerifiedReviewFile(file: File): boolean {
  const prior = proofs.get(file),
    current = reviewFileVerificationSnapshot(file);
  if (
    prior &&
    current &&
    Object.keys(prior).every(
      (key) => prior[key as keyof Proof] === current[key as keyof Proof],
    )
  )
    return true;
  proofs.delete(file);
  return false;
}
