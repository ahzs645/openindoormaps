import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  DoorOpen,
  MapPin,
  MoreHorizontal,
  Pause,
  Play,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { routeProgressPositions } from "~/utils/route-progress-layout";
import { createPortal } from "react-dom";
import type { RouteInstruction } from "~/indoor-directions/types";
import type { RouteSummary, RouteTiming } from "~/utils/route-summary";
import { summarizeRoute } from "~/utils/route-summary";
import { useMap } from "../map/map";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "~/lib/utils";

function ElevatorIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 2v8m-3-5 3-3 3 3m11-3v8m-3-3 3 3 3-3" />
      <rect x="5" y="13" width="22" height="17" rx="3" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
      <circle cx="20" cy="18" r="1" fill="currentColor" />
      <path d="M10 26v-5h4v5m4 0v-5h4v5M12 21v7m8-7v7" />
    </svg>
  );
}

export function HospitalInstructionIcon({
  instruction,
}: {
  instruction: RouteInstruction;
}) {
  if (instruction.type === "floor-change")
    return instruction.networkType === "elevator" ? (
      <ElevatorIcon />
    ) : (
      <ArrowDownUp />
    );
  if (instruction.type === "building-change") return <DoorOpen />;
  if (instruction.type === "arrive") return <MapPin fill="currentColor" />;
  if (instruction.type === "depart") return <ArrowRight fill="currentColor" />;
  if (instruction.type === "turn") {
    if (instruction.turnKind === "around") return <Undo2 />;
    if (instruction.turnKind === "slight")
      return instruction.turnDirection === "left" ? (
        <ArrowUpLeft />
      ) : (
        <ArrowUpRight />
      );
    return instruction.turnDirection === "left" ? (
      <CornerUpLeft />
    ) : (
      <CornerUpRight />
    );
  }
  return <ArrowUp fill="currentColor" />;
}

function stepTime(instruction: RouteInstruction, timing?: RouteTiming) {
  const seconds = summarizeRoute([instruction], timing).durationSeconds;
  if (seconds < 60) return "Less than a minute";
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

interface PreviewProps {
  instructions: RouteInstruction[];
  activeStep: number;
  summary: RouteSummary;
  timing?: RouteTiming;
  departure: string;
  destination: string;
  building: string;
  floor: string;
  isPreviewing: boolean;
  onBack: () => void;
  onStep: (index: number) => void;
  onPreview: () => void;
}

function RouteOptions({
  isPreviewing,
  onPreview,
  onBack,
}: Pick<PreviewProps, "isPreviewing" | "onPreview" | "onBack">) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Route options"
          className="rounded-lg p-2 text-[#666] hover:bg-gray-100"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <DropdownMenuItem
          onSelect={onPreview}
          aria-label={isPreviewing ? "Stop preview" : "Preview route"}
        >
          {isPreviewing ? (
            <Pause className="mr-2 size-4" />
          ) : (
            <Play className="mr-2 size-4" />
          )}
          {isPreviewing ? "Stop preview" : "Preview route"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onBack}>Edit directions</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RouteProgress({
  instructions,
  activeStep,
  onStep,
}: Pick<PreviewProps, "instructions" | "activeStep" | "onStep">) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const actual = entries[0]?.contentRect.width;
      if (actual > 0) setWidth(actual);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const positions = routeProgressPositions(instructions, width);
  const progress = positions[activeStep] ?? 0;
  return (
    <div
      ref={track}
      className="relative mx-2 my-5 h-2 rounded-full bg-[#e6e6e6]"
    >
      <div
        role="progressbar"
        aria-label="Route progress"
        aria-valuemin={0}
        aria-valuemax={instructions.length - 1}
        aria-valuenow={activeStep}
        className="h-full rounded-full bg-[#35b6f8] transition-[width]"
        style={{ width: `${progress * 100}%` }}
      />
      {instructions.map((step, index) => (
        <button
          key={index}
          aria-label={`Go to step ${index + 1}: ${step.message}`}
          onClick={() => onStep(index)}
          style={{
            left: `${positions[index] * 100}%`,
          }}
          className={cn(
            "absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
            step.type === "floor-change"
              ? "z-10 size-6 border border-[#0075ff] bg-white p-1 text-[#293338] shadow"
              : "size-5",
          )}
        >
          {step.type === "floor-change" && (
            <HospitalInstructionIcon instruction={step} />
          )}
          {step.type !== "floor-change" && index === 0 && (
            <span className="size-4 rounded-full border-2 border-[#aaa] bg-white shadow" />
          )}
          {step.type !== "floor-change" &&
            index === instructions.length - 1 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-white shadow">
                <MapPin className="size-3 text-[#293338]" fill="currentColor" />
              </span>
            )}
          {step.type !== "floor-change" &&
            index > 0 &&
            index < instructions.length - 1 && (
              <span className="size-1 rounded-full bg-[#c9c9c9]" />
            )}
        </button>
      ))}
    </div>
  );
}

