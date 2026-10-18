const key = (modelSha256: string) =>
  /^[a-f0-9]{64}$/.test(modelSha256)
    ? `indoor-project-shared-corridors-v1:${modelSha256}`
    : undefined;
export function loadSharedCorridorPreference(modelSha256: string) {
  const name = key(modelSha256);
  if (!name) return true;
  try {
    return globalThis.localStorage.getItem(name) !== "existing";
  } catch {
    return true;
  }
}
export function saveSharedCorridorPreference(
  modelSha256: string,
  enabled: boolean,
) {
  const name = key(modelSha256);
  if (!name) return;
  try {
    globalThis.localStorage.setItem(name, enabled ? "shared" : "existing");
  } catch {
    /* Storage is optional. */
  }
}
