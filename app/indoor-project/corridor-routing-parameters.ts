/** Versioned with ROUTING_GUIDE_VERSION; candidate checkpoints bind the exact
 * resolved values. Overrides are compilation experiments, never route approval.
 */
export type CorridorCompilerParameters = {
  spacingFeet: number;
  maxSites: number;
  maxAttachments: number;
  maxDeviationFeet: number;
};

export const CORRIDOR_COMPILER_PARAMETERS: Readonly<CorridorCompilerParameters> =
  Object.freeze({
    spacingFeet: 2,
    maxSites: 25_000,
    maxAttachments: 64,
    maxDeviationFeet: 0.75,
  });
