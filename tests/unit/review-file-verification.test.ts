import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "fflate";
import {
  verifyReviewBundle,
  type ReviewBundle,
} from "../../app/indoor-project/review-bundle";
import { hasVerifiedReviewFile } from "../../app/indoor-project/review-file-verification";

function bundle(): ReviewBundle {
  const bytes = new TextEncoder().encode("original review evidence");
  return {
    version: 1,
    masterSha256: "a".repeat(64),
    files: [
      {
        path: "review/evidence.txt",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        compressedBase64: Buffer.from(deflateSync(bytes)).toString("base64"),
      },
    ],
  };
}
test("only successful verification can reuse the actual immutable companion content", async () => {
  const b = bundle(),
    f = b.files[0];
  assert.equal(hasVerifiedReviewFile(f), false);
  await verifyReviewBundle(b);
  assert.equal(hasVerifiedReviewFile(f), true);
  assert.equal(hasVerifiedReviewFile({ ...f }), false);
  const original = f.compressedBase64;
  f.compressedBase64 = Buffer.from(
    deflateSync(new TextEncoder().encode("changed review evidence")),
  ).toString("base64");
  assert.equal(hasVerifiedReviewFile(f), false);
  await assert.rejects(verifyReviewBundle(b), /Damaged review|Invalid packed/);
  f.compressedBase64 = original;
  await verifyReviewBundle(b);
  f.sha256 = "b".repeat(64);
  await assert.rejects(verifyReviewBundle(b), /Damaged review|Invalid packed/);
});
test("metadata edits and accessors cannot inherit a verified companion proof", async () => {
  for (const key of ["path", "bytes", "sha256"] as const) {
    const b = bundle(),
      f = b.files[0];
    await verifyReviewBundle(b);
    Object.assign(f, {
      [key]:
        key === "bytes"
          ? f.bytes + 1
          : key === "path"
            ? "review/other.txt"
            : "b".repeat(64),
    });
    assert.equal(hasVerifiedReviewFile(f), false);
  }
  const b = bundle(),
    f = b.files[0];
  await verifyReviewBundle(b);
  const text = f.compressedBase64;
  Object.defineProperty(f, "compressedBase64", {
    get: () => text,
    enumerable: true,
  });
  assert.equal(hasVerifiedReviewFile(f), false);
});

test("edits during an awaited checksum cannot acquire a proof for unverified compressed bytes", async () => {
  const b = bundle(),
    f = b.files[0];
  const original = crypto.subtle.digest.bind(crypto.subtle);
  const digestDescriptor = Object.getOwnPropertyDescriptor(
    crypto.subtle,
    "digest",
  );
  Object.defineProperty(crypto.subtle, "digest", {
    configurable: true,
    value: (...args: Parameters<SubtleCrypto["digest"]>) => {
      f.compressedBase64 = Buffer.from(
        deflateSync(new TextEncoder().encode("changed review evidence!")),
      ).toString("base64");
      return original(...args);
    },
  });
  try {
    await assert.rejects(verifyReviewBundle(b), /changed during verification/);
    assert.equal(hasVerifiedReviewFile(f), false);
  } finally {
    if (digestDescriptor)
      Object.defineProperty(crypto.subtle, "digest", digestDescriptor);
    else Reflect.deleteProperty(crypto.subtle, "digest");
  }
});
