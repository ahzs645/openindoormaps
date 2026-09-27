import { POI } from "~/types/poi";
import { formatFloorName, type FloorNames } from "~/utils/floor";
import { Button } from "../ui/button";

interface SuggestionsListProps {
  suggestions: POI[];
  searchQuery: string;
  onSuggestionClick: (suggestion: POI) => void;
  floorNames?: FloorNames;
}

function suggestionDetail(suggestion: POI, floorNames?: FloorNames) {
  const category = suggestion.metadata?.category?.replaceAll(/[-_]+/g, " ");
  const floor =
    suggestion.floor === undefined
      ? null
      : formatFloorName(suggestion.floor, floorNames);
  return [category, floor].filter(Boolean).join(" · ");
}

export default function SuggestionsList({
  suggestions,
  searchQuery,
  onSuggestionClick,
  floorNames,
}: SuggestionsListProps) {
  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.id}
          variant="ghost"
          className="h-auto w-full flex-col items-start gap-0 py-1.5 text-left text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          onMouseDown={() => onSuggestionClick(suggestion)}
        >
          <span className="w-full truncate">{suggestion.name}</span>
          {suggestionDetail(suggestion, floorNames) && (
            <span className="w-full truncate text-xs font-normal capitalize text-muted-foreground">
              {suggestionDetail(suggestion, floorNames)}
            </span>
          )}
        </Button>
      ))}
      {suggestions.length === 0 && searchQuery && (
        <p className="p-2 text-sm text-gray-500 dark:text-gray-300">
          No results found
        </p>
      )}
    </div>
  );
}
