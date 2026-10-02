import type { MapLocation } from "./map-edits";
import { safeEditorUrl } from "./map-edits";
/** Images load only after an explicit preview click. */
export function LocationDetails({ location }: { location: MapLocation }) {
  return (
    <div className="project-location-details">
      {location.phone && (
        <p>
          Phone:{" "}
          <a href={`tel:${location.phone.replaceAll(/[^+\d]/g, "")}`}>
            {location.phone}
          </a>
        </p>
      )}
      {location.hours && (
        <p className="project-location-hours">{location.hours}</p>
      )}
      {location.website && safeEditorUrl(location.website) && (
        <a href={location.website} target="_blank" rel="noreferrer">
          Website
        </a>
      )}
      {location.links
        .filter((l) => safeEditorUrl(l.url))
        .map((link, i) => (
          <a key={i} href={link.url} target="_blank" rel="noreferrer">
            {link.title}
          </a>
        ))}
      {(location.photos.length > 0 || location.logo) && (
        <details>
          <summary>Photos & logo</summary>
          {[location.logo, ...location.photos]
            .filter((u) => u && safeEditorUrl(u))
            .map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                {i === 0 && location.logo
                  ? "View logo"
                  : `View photo ${i + (location.logo ? 0 : 1)}`}
              </a>
            ))}
        </details>
      )}
    </div>
  );
}
