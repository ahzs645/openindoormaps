export type LabelPreset = "minimal" | "balanced" | "detailed" | "custom";
export type LabelSettings = {
  preset: LabelPreset;
  roomZoom: number;
  fullNameZoom: number;
  spacing: number;
};
export const LABEL_PRESETS: Record<
  Exclude<LabelPreset, "custom">,
  LabelSettings
> = {
  minimal: { preset: "minimal", roomZoom: 22, fullNameZoom: 23, spacing: 24 },
  balanced: { preset: "balanced", roomZoom: 21, fullNameZoom: 22, spacing: 18 },
  detailed: { preset: "detailed", roomZoom: 19, fullNameZoom: 20, spacing: 8 },
};
export const DEFAULT_LABEL_SETTINGS = LABEL_PRESETS.balanced;
const key = "openindoormaps.visitor-labels.v1";
const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
export function normalizeLabelSettings(
  value: Partial<LabelSettings> | null | undefined,
): LabelSettings {
  const roomZoom =
    Math.round(Math.max(18, Math.min(23, finite(value?.roomZoom, 21))) * 2) / 2;
  const fullNameZoom =
    Math.round(
      Math.max(roomZoom, Math.min(24, finite(value?.fullNameZoom, 22))) * 2,
    ) / 2;
  const spacing = Math.round(
    Math.max(4, Math.min(28, finite(value?.spacing, 18))),
  );
  const preset = value?.preset;
  const matching = preset && preset !== "custom" && LABEL_PRESETS[preset];
  return {
    roomZoom,
    fullNameZoom,
    spacing,
    preset:
      matching &&
      matching.roomZoom === roomZoom &&
      matching.fullNameZoom === fullNameZoom &&
      matching.spacing === spacing
        ? preset
        : "custom",
  };
}
export function loadLabelSettings(): LabelSettings {
  try {
    if (typeof globalThis !== "undefined") {
      const saved = globalThis.localStorage.getItem(key);
      if (saved) return normalizeLabelSettings(JSON.parse(saved));
    }
  } catch {
    /* A blocked or malformed browser preference uses the default. */
  }
  return { ...DEFAULT_LABEL_SETTINGS };
}
export function saveLabelSettings(settings: LabelSettings) {
  try {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify(normalizeLabelSettings(settings)),
    );
  } catch {
    /* Viewing remains available without browser storage. */
  }
}
