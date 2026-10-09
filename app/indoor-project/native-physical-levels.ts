import type { IndoorDataset } from "./contract";

/** Intermediate display membership never changes a room's physical height.
 * Only an original named plane with exact exported slabs and native flights
 * can authorise an added provisional display alias. */
export function validateNativePhysicalLevels(data: IndoorDataset): void {
  const value = data.nativePhysicalLevels;
  if (value === undefined) return;
  const fail = () => {
    throw new Error("Invalid or stale original native physical levels.");
  };
  const ids = (v: number[]) =>
    Array.isArray(v) &&
    v.length <= 100000 &&
    new Set(v).size === v.length &&
    v.every((id) => Number.isSafeInteger(id) && id > 0);
  if (
    !value ||
    value.version !== 1 ||
    value.sourceModelSha256 !== data.source.modelSha256 ||
    !Array.isArray(value.levels) ||
    value.levels.length !== data.nativeLevels.length ||
    value.levels.length > 1000 ||
    !Array.isArray(value.displayAliases) ||
    value.displayAliases.length > 1000 ||
    new Set(value.levels.map((l) => l.nativeLevelId)).size !==
      value.levels.length
  )
    fail();
  for (const level of value.levels) {
    const original = data.nativeLevels.find(
      (l) => l.id === level.nativeLevelId,
    );
    if (
      !original ||
      level.sourceName !== original.name ||
      level.elevationFeet !== original.elevationFeet ||
      !ids(level.nativeFloorElementIds) ||
      !ids(level.nativeStairElementIds) ||
      level.annotationLevel !==
        data.records.some((r) => r.levelId === level.nativeLevelId) ||
      level.nativeStairElementIds.some(
        (id) =>
          !data.stairDisplay?.sourceFlights?.some(
            (f) => f.stairElementId === id,
          ),
      )
    )
      fail();
  }
  const seen = new Set<number>();
  for (const alias of value.displayAliases) {
    const row = value.levels.find(
        (l) => l.nativeLevelId === alias.nativeLevelId,
      ),
      target = data.floors.find((f) => f.id === alias.displayFloorId),
      match =
        typeof alias.sourceName === "string" &&
        /^Floor\s+(\d+)\.(\d+)$/i.exec(alias.sourceName.trim()),
      base =
        match &&
        data.nativeLevels.find((l) =>
          new RegExp(`^Floor\\s+${Number(match[1])}$`, "i").test(l.name.trim()),
        );
    if (
      !row ||
      !target ||
      !match ||
      !base ||
      Number(match[2]) === 0 ||
      seen.has(alias.nativeLevelId) ||
      alias.sourceName !== row.sourceName ||
      alias.elevationFeet !== row.elevationFeet ||
      alias.evidence !== "original-fractional-level-name" ||
      alias.provisional !== true ||
      row.annotationLevel ||
      !row.nativeFloorElementIds.length ||
      !row.nativeStairElementIds.length ||
      !target.levelIds.includes(base.id) ||
      !target.levelIds.includes(alias.nativeLevelId) ||
      data.floors.filter((f) => f.levelIds.includes(alias.nativeLevelId))
        .length !== 1 ||
      data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
      row.nativeFloorElementIds.some(
        (id) =>
          !data.walkingSupport?.floors.some(
            (f) =>
              f.nativeElementId === id && f.elevationFeet === row.elevationFeet,
          ),
      )
    )
      fail();
    seen.add(alias.nativeLevelId);
  }
}