export default function HospitalRoutePreview({
  instructions,
  activeStep,
  summary,
  timing,
  departure,
  destination,
  building,
  floor,
  isPreviewing,
  onBack,
  onStep,
  onPreview,
}: PreviewProps) {
  const { map } = useMap();
  const stepList = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = stepList.current;
    if (list?.offsetParent)
      list.querySelector('[aria-current="step"]')?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
  }, [activeStep]);
  const active = instructions[activeStep];
  const minutes = Math.max(1, Math.round(summary.durationSeconds / 60));
  const totalLabel = `${minutes} ${minutes === 1 ? "minute" : "minutes"} total`;
  const routeLabel = `Directions to ${destination}`;
  const heading = (
    <div className="text-[#3d3d3d]">
      <p className="text-sm font-medium text-[#666] md:text-[13px]">
        {routeLabel}
      </p>
      <p className="text-xl font-bold leading-tight md:text-[22px]">
        {totalLabel}
      </p>
      <span className="sr-only">{minutes} min</span>
    </div>
  );
  const options = (
    <RouteOptions
      isPreviewing={isPreviewing}
      onPreview={onPreview}
      onBack={onBack}
    />
  );
  const controls = (
    <div className="grid grid-cols-2 gap-3">
      <button
        aria-label="Previous step"
        disabled={activeStep <= 0}
        onClick={() => onStep(activeStep - 1)}
        className="flex h-11 items-center justify-center rounded-lg bg-[#f0f0f0] text-[#293338] hover:bg-gray-200 disabled:opacity-40"
      >
        <ArrowLeft className="size-6" />
      </button>
      <button
        aria-label="Next step"
        disabled={activeStep >= instructions.length - 1}
        onClick={() => onStep(activeStep + 1)}
        className="flex h-11 items-center justify-center rounded-lg bg-[#f0f0f0] text-[#293338] hover:bg-gray-200 disabled:opacity-40"
      >
        <ArrowRight className="size-6" />
      </button>
    </div>
  );
  const progressBar = (
    <RouteProgress
      instructions={instructions}
      activeStep={activeStep}
      onStep={onStep}
    />
  );

  return (
    <>
      <section
        data-testid="hospital-desktop-preview"
        aria-label="Route steps"
        className="hidden h-full min-h-0 flex-col text-[#354047] md:flex"
      >
        <header data-testid="route-summary" className="shrink-0 pb-3">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 rounded p-1 text-base font-semibold text-[#666]"
            >
              <ArrowLeft className="size-5" />
              Back
            </button>
            {options}
          </div>
          {heading}
          {progressBar}
        </header>
        <ol
          ref={stepList}
          className="min-h-0 flex-1 overflow-y-auto border-y-2 border-[#e5e5e5] py-2 pr-1"
          data-testid="hospital-step-list"
        >
          <li className="relative mb-2 pl-8 text-lg font-bold leading-snug text-black">
            <span className="absolute left-0 top-2 size-3 rounded-full bg-[#d9d9d9]" />
            {departure}
          </li>
          {instructions.map((instruction, index) =>
            instruction.type === "depart" ? null : (
              <li
                key={index}
                className="relative ml-1 border-l-2 border-dotted border-[#ddd] pb-1 pl-4 last:border-transparent"
              >
                <button
                  aria-label={instruction.message}
                  aria-current={index === activeStep ? "step" : undefined}
                  onClick={() => onStep(index)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left hover:bg-gray-100",
                    index === activeStep &&
                      "bg-[#fa8715] text-white hover:bg-[#fa8715]",
                  )}
                >
                  <span
                    className={cn(
                      "size-6 shrink-0 [&>svg]:size-full [&>svg]:stroke-[2.7]",
                      index === activeStep ? "text-white" : "text-black",
                    )}
                  >
                    <HospitalInstructionIcon instruction={instruction} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium leading-snug">
                      {instruction.message}
                    </span>
                    <span
                      className={cn(
                        "block text-[13px] font-medium",
                        index !== activeStep && "text-[#777]",
                      )}
                    >
                      {stepTime(instruction, timing)}
                    </span>
                  </span>
                </button>
              </li>
            ),
          )}
        </ol>
        <footer className="shrink-0 pb-4 pt-6">{controls}</footer>
      </section>
      {map &&
        createPortal(
          <div
            data-testid="hospital-mobile-preview"
            className="pointer-events-none absolute inset-0 z-40 md:hidden"
          >
            <section
              aria-label="Current direction"
              className="pointer-events-auto absolute inset-x-0 top-0 rounded-b-3xl bg-white px-4 pb-4 pt-[max(16px,env(safe-area-inset-top))] shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 py-1 text-sm font-semibold text-[#666]"
                >
                  <ArrowLeft className="size-5" />
                  Close
                </button>
                {options}
              </div>
              <div className="flex items-start gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#f2f2f2] p-3 text-[#737373] [&>svg]:size-full">
                  <HospitalInstructionIcon instruction={active} />
                </span>
                <div>
                  <p
                    data-testid="mobile-current-instruction"
                    className="text-base font-bold leading-snug text-black"
                  >
                    {active.message}
                  </p>
                  <p className="text-sm font-medium text-[#999]">
                    {stepTime(active, timing)}
                  </p>
                </div>
              </div>
            </section>
            {isPreviewing && (
              <button
                aria-label="Stop preview"
                onClick={onPreview}
                className="pointer-events-auto absolute right-3 top-1/2 rounded-full bg-white p-2 shadow"
              >
                <Pause className="size-5" />
              </button>
            )}
            <div className="pointer-events-auto absolute inset-x-0 bottom-0">
              <p
                data-testid="mobile-route-floor"
                className="mx-auto mb-2 w-fit max-w-[calc(100%-32px)] rounded-lg bg-[#374151] px-3 py-2 text-center text-sm font-semibold text-white shadow"
              >
                {building}
                <span className="mx-2 text-white/40">|</span>
                {floor}
              </p>
              <section
                aria-label="Route summary and step controls"
                className="rounded-t-3xl bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-1 shadow-sm"
              >
                {progressBar}
                <div className="mb-4">{heading}</div>
                {controls}
              </section>
            </div>
          </div>,
          map.getContainer(),
        )}
    </>
  );
}
