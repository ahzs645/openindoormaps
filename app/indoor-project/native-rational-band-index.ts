import type { Rational } from "./native-rational-overlay";

/** Same 64-band coordinate as canonical Rational subtract/multiply/divide,
 * without reducing intermediate fractions. All products stay integers. The
 * clamp makes out-of-range samples conservative and the maximum maps to63.
 */
export function nativeRationalBandIndex(
  value: Rational,
  minimum: Rational,
  maximum: Rational,
): number {
  let numerator = 64n * (value.n * minimum.d - minimum.n * value.d) * maximum.d;
  let denominator = value.d * (maximum.n * minimum.d - minimum.n * maximum.d);
  if (denominator === 0n)
    throw new Error("Cannot index a zero-height rational band");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let quotient = numerator / denominator;
  // BigInt division truncates toward zero; use mathematical floor, including
  // negative physical coordinates and values below this ring's minimum.
  if (numerator < 0n && numerator % denominator !== 0n) quotient--;
  return quotient < 0n ? 0 : quotient > 63n ? 63 : Number(quotient);
}
