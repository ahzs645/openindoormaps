import type {
  BasemapBuildingSettings,
  BasemapAreaShape,
} from "./basemap-buildings";

export function BasemapSettingsPanel({
  settings,
  onChange,
  onDraw,
}: {
  settings: BasemapBuildingSettings;
  onChange: (settings: BasemapBuildingSettings) => void;
  onDraw: (shape: BasemapAreaShape) => void;
}) {
  return (
    <fieldset className="project-label-settings project-basemap-settings">
      <legend>Basemap buildings</legend>
      <label>
        Building footprints
        <select
          aria-label="Basemap buildings"
          value={settings.mode}
          onChange={(e) =>
            onChange({
              ...settings,
              mode: e.target.value as BasemapBuildingSettings["mode"],
            })
          }
        >
          <option value="show">Show buildings</option>
          <option value="hide">Hide everywhere</option>
          <option value="campus">Hide around campus</option>
          <option value="areas">Hide in custom areas</option>
        </select>
      </label>
      {settings.mode === "campus" && (
        <label>
          Campus margin <output>{settings.marginMetres} m</output>
          <input
            aria-label="Basemap campus margin"
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.marginMetres}
            onChange={(e) =>
              onChange({ ...settings, marginMetres: Number(e.target.value) })
            }
          />
        </label>
      )}
      {settings.mode === "areas" && (
        <>
          <div className="project-basemap-draw-tools">
            <button
              disabled={settings.areas.length >= 50}
              onClick={() => onDraw("rectangle")}
            >
              Draw rectangle
            </button>
            <button
              disabled={settings.areas.length >= 50}
              onClick={() => onDraw("polygon")}
            >
              Draw polygon
            </button>
          </div>
          <ul>
            {settings.areas.map((area) => (
              <li key={area.id}>
                <span>{area.name}</span>
                <button
                  aria-label={`Remove ${area.name}`}
                  onClick={() =>
                    onChange({
                      ...settings,
                      areas: settings.areas.filter((a) => a.id !== area.id),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p>
            Rectangles use two opposite corners. For a polygon, trace its
            corners and choose Finish polygon. Buildings overlapping an area are
            hidden on every floor.
          </p>
        </>
      )}
      <p>
        Roads, outdoor paths and indoor rooms stay visible. These settings are
        included in project and viewer exports.
      </p>
    </fieldset>
  );
}
