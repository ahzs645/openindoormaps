import { useMemo, useState } from "react";
import type { IndoorDataset } from "./contract";
import {
  ROUTING_GUIDE_VERSION,
  type PreparedRouting,
} from "./prepared-routing";
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
  const available = useMemo(() => {
    const prepared = (
      data as
        | (IndoorDataset & { preparedRouting?: PreparedRouting })
        | undefined
    )?.preparedRouting;
    // Cheap wire checks only: the worker performs the complete physical and
    // policy binding. An older package must not advertise unavailable guides.
    return (
      prepared?.resolverVersion === ROUTING_GUIDE_VERSION &&
      prepared.sourceModelSha256 === sha &&
      prepared.guides.some((g) => g.kind === "shared-corridor")
    );
  }, [data, sha]);
  return {
    available,
    enabled,
    onChange: (value: boolean) => {
      saveSharedCorridorPreference(sha, value);
      setChoice({ sha, enabled: value });
    },
  };
}
