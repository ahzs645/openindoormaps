import { cn } from "~/lib/utils";

interface MapLogoControlProps {
  className?: string;
}

export function MapLogoControl({ className }: MapLogoControlProps) {
  return (
    <a
      aria-label="OpenIndoorMaps"
      className={cn(
        "absolute bottom-3 left-3 z-20 flex h-9 items-center gap-1 rounded-md border bg-background/95 px-2 shadow-sm backdrop-blur transition-colors hover:bg-accent md:bottom-4",
        className,
      )}
      href="https://github.com/openindoormaps/openindoormaps"
      rel="noopener noreferrer"
      target="_blank"
    >
      <img
        alt=""
        aria-hidden="true"
        className="size-6"
        src={`${import.meta.env.BASE_URL}images/oim-ctrl-logo.svg`}
      />
      <img
        alt="OpenIndoorMaps"
        className="hidden h-5 w-auto dark:invert sm:block"
        src={`${import.meta.env.BASE_URL}images/oim-ctrl-logo-text.svg`}
      />
    </a>
  );
}
