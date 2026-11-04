import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { importNativeBoundaryPatchFile } from "../../app/indoor-project/native-boundary-patch-file";
import type { NativeBoundaryPatch } from "../../app/indoor-project/native-boundary-patches";
import type { NativeSelectionContactRepairs } from "../../app/indoor-project/native-selection-contact-repairs";
import type { IndoorProject } from "../../app/indoor-project/package";

/** Owner-reviewed native-boundary patches as a regeneration source review.
 *
 * Applying patches to an authoring master (saveNativeBoundaryPatches with
 * apply=true) adds tagged wall faces, drops the prepared circulation geometry
 * and marks the dataset regenerated=false. Such a master is not a regeneration
 * input: its unchanged prepared graph can no longer prove its native-cell
 * floor aliases, and every other source review binds the original dataset and
 * rooms bytes. So the source master stays unchanged, and the applied rows join
 * the reviewed source rooms here, like the door aperture review. The compiler
 * then consumes them (reviewedBoundaryWalls per level) and refuses any applied
 * patch it cannot compile.
 *
 * The rows themselves come from a master that the project's own application
 * (importNativeBoundaryPatchFile, the guard pass, saveNativeBoundaryPatches per
 * row) wrote from this same source. That application takes hours, so it is not
 * repeated on every resumed run. Instead this check proves the delta exactly:
 * - the patch file still imports into the unchanged source (exact model, wall,
 *   level and door evidence) with importNativeBoundaryPatchFile;
 * - the applied master has the same model, and its rooms differ from the source
 *   rooms only in nativeBoundaryPatches and nativeSelectionContactRepairs;
 * - every source patch row is unchanged, and the only added rows are the file's
 *   rows, each equal to its imported proposal with status "applied";
 * - the only changed contact repairs are the listed supersessions, each from
 *   "applied" to "restored" with its original notes kept as a prefix. */
export type SourceBoundaryPatchReceipt = {
  format: "checked-source-boundary-patch-review-v1";
  sourceModelSha256: string;
  originalSourceRoomsSha256: string;
  patchFileSha256: string;
  supersessionsSha256?: string;
  appliedMasterSha256: string;
  appliedMasterRoomsSha256: string;
  appliedRows: { id: string; levelId: number }[];
  restoredContactRepairIds: string[];
  sourceBoundaryRowsUnchanged: true;
  onlyBoundaryPatchesAndContactRepairsChanged: true;
};
export type CheckedSourceBoundaryPatches = {
  rows: NativeBoundaryPatch[];
  sourceContactRepairs?: NativeSelectionContactRepairs;
  contactRepairs?: NativeSelectionContactRepairs;
  receipt: SourceBoundaryPatchReceipt;
};

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
// Key-order independent comparison: saved rows are rebuilt object spreads.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );

