import {
  ChevronDown,
  Clock,
  Globe,
  Mail,
  Navigation2,
  Phone,
  Star,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import type { POI, POIMetadata } from "~/types/poi";
import { formatFloorName, type FloorNames } from "~/utils/floor";
import {
  getOpenStatus,
  parseOpeningHours,
  todayName,
  weeklyRows,
} from "~/utils/opening-hours";
import { Button } from "../ui/button";
import ShareMenu from "./share-menu";

interface LocationDetailProps {
  selectedPOI: POI;
  floorNames?: FloorNames;
  shareUrl: string;
  handleBackClick: () => void;
  handleDirectionsClick: () => void;
}

const DESCRIPTION_PREVIEW_CHARS = 180;

/** Mappedin location states, rendered as badges like the vendor viewer. */
const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  new: {
    label: "New",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  "coming-soon": {
    label: "Coming soon",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  },
  "closed-temporarily": {
    label: "Temporarily closed",
    className:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  },
  "pop-up": {
    label: "Pop-up",
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  },
};

const STATUS_TONE_CLASSES = {
  open: "text-emerald-700 dark:text-emerald-400",
  closing: "text-amber-700 dark:text-amber-400",
  closed: "text-rose-700 dark:text-rose-400",
};

function formatCategory(category: string | undefined): string | null {
  if (!category) return null;
  const words = category.replaceAll(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Only http(s) URLs from venue data become links. */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const BUTTON_TARGETS = {
  tel: { prefix: "tel:", Icon: Phone },
  mailto: { prefix: "mailto:", Icon: Mail },
  href: { prefix: "", Icon: Globe },
};

/** Pointr-style card buttons (`action` + `intent`) as a link target. */
function buttonTarget(button: NonNullable<POIMetadata["buttons"]>[number]) {
  const { prefix, Icon } = BUTTON_TARGETS[button.action];
  const intent =
    button.action === "tel"
      ? button.intent.replaceAll(/\s+/g, "")
      : button.intent;
  const href =
    button.action === "href" ? (safeHttpUrl(intent) ?? "") : prefix + intent;
  return { href, Icon };
}

function displayHost(url: string): string {
  return new URL(url).host.replace(/^www\./, "");
}

function HiddenOnError({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

function DetailRow({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function OpeningHoursRow({ poi }: { poi: POI }) {
  const [expanded, setExpanded] = useState(false);
  const hours = parseOpeningHours(poi.metadata);
  if (!hours) return null;

  if (hours.kind === "text") {
    return (
      <DetailRow icon={<Clock size={16} />}>
        <p className="whitespace-pre-line text-sm">{hours.text}</p>
      </DetailRow>
    );
  }

  const status = getOpenStatus(hours.weekly);
  const today = todayName();
  return (
    <DetailRow icon={<Clock size={16} />}>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          data-testid="open-status"
          className={cn("font-medium", STATUS_TONE_CLASSES[status.tone])}
        >
          {status.label}
        </span>
        <ChevronDown
          size={16}
          className={cn("transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {weeklyRows(hours.weekly).map(([day, value]) => (
              <tr
                key={day}
                className={cn(day === today && "font-semibold text-foreground")}
              >
                <td className="py-0.5 pr-4 text-muted-foreground">{day}</td>
                <td className="py-0.5 text-right">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DetailRow>
  );
}

export default function LocationDetail({
  selectedPOI,
  floorNames,
  shareUrl,
  handleBackClick,
  handleDirectionsClick,
}: LocationDetailProps) {
  const [showFullDescription, setShowFullDescription] = useState(false);
  const metadata = selectedPOI.metadata ?? {};
  const logo = safeHttpUrl(metadata.logo);
  const images = (metadata.images ?? [])
    .map((image) => safeHttpUrl(image))
    .filter((image): image is string => image !== null);
  const website = safeHttpUrl(metadata.link);
  const socialLinks = Object.entries(metadata.social ?? {})
    .map(([network, url]) => [network, safeHttpUrl(url)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);
  const statusBadge = metadata.status ? STATUS_BADGES[metadata.status] : null;
  const category = formatCategory(metadata.category);
  const floorName =
    selectedPOI.floor === undefined
      ? null
      : formatFloorName(selectedPOI.floor, floorNames);
  const subtitle = [category, floorName].filter(Boolean).join(" · ");
  const description = metadata.description?.trim();
  const isLongDescription =
    (description?.length ?? 0) > DESCRIPTION_PREVIEW_CHARS;
  const tags = [...new Set(metadata.tags ?? [])].slice(0, 8);
  const buttons = (metadata.buttons ?? []).filter(
    (button) => button.action !== "href" || safeHttpUrl(button.intent),
  );

  return (
    <div className="space-y-4" data-testid="location-detail">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {logo && (
            <HiddenOnError
              src={logo}
              alt=""
              className="size-12 shrink-0 rounded-lg border border-border bg-white object-contain"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight">
              {selectedPOI.name}
            </h2>
            {subtitle && (
              <p
                data-testid="location-subtitle"
                className="text-xs text-gray-600 dark:text-gray-400"
              >
                {subtitle}
              </p>
            )}
            {statusBadge && (
              <span
                className={cn(
                  "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                  statusBadge.className,
                )}
              >
                {statusBadge.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 space-x-1">
          <ShareMenu url={shareUrl} title={selectedPOI.name} />
          <Button
            variant="ghost"
            onClick={handleBackClick}
            size="icon"
            aria-label="Close"
            className="rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      <Button
        className="w-full rounded-full"
        onClick={handleDirectionsClick}
        variant="primary"
      >
        <Navigation2 className="mr-2" size={18} />
        Directions
      </Button>

      {(metadata.rating !== undefined || metadata.priceLevel) && (
        <div className="flex items-center gap-2 text-sm">
          {metadata.rating !== undefined && (
            <span className="flex items-center gap-1">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="font-medium">{metadata.rating}</span>
              {metadata.numberOfRatings !== undefined && (
                <span className="text-muted-foreground">
                  ({metadata.numberOfRatings})
                </span>
              )}
            </span>
          )}
          {metadata.rating !== undefined && metadata.priceLevel && (
            <span className="text-muted-foreground">·</span>
          )}
          {metadata.priceLevel && (
            <span className="text-muted-foreground">{metadata.priceLevel}</span>
          )}
        </div>
      )}

      <OpeningHoursRow poi={selectedPOI} />

      {description && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <p className={cn(!showFullDescription && "line-clamp-3")}>
            {description}
          </p>
          {isLongDescription && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => setShowFullDescription((value) => !value)}
            >
              {showFullDescription ? "Read less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {images.map((image) => (
            <a
              key={image}
              href={image}
              target="_blank"
              rel="noreferrer"
              className="shrink-0"
            >
              <HiddenOnError
                src={image}
                alt={`${selectedPOI.name} photo`}
                className="h-24 w-36 rounded-lg object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {(metadata.phone || website || socialLinks.length > 0) && (
        <div className="space-y-2">
          {metadata.phone && (
            <DetailRow icon={<Phone size={16} />}>
              <a
                href={`tel:${metadata.phone.replaceAll(/\s+/g, "")}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {metadata.phone}
              </a>
            </DetailRow>
          )}
          {website && (
            <DetailRow icon={<Globe size={16} />}>
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-blue-600 hover:underline dark:text-blue-400"
              >
                {displayHost(website)}
              </a>
            </DetailRow>
          )}
          {socialLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-7">
              {socialLinks.map(([network, url]) => (
                <a
                  key={network}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs capitalize hover:bg-secondary"
                >
                  {network}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {buttons.map((button) => {
            const { href, Icon } = buttonTarget(button);
            return (
              <Button key={button.name} variant="outline" size="sm" asChild>
                <a href={href} target="_blank" rel="noreferrer">
                  <Icon size={14} />
                  {button.name}
                </a>
              </Button>
            );
          })}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
