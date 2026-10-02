import { ArrowLeft, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface SearchBarProps {
  placeholder?: string;
  compact?: boolean;
  isSearching: boolean;
  searchQuery: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBack: () => void;
}

export default function SearchBar({
  isSearching,
  placeholder = "Search indoor locations...",
  compact = false,
  searchQuery,
  onChange,
  onFocus,
  onBack,
}: SearchBarProps) {
  return (
    <div className="relative grow">
      {isSearching ? (
        <Button
          size="sm"
          variant="ghost"
          className="absolute left-3 top-1/2 -translate-y-1/2 p-0"
          onClick={onBack}
        >
          <ArrowLeft size={18} className="text-gray-500" />
        </Button>
      ) : (
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={18}
        />
      )}
      <Input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={onChange}
        onFocus={onFocus}
        className={
          compact
            ? "h-12 w-full min-w-0 rounded-full border-0 bg-gray-100 px-10 text-sm font-medium shadow-none"
            : "h-10 w-full min-w-72 rounded-full px-10 py-4 text-lg shadow-sm"
        }
      />
    </div>
  );
}
