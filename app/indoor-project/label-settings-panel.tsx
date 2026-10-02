import {
  LABEL_PRESETS,
  normalizeLabelSettings,
  type LabelSettings,
  type LabelPreset,
} from "./label-settings";
export function LabelSettingsPanel({
  settings,
  onChange,
}: {
  settings: LabelSettings;
  onChange: (settings: LabelSettings) => void;
}) {
  const adjust = (patch: Partial<LabelSettings>) =>
    onChange(
      normalizeLabelSettings({ ...settings, ...patch, preset: "custom" }),
    );
  return (
    <fieldset className="project-label-settings">
      <legend>Map labels</legend>
      <label>
        Label preset
        <select
          aria-label="Label preset"
          value={settings.preset}
          onChange={(e) => {
            const preset = e.target.value as LabelPreset;
            onChange(
              preset === "custom"
                ? { ...settings, preset }
                : { ...LABEL_PRESETS[preset] },
            );
          }}
        >
          <option value="minimal">Minimal · less text</option>
          <option value="balanced">Balanced</option>
          <option value="detailed">Detailed · earlier labels</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <details>
        <summary>Adjust labels</summary>
        <label>
          Room numbers <output>{settings.roomZoom.toFixed(1)}</output>
          <input
            aria-label="Room label reveal zoom"
            type="range"
            min="18"
            max="23"
            step="0.5"
            value={settings.roomZoom}
            onChange={(e) => adjust({ roomZoom: Number(e.target.value) })}
          />
        </label>
        <label>
          Full room names <output>{settings.fullNameZoom.toFixed(1)}</output>
          <input
            aria-label="Full room name zoom"
            type="range"
            min={settings.roomZoom}
            max="24"
            step="0.5"
            value={settings.fullNameZoom}
            onChange={(e) => adjust({ fullNameZoom: Number(e.target.value) })}
          />
        </label>
        <p>
          Higher zoom values reveal labels closer in. Selected rooms keep their
          full names.
        </p>
        <label>
          Label spacing <output>{settings.spacing} px</output>
          <input
            aria-label="Label spacing"
            type="range"
            min="4"
            max="28"
            step="1"
            value={settings.spacing}
            onChange={(e) => adjust({ spacing: Number(e.target.value) })}
          />
        </label>
      </details>
      <p>Saved in this browser. Applies to 2D and 3D maps.</p>
    </fieldset>
  );
}
