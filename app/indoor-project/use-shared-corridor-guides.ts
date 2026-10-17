import { useMemo, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import {
  loadSharedCorridorPreference,
  saveSharedCorridorPreference,
} from "./shared-corridor-preferences";
export function useSharedCorridorGuides(data?: IndoorDataset) {
  const sha = data?.source.modelSha256 ?? "";
  const [choice, setChoice] = useState<{ sha: string; enabled: boolean }>();
  const enabled = useMemo(
    () =>
      choice?.sha === sha ? choice.enabled : loadSharedCorridorPreference(sha),
    [choice, sha],
  );
  const available = useMemo(
    () =>
      !!(
        data as
          | (IndoorDataset & { preparedRouting?: PreparedRouting })
          | undefined
      )?.preparedRouting?.guides.some((g) => g.kind === "shared-corridor"),
    [data],
  );
  return {
    available,
    enabled,
    onChange: (value: boolean) => {
      saveSharedCorridorPreference(sha, value);
      setChoice({ sha, enabled: value });
    },
  };
}
