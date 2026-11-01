/** Versioned with ROUTING_GUIDE_VERSION; candidate checkpoints bind the exact
 * resolved values. Overrides are compilation experiments, never route approval.
 */
export type CorridorCompilerParameters = {
  spacingFeet: number;
  maxSites: number;
  maxAttachments: number;
  maxDeviationFeet: number;
  /** Propose doorway-normal and non-reversing terminal approaches before
   * the legacy ones. Every proposal keeps the same exact support checks; a
   * cell's original approach geometry remains the per-edge fallback. */
  shapedApproaches: boolean;
  /** With shaped approaches: refit trunks through pass-through terminal
   * joins and reattach those terminals under the same exact checks. */
  slideJoins: boolean;
};

export const CORRIDOR_COMPILER_PARAMETERS: Readonly<CorridorCompilerParameters> =
  Object.freeze({
    spacingFeet: 2,
    maxSites: 25_000,
    maxAttachments: 64,
    maxDeviationFeet: 0.75,
    shapedApproaches: true,
    slideJoins: true,
  });
