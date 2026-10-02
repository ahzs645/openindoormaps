import { Building2, FileArchive, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import locations from "~/data/locations";
import revitImports from "~/data/revit-imports";

export default function WelcomePage() {
  const locationEntries = Object.values(locations);
  const revitImportEntries = Object.values(revitImports);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg border border-border bg-card">
          <Building2 className="size-5 text-foreground" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-normal">
          OpenIndoorMaps
        </h1>
        <p className="text-muted-foreground">Select a workspace</p>
      </div>

      <div className="grid w-full max-w-3xl gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Map Locations
          </h2>
          <div className="flex flex-col gap-3">
            {locationEntries.map((location) => (
              <Link
                key={location.slug}
                to={`/${location.slug}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary"
              >
                <MapPin className="size-5 text-sky-600 dark:text-sky-300" />
                <span className="font-medium">{location.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Revit Imports
          </h2>
          <div className="flex flex-col gap-3">
            <Link
              to="/projects/indoor"
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary"
            >
              <FileArchive className="size-5 text-teal-600 dark:text-teal-300" />
              <span className="min-w-0">
                <span className="block font-medium">
                  Prepared indoor projects
                </span>
                <span className="block text-sm text-muted-foreground">
                  Import a ZIP · floor maps, routing and 3D review
                </span>
              </span>
            </Link>
            {revitImportEntries.map((fixture) => (
              <Link
                key={fixture.id}
                to={`/imports/revit/${fixture.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary"
              >
                <FileArchive className="size-5 text-amber-600 dark:text-amber-300" />
                <span className="min-w-0">
                  <span className="block font-medium">{fixture.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    Revit {fixture.nativeRvt.version} - metadata only
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
