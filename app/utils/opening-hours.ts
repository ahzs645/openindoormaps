import type { POIMetadata, WeeklyHours } from "~/types/poi";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const SHORT_DAYS: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** Within this many minutes of closing, a POI is shown as "closing soon". */
const CLOSING_SOON_MINUTES = 60;

export type OpeningHours =
  | { kind: "weekly"; weekly: WeeklyHours }
  | { kind: "text"; text: string };

export interface OpenStatus {
  isOpen: boolean;
  label: string;
  tone: "open" | "closing" | "closed";
}

function parseRangeKey(key: string): number[] {
  const [start, end] = key.toLowerCase().split("-");
  const from = SHORT_DAYS[start.slice(0, 3)];
  const to = end ? SHORT_DAYS[end.slice(0, 3)] : from;
  if (from === undefined || to === undefined) return [];
  const days = [];
  for (let day = from; ; day = (day + 1) % 7) {
    days.push(day);
    if (day === to) break;
  }
  return days;
}

/**
 * Normalizes the hour formats found in ported venues into one shape:
 * Pointr/Mappedin weekly `openHours`, galleria range maps
 * (`{ "mon-fri": "09:00-21:00" }`) and free-text strings.
 */
export function parseOpeningHours(
  metadata: POIMetadata | undefined,
): OpeningHours | null {
  if (!metadata) return null;
  if (metadata.openHours && Object.keys(metadata.openHours).length > 0) {
    return { kind: "weekly", weekly: metadata.openHours };
  }

  const raw = metadata.openingHours;
  if (typeof raw === "string" && raw.trim()) {
    const text = raw
      .replaceAll(String.raw`\n`, "\n")
      .replaceAll(/[ \t]+/g, " ")
      .trim();
    return { kind: "text", text };
  }

  if (raw && typeof raw === "object") {
    const weekly: WeeklyHours = {};
    for (const [key, range] of Object.entries(raw)) {
      const [opens, closes] = String(range).split("-");
      if (!opens || !closes) continue;
      for (const day of parseRangeKey(key)) {
        const name = WEEKDAYS[day];
        weekly[name] = [...(weekly[name] ?? []), [opens.trim(), closes.trim()]];
      }
    }
    if (Object.keys(weekly).length > 0) return { kind: "weekly", weekly };
  }

  return null;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

/** Monday-first day index (0 = Monday) for a Date. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function intervalsFor(weekly: WeeklyHours, dayIndex: number) {
  return (weekly[WEEKDAYS[dayIndex]] ?? []).map(([opens, closes]) => {
    const start = toMinutes(opens);
    let end = toMinutes(closes);
    // "00:00" or an earlier close means the interval runs past midnight.
    if (end <= start) end += 24 * 60;
    return { opens, closes, start, end };
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  return `${hours.padStart(2, "0")}:${(minutes ?? "00").padStart(2, "0")}`;
}

/**
 * Open/closed status in the style of the vendor cards ("Open · Closes 20:00",
 * "Closing soon", "Closed · Opens Tue 09:00"). Uses the viewer's local clock.
 */
export function getOpenStatus(
  weekly: WeeklyHours,
  now: Date = new Date(),
): OpenStatus {
  const today = mondayIndex(now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const candidates = [
    // Yesterday's late interval spilling past midnight.
    ...intervalsFor(weekly, (today + 6) % 7).map((interval) => ({
      ...interval,
      start: interval.start - 24 * 60,
      end: interval.end - 24 * 60,
    })),
    ...intervalsFor(weekly, today),
  ];

  for (const interval of candidates) {
    if (minutesNow >= interval.start && minutesNow < interval.end) {
      if (interval.end - interval.start >= 24 * 60) {
        return { isOpen: true, label: "Open 24 hours", tone: "open" };
      }
      const remaining = interval.end - minutesNow;
      return remaining <= CLOSING_SOON_MINUTES
        ? {
            isOpen: true,
            label: `Closing soon · ${formatTime(interval.closes)}`,
            tone: "closing",
          }
        : {
            isOpen: true,
            label: `Open · Closes ${formatTime(interval.closes)}`,
            tone: "open",
          };
    }
  }

  for (let offset = 0; offset < 7; offset++) {
    const dayIndex = (today + offset) % 7;
    const next = intervalsFor(weekly, dayIndex)
      .filter((interval) => offset > 0 || interval.start > minutesNow)
      .sort((a, b) => a.start - b.start)[0];
    if (!next) continue;
    let when = `${WEEKDAYS[dayIndex].slice(0, 3)} `;
    if (offset === 0) when = "";
    if (offset === 1) when = "tomorrow ";
    return {
      isOpen: false,
      label: `Closed · Opens ${when}${formatTime(next.opens)}`,
      tone: "closed",
    };
  }

  return { isOpen: false, label: "Closed", tone: "closed" };
}

/** One row per weekday, e.g. `["Monday", "09:00–20:00"]` or `"Closed"`. */
export function weeklyRows(weekly: WeeklyHours): [string, string][] {
  return WEEKDAYS.map((day) => {
    const intervals = weekly[day] ?? [];
    if (intervals.length === 0) return [day, "Closed"];
    return [
      day,
      intervals
        .map(([opens, closes]) => `${formatTime(opens)}–${formatTime(closes)}`)
        .join(", "),
    ];
  });
}

export function todayName(now: Date = new Date()): string {
  return WEEKDAYS[mondayIndex(now)];
}