export function checkSourceBoundaryPatches(
  source: IndoorProject,
  patchFileBytes: Uint8Array,
  supersessionBytes: Uint8Array | undefined,
  appliedMasterBytes: Uint8Array,
): CheckedSourceBoundaryPatches {
  const modelSha256 = source.dataset.source.modelSha256;
  const file = JSON.parse(strFromU8(patchFileBytes));
  const fileRows: NativeBoundaryPatch[] = file?.nativeBoundaryPatches?.patches;
  assert.ok(Array.isArray(fileRows) && fileRows.length > 0, "Empty patch file");
  const ids = fileRows.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "Duplicate patch ids");
  // Exact evidence against the unchanged source: model, levels, supporting
  // wall footprints and doors. New rows come back as proposals.
  const imported = importNativeBoundaryPatchFile(source, file);
  const proposals = new Map(
    imported.rooms
      .nativeBoundaryPatches!.patches.filter((p) => ids.includes(p.id))
      .map((p) => [p.id, p]),
  );
  assert.equal(proposals.size, ids.length, "A patch row did not import");
  for (const p of proposals.values())
    assert.equal(p.status, "proposed", `${p.id} must import as a proposal`);

  // Only the manifest and the source rooms are read from the applied master.
  const roomsPath = source.manifest.floors.path;
  const archive = unzipSync(appliedMasterBytes, {
    filter: (e) => e.name === "manifest.json" || e.name === roomsPath,
  });
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]!));
  assert.equal(manifest.format, "reviter-project", "Not an authoring master");
  assert.equal(
    manifest.model.sha256,
    modelSha256,
    "Applied master belongs to a different Revit model",
  );
  assert.equal(
    manifest.model.sha256,
    source.manifest.model.sha256,
    "Applied master model differs from the source",
  );
  assert.equal(manifest.floors.path, roomsPath, "Source rooms path differs");
  const roomsBytes = archive[roomsPath]!;
  assert.ok(roomsBytes, "Applied master has no source rooms");
  assert.equal(roomsBytes.length, manifest.floors.bytes);
  const appliedMasterRoomsSha256 = sha(roomsBytes);
  assert.equal(appliedMasterRoomsSha256, manifest.floors.sha256);
  const sourceRoomsBytes = source.files[source.manifest.floors.path]!;
  assert.equal(sha(sourceRoomsBytes), source.manifest.floors.sha256);
  const after = JSON.parse(strFromU8(roomsBytes)) as Record<string, unknown>;
  const before = JSON.parse(strFromU8(sourceRoomsBytes)) as Record<
    string,
    unknown
  >;
  const changed = ["nativeBoundaryPatches", "nativeSelectionContactRepairs"];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
    if (!changed.includes(key))
      assert.equal(
        JSON.stringify(after[key]),
        JSON.stringify(before[key]),
        `Applied master changed source rooms field ${key}`,
      );

  type Patches = { version: 1; patches: NativeBoundaryPatch[] } & Record<
    string,
    unknown
  >;
  const priorPatches = before.nativeBoundaryPatches as Patches | undefined,
    appliedPatches = after.nativeBoundaryPatches as Patches;
  assert.equal(
    canonical({ ...appliedPatches, patches: undefined }),
    canonical({ ...(priorPatches ?? { version: 1 }), patches: undefined }),
    "Applied master changed the boundary patch collection",
  );
  const prior = priorPatches?.patches ?? [];
  assert.equal(appliedPatches.patches.length, prior.length + ids.length);
  for (const p of prior)
    assert.equal(
      canonical(appliedPatches.patches.find((a) => a.id === p.id)),
      canonical(p),
      `Source boundary patch ${p.id} changed`,
    );
  const rows = appliedPatches.patches.filter((p) => ids.includes(p.id));
  assert.equal(rows.length, ids.length, "Applied master lacks a patch row");
  for (const row of rows)
    assert.equal(
      canonical(row),
      canonical({
        ...proposals.get(row.id)!,
        status: "applied",
        notes: proposals.get(row.id)!.notes.trim(),
      }),
      `${row.id} differs from its reviewed proposal`,
    );

  const supersessions: Record<string, string[]> = supersessionBytes
    ? JSON.parse(strFromU8(supersessionBytes)).supersessions
    : {};
  const by = new Map<string, string>();
  for (const [patchId, repairIds] of Object.entries(supersessions)) {
    assert.ok(ids.includes(patchId), `Supersession for unknown ${patchId}`);
    for (const r of repairIds) by.set(r, patchId);
  }
  type Repairs = NativeSelectionContactRepairs | undefined;
  const priorRepairs = before.nativeSelectionContactRepairs as Repairs,
    appliedRepairs = after.nativeSelectionContactRepairs as Repairs;
  assert.equal(
    canonical({ ...appliedRepairs, repairs: undefined }),
    canonical({ ...priorRepairs, repairs: undefined }),
    "Applied master changed the contact repair collection",
  );
  const restored: string[] = [];
  const priorList = priorRepairs?.repairs ?? [];
  assert.equal(appliedRepairs?.repairs.length ?? 0, priorList.length);
  for (const [i, r] of priorList.entries()) {
    const a = appliedRepairs!.repairs[i]!;
    if (!by.has(r.id)) {
      assert.equal(
        canonical(a),
        canonical(r),
        `Contact repair ${r.id} changed`,
      );
      continue;
    }
    assert.equal(r.status, "applied", `${r.id} was not applied in the source`);
    assert.equal(a.status, "restored", `${r.id} was not restored`);
    assert.ok(
      a.notes.startsWith(r.notes) && a.notes.includes(by.get(r.id)!),
      `${r.id} lost its notes or its superseding patch`,
    );
    assert.equal(
      canonical({ ...a, status: r.status, notes: r.notes }),
      canonical(r),
      `${r.id} changed beyond its status and notes`,
    );
    restored.push(r.id);
  }
  assert.equal(restored.length, by.size, "A listed contact repair is missing");

  return {
    rows,
    sourceContactRepairs: priorRepairs,
    contactRepairs: appliedRepairs,
    receipt: {
      format: "checked-source-boundary-patch-review-v1",
      sourceModelSha256: modelSha256,
      originalSourceRoomsSha256: source.manifest.floors.sha256,
      patchFileSha256: sha(patchFileBytes),
      ...(supersessionBytes
        ? { supersessionsSha256: sha(supersessionBytes) }
        : {}),
      appliedMasterSha256: sha(appliedMasterBytes),
      appliedMasterRoomsSha256,
      appliedRows: rows.map((p) => ({ id: p.id, levelId: p.levelId })),
      restoredContactRepairIds: restored,
      sourceBoundaryRowsUnchanged: true,
      onlyBoundaryPatchesAndContactRepairsChanged: true,
    },
  };
}

/** Add the checked rows to the reviewed source rooms. Earlier source reviews
 * may have replaced or added boundary rows; they never touch these ids or the
 * contact repairs, which must still equal the source. */
export function roomsWithSourceBoundaryPatches<T extends object>(
  reviewed: T,
  checked: CheckedSourceBoundaryPatches,
): T {
  const rooms = reviewed as {
    nativeBoundaryPatches?: { patches: NativeBoundaryPatch[] };
    nativeSelectionContactRepairs?: NativeSelectionContactRepairs;
  };
  const existing = rooms.nativeBoundaryPatches?.patches ?? [];
  for (const row of checked.rows)
    assert.ok(
      !existing.some((p) => p.id === row.id),
      `${row.id} already exists in the reviewed rooms`,
    );
  assert.equal(
    canonical(rooms.nativeSelectionContactRepairs),
    canonical(checked.sourceContactRepairs),
    "Reviewed rooms changed the source contact repairs",
  );
  return {
    ...reviewed,
    nativeBoundaryPatches: {
      ...(rooms.nativeBoundaryPatches ?? { version: 1 }),
      patches: [...existing, ...structuredClone(checked.rows)],
    },
    ...(checked.contactRepairs
      ? {
          nativeSelectionContactRepairs: structuredClone(
            checked.contactRepairs,
          ),
        }
      : {}),
  } as T;
}
