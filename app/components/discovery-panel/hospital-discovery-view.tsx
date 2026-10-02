import {
  ArrowLeft,
  BriefcaseBusiness,
  BusFront,
  Coffee,
  Hospital,
  Info,
  MapPin,
  Monitor,
  Plus,
  SlidersHorizontal,
  Stethoscope,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { LocationConfig } from "~/types/location";
import type { POI } from "~/types/poi";
import { poiFromFeature } from "~/utils/poi";
import type { IndoorGeocoder } from "~/utils/indoor-geocoder";
import SearchBar from "./search-bar";
import SuggestionsList from "./suggestions-list";
import NavigationSettings from "./navigation-settings";

const HOME_CATEGORIES = [
  { name: "Clinics and Services", Icon: Hospital },
  { name: "Food & Coffee", Icon: Coffee },
  { name: "Washroom", Icon: Users },
  { name: "Departments", Icon: Stethoscope },
  { name: "On-site Services", Icon: Info },
  { name: "Transportation", Icon: BusFront },
  { name: "Campus", Icon: MapPin },
  { name: "Staff Areas", Icon: BriefcaseBusiness },
  { name: "Admin Services", Icon: Monitor },
  { name: "See All", Icon: Plus },
];

export default function HospitalDiscoveryView({
  location,
  initialCategory,
  indoorGeocoder,
  onSelectPOI,
}: {
  location: LocationConfig;
  initialCategory?: string | null;
  indoorGeocoder: IndoorGeocoder;
  onSelectPOI: (poi: POI) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState<string | null>(
    initialCategory ?? null,
  );
  const [settings, setSettings] = useState(false);
  const categories = location.data.categories ?? [];
  const destinations = useMemo(() => {
    const unique = new Map<string, POI>();
    for (const feature of location.data.pois.features) {
      if (feature.geometry.type !== "Point") continue;
      const poi = poiFromFeature(feature as GeoJSON.Feature<GeoJSON.Point>);
      const sourceId = String(poi.metadata?.source_location_id ?? poi.id);
      if (!unique.has(sourceId)) unique.set(sourceId, poi);
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [location.data.pois]);
  const selectedCategory = categories.find((c) => c.name === category);
  const results =
    searching && query
      ? indoorGeocoder.getAutocompleteResults(query, 15)
      : destinations.filter(
          (poi) =>
            poi.metadata?.direct_category_ids?.includes(selectedCategory?.id) &&
            !selectedCategory?.children?.some((id) =>
              poi.metadata?.category_ids?.includes(id),
            ),
        );
  const back = () => {
    setSearching(false);
    setQuery("");
    setCategory(null);
  };

  return (
    <div data-testid="hospital-discovery" className="space-y-3">
      <div className="flex items-center gap-2">
        <SearchBar
          placeholder="Search the hospital..."
          compact
          isSearching={searching || category !== null}
          searchQuery={query || (searching ? "" : (category ?? ""))}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearching(true);
          }}
          onFocus={() => setSearching(true)}
          onBack={back}
        />
        <button
          type="button"
          aria-label="Preferences"
          aria-expanded={settings}
          onClick={() => setSettings(!settings)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gray-100 text-gray-500 shadow-sm"
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
      {settings && <NavigationSettings />}
      {searching && query && (
        <SuggestionsList
          suggestions={results}
          searchQuery={query}
          onSuggestionClick={onSelectPOI}
          floorNames={location.mapConfig.floorNames}
        />
      )}
      {!(searching && query) && category === "See All" && (
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {categories.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setCategory(item.name);
                setSearching(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm hover:bg-gray-100"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </button>
          ))}
        </div>
      )}
      {!(searching && query) && category && category !== "See All" && (
        <div>
          <button
            type="button"
            onClick={back}
            className="mb-3 flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft size={16} />
            {category}
          </button>
          <div className="max-h-[60vh] overflow-y-auto">
            {categories
              .filter((item) => selectedCategory?.children?.includes(item.id))
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.name)}
                  className="mb-1 flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm font-medium hover:bg-gray-100"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name}
                </button>
              ))}
            <SuggestionsList
              suggestions={results}
              searchQuery={category}
              onSuggestionClick={onSelectPOI}
              floorNames={location.mapConfig.floorNames}
            />
          </div>
        </div>
      )}
      {!(searching && query) && !category && (
        <div className="grid grid-cols-2 gap-2.5">
          {HOME_CATEGORIES.map(({ name, Icon }, index) => (
            <button
              type="button"
              key={name}
              onClick={() => {
                setCategory(name);
                setSearching(false);
              }}
              className={`flex min-w-0 rounded-lg px-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-200 ${index < 4 ? "h-20 flex-col items-start justify-center gap-2 bg-gray-100" : "h-11 items-center gap-2 border border-gray-100"}`}
            >
              <Icon size={17} className="shrink-0 text-gray-500" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
