import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Box,
  Boxes,
  CheckCircle2,
  Clock3,
  CircleDashed,
  Database,
  FileArchive,
  FileOutput,
  FileText,
  Image as ImageIcon,
  Layers3,
  PackageOpen,
  Route,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import revitImports from "~/data/revit-imports";
import type {
  RevitImportFixture,
  RevitImportTask,
  RevitImportTaskStatus,
  RevitModelArtifact,
  RevitModelArtifactStatus,
} from "~/types/revit-import";

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function statusLabel(status: RevitImportFixture["status"]) {
  if (status === "geojson-ready") return "GeoJSON ready";
  if (status === "ifc-ready") return "IFC ready";
  return "Metadata only";
}

function taskStatusLabel(status: RevitImportTaskStatus) {
  if (status === "done") return "Done";
  if (status === "current") return "Current";
  if (status === "blocked") return "Blocked";
  return "Next";
}

function artifactStatusLabel(status: RevitModelArtifactStatus) {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Blocked";
  return "Missing";
}

function taskStatusStyle(status: RevitImportTaskStatus) {
  if (status === "done") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
  }

  if (status === "current") {
    return "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100";
  }

  if (status === "blocked") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100";
  }

  return "border-border bg-secondary text-secondary-foreground";
}

function artifactStatusStyle(status: RevitModelArtifactStatus) {
  if (status === "ready") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
  }

  if (status === "blocked") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100";
  }

  return "border-border bg-secondary text-secondary-foreground";
}

function TaskIcon({ status }: { status: RevitImportTaskStatus }) {
  if (status === "done") return <CheckCircle2 className="size-4" />;
  if (status === "current") return <CircleDashed className="size-4" />;
  if (status === "blocked") return <AlertCircle className="size-4" />;
  return <Clock3 className="size-4" />;
}

interface MetricProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function Metric({ icon: Icon, label, value }: MetricProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="size-4" />
      </div>
      <div className="text-2xl font-semibold tracking-normal text-foreground">
        {value}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

interface StepProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  state: "done" | "current" | "next";
}

function Step({ icon: Icon, label, state }: StepProps) {
  const stateClasses = {
    current:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
    done: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
    next: "border-border bg-card text-muted-foreground",
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${stateClasses[state]}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function TaskItem({ task }: { task: RevitImportTask }) {
  return (
    <li className="grid gap-3 border-b border-border py-4 last:border-b-0 sm:grid-cols-[150px_1fr]">
      <div>
        <span
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${taskStatusStyle(
            task.status,
          )}`}
        >
          <TaskIcon status={task.status} />
          {taskStatusLabel(task.status)}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{task.label}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {task.detail}
        </p>
        {task.output ? (
          <p className="mt-2 break-words text-xs font-medium text-muted-foreground">
            Output: <span className="text-foreground">{task.output}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

interface ArtifactRowProps {
  artifact: RevitModelArtifact;
  icon: ComponentType<{ className?: string }>;
}

function ArtifactRow({ artifact, icon: Icon }: ArtifactRowProps) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {artifact.label}
            </h3>
            {artifact.path ? (
              <p className="mt-1 break-words text-xs font-medium text-muted-foreground">
                {artifact.path}
              </p>
            ) : null}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold ${artifactStatusStyle(
            artifact.status,
          )}`}
        >
          {artifactStatusLabel(artifact.status)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {artifact.detail}
      </p>
      {artifact.generatedFrom ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          Generated from{" "}
          <span className="text-foreground">{artifact.generatedFrom}</span>
        </p>
      ) : null}
    </div>
  );
}

export default function RevitImportPage() {
  const { importId } = useParams<{ importId: string }>();
  const fixture = importId ? revitImports[importId] : undefined;

  if (!fixture) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          OpenIndoorMaps
        </Link>

        <section className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
          <div className="rounded-lg border border-border bg-card p-4">
            {fixture.preview ? (
              <img
                src={fixture.preview.src}
                alt={`${fixture.name} preview`}
                className="aspect-square w-full rounded-md border border-border bg-secondary object-contain"
                width={fixture.preview.width}
                height={fixture.preview.height}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
                <ImageIcon className="size-10" />
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                {statusLabel(fixture.status)}
              </span>
              <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                Revit {fixture.nativeRvt.version}
              </span>
              <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                {fixture.nativeRvt.parser}
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                {fixture.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {fixture.sourceFileName}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={FileArchive}
                label="RVT file"
                value={formatBytes(fixture.sourceFile.sizeBytes)}
              />
              <Metric
                icon={Database}
                label="Container entries"
                value={formatNumber(fixture.container.entryCount)}
              />
              <Metric
                icon={Boxes}
                label="Element-table records"
                value={formatNumber(
                  fixture.streamDiagnostics.elemTable.recordCount,
                )}
              />
              <Metric
                icon={Box}
                label="Partition chunks"
                value={formatNumber(
                  fixture.streamDiagnostics.largestPartition.gzipMemberCount,
                )}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Native RVT Metadata</h2>
              </div>
              <dl>
                <DetailRow
                  label="Revit build"
                  value={fixture.nativeRvt.build}
                />
                <DetailRow
                  label="File version"
                  value={String(fixture.nativeRvt.fileVersion)}
                />
                <DetailRow label="Locale" value={fixture.nativeRvt.locale} />
                <DetailRow label="App" value={fixture.nativeRvt.appName} />
                <DetailRow
                  label="Document ID"
                  value={fixture.nativeRvt.documentId}
                />
                <DetailRow
                  label="Identity ID"
                  value={fixture.nativeRvt.identityId}
                />
                <DetailRow
                  label="Worksharing"
                  value={fixture.nativeRvt.worksharing}
                />
                <DetailRow label="SHA-256" value={fixture.sourceFile.sha256} />
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Task List</h2>
              </div>
              <ul>
                {fixture.taskList.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Layers3 className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Import Path</h2>
              </div>
              <div className="space-y-2">
                <Step icon={BadgeCheck} label="RVT preflight" state="done" />
                <Step icon={CircleDashed} label="RVT to IFC" state="current" />
                <Step icon={Route} label="IFC to routes" state="next" />
                <Step icon={Database} label="GeoJSON location" state="next" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-1 flex items-center gap-2">
                <PackageOpen className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">3D Model</h2>
              </div>
              <ArtifactRow
                artifact={fixture.modelArtifacts.ifc}
                icon={FileOutput}
              />
              <ArtifactRow artifact={fixture.modelArtifacts.glb} icon={Box} />
              <ArtifactRow
                artifact={fixture.modelArtifacts.openIndoorMapsGeoJson}
                icon={Database}
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">OpenIndoorMaps Target</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {fixture.openIndoorMapsImport.targetCollections.map(
                  (collection) => (
                    <span
                      key={collection}
                      className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
                    >
                      {collection}
                    </span>
                  ),
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {fixture.openIndoorMapsImport.nextConversion}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
