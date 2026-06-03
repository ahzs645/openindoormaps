import {
  BookOpen,
  BriefcaseMedical,
  Coffee,
  Dumbbell,
  FlaskConical,
  SlidersVertical,
} from "lucide-react";
import { useEffect, useState } from "react";
import building, { buildingSource } from "~/data/building";
import demoTopLocations from "~/mock/top-locations";
import { POI } from "~/types/poi";
import { IndoorGeocoder } from "~/utils/indoor-geocoder";
import { Toggle } from "../ui/toggle";
import NavigationSettings from "./navigation-settings";
import SearchBar from "./search-bar";
import SuggestionsList from "./suggestions-list";
import { TopLocation, TopLocationsList } from "./top-location-list";

interface DiscoveryViewProps {
  indoorGeocoder: IndoorGeocoder;
  onSelectPOI: (poi: POI) => void;
}

const generatedTopLocationSpecs = [
  {
    name: "Library",
    icon: BookOpen,
    colors: "bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100",
    matcher: (name: string, roomUse: string) =>
      /library services desk|library/i.test(`${name} ${roomUse}`),
  },
  {
    name: "Dining Hall",
    icon: Coffee,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
    matcher: (name: string, roomUse: string) =>
      /dining hall|food services|food pick up/i.test(`${name} ${roomUse}`),
  },
  {
    name: "PacSport",
    icon: Dumbbell,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
    matcher: (name: string, roomUse: string) =>
      /pacsport/i.test(`${name} ${roomUse}`),
  },
  {
    name: "First Aid",
    icon: BriefcaseMedical,
    colors: "bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-100",
    matcher: (name: string, roomUse: string) =>
      /first aid/i.test(`${name} ${roomUse}`),
  },
  {
    name: "Pub",
    icon: Coffee,
    colors:
      "bg-purple-100 text-purple-700 dark:bg-purple-700 dark:text-purple-100",
    matcher: (name: string, roomUse: string) =>
      /pub/i.test(`${name} ${roomUse}`),
  },
  {
    name: "Computer Lab",
    icon: FlaskConical,
    colors: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
    matcher: (name: string, roomUse: string) =>
      /computer lab|comp sci lab/i.test(`${name} ${roomUse}`),
  },
];

function buildGeneratedTopLocations(): TopLocation[] {
  const poiFeatures = building.pois.features as GeoJSON.Feature<
    GeoJSON.Point,
    GeoJSON.GeoJsonProperties
  >[];

  const locations: TopLocation[] = [];

  generatedTopLocationSpecs.forEach((spec) => {
    const match = poiFeatures.find((feature) => {
      const name = String(feature.properties?.name ?? "");
      const roomUse = String(feature.properties?.room_use ?? "");
      return spec.matcher(name, roomUse);
    });

    if (!match) {
      return;
    }

    locations.push({
      name: spec.name,
      query: String(match.properties?.name ?? spec.name),
      icon: spec.icon,
      colors: spec.colors,
    });
  });

  return locations.length > 0 ? locations : (demoTopLocations as TopLocation[]);
}

export default function DiscoveryView({
  indoorGeocoder,
  onSelectPOI,
}: DiscoveryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<POI>>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const topLocations =
    buildingSource === "generated"
      ? buildGeneratedTopLocations()
      : demoTopLocations;

  const handleBackClick = () => {
    setIsSearching(false);
    setSearchQuery("");
  };

  useEffect(() => {
    const newSuggestions = indoorGeocoder.getAutocompleteResults(searchQuery);
    setSuggestions(newSuggestions);
  }, [searchQuery, indoorGeocoder]);

  function handleSuggestionClick(suggestion: POI) {
    setSearchQuery(suggestion.name);
    setIsSearching(false);

    onSelectPOI(suggestion);
  }

  function handleTopLocationsClick(topLocationName: string) {
    setSearchQuery(topLocationName);
    try {
      const poi = indoorGeocoder.indoorGeocodeInput(topLocationName);
      if (!poi) {
        console.error(`Location "${topLocationName}" not found`);
        return;
      }
      onSelectPOI(poi);
    } catch (error) {
      console.error("Failed to geocode location:", error);
    }
  }

  return (
    <>
      <div className="relative flex items-center md:mb-6">
        <div className="relative grow">
          <SearchBar
            isSearching={isSearching}
            searchQuery={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearching(true)}
            onBack={handleBackClick}
          />
        </div>
        {!isSearching && (
          <Toggle
            variant="outline"
            size="icon"
            pressed={isSettingsOpen}
            onPressedChange={setIsSettingsOpen}
            className="ml-2 rounded-full"
          >
            <SlidersVertical size={16} />
          </Toggle>
        )}
      </div>

      {isSearching ? (
        <SuggestionsList
          suggestions={suggestions}
          searchQuery={searchQuery}
          onSuggestionClick={handleSuggestionClick}
        />
      ) : (
        <TopLocationsList
          locations={topLocations}
          onLocationClick={handleTopLocationsClick}
        />
      )}

      {isSettingsOpen && <NavigationSettings />}
    </>
  );
}
