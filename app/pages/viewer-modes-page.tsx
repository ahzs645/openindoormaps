import { Building2, ExternalLink, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import viewerModes from "~/data/viewer-modes";

const statusStyles: Record<string, string> = {
  working:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  blocked: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export default function ViewerModesPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg border border-border bg-card">
          <Building2 className="size-5 text-foreground" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-normal">
          Viewer Modes
        </h1>
        <p className="text-muted-foreground">
          Unified indoor map viewer framework - jsmap recovery test bench
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-3 md:grid-cols-2">
        {viewerModes.map((mode) => (
          <Link
            key={mode.id}
            to={`/modes/${mode.id}`}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                {mode.kind === "embedded" ? (
                  <ExternalLink className="size-4 text-violet-600 dark:text-violet-300" />
                ) : (
                  <MapPin className="size-4 text-sky-600 dark:text-sky-300" />
                )}
                {mode.name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[mode.status]}`}
              >
                {mode.status}
              </span>
            </span>
            <span className="text-sm text-muted-foreground">
              {mode.description}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {mode.source}
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        <Link to="/" className="underline hover:text-foreground">
          Back to workspaces
        </Link>
      </p>
    </main>
  );
}
