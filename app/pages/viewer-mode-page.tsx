import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import viewerModes from "~/data/viewer-modes";

export default function ViewerModePage() {
  const { modeId } = useParams<{ modeId: string }>();
  const mode = viewerModes.find((m) => m.id === modeId);
  const [reloadKey, setReloadKey] = useState(0);

  if (!mode) {
    return <Navigate to="/modes" replace />;
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Link
          to="/modes"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Modes
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-secondary">
            {mode.name}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {viewerModes.map((m) => (
              <DropdownMenuItem key={m.id} asChild>
                <Link to={`/modes/${m.id}`}>
                  {m.name}
                  {m.id === mode.id ? " (current)" : ""}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="truncate text-xs text-muted-foreground">
          {mode.source}
        </span>

        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Reload viewer"
        >
          <RefreshCw className="size-4" />
        </button>
      </header>

      {mode.kind !== "embedded" && mode.nativePath ? (
        <Navigate to={mode.nativePath} replace />
      ) : (
        <iframe
          key={reloadKey}
          src={mode.embedUrl}
          title={mode.name}
          className="min-h-0 flex-1 border-0"
          allow="geolocation; fullscreen"
        />
      )}
    </div>
  );
}
