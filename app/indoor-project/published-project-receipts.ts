import type { PublishedProjectReceipt } from "./published-project";

// Publication trust root: generated from the successful full normal importer.
// Remote manifests and ZIP files cannot add or alter these approved records.
export const PUBLISHED_PROJECT_RECEIPTS: readonly PublishedProjectReceipt[] =
  Object.freeze([
    {
      id: "unbc-visitor-6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22",
      packageSha256:
        "6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22",
      packageBytes: 45290239,
      validatorSha256:
        "681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d",
      datasetSha256:
        "f4761c369fd010e48b95e18a467b3adae76723220523b4cf54821f10bc2cafd8",
      source: {
        modelFileName:
          "UNBC Model - 2026-06-30 - FINAL (Fixed Library) (1).rvt",
        modelSha256:
          "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
        roomsSha256:
          "f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50",
      },
      entries: {
        "viewer/metadata.json": {
          bytes: 1237401,
          sha256:
            "14e5dbd0dbdedcb6aac56027b6689e5504ac617ea1cdf5f9f3d58463e70a7e80",
        },
        "gis/reference-points.json": {
          bytes: 602,
          sha256:
            "c4a341aa16898c3154791428b8d593c897dfed5e6fdca8751a051eb7129320f5",
        },
        "viewer/indoor.json": {
          bytes: 229156273,
          sha256:
            "f4761c369fd010e48b95e18a467b3adae76723220523b4cf54821f10bc2cafd8",
        },
        "manifest.json": {
          bytes: 753,
          sha256:
            "7b0f1df9707e5a90d705066b06fff790dbd135dc3563a338d29f50925df94579",
        },
      },
      progressiveRevisionSha256:
        "c2a275a008cf4c578da9f9f7ec547afa82241ed0a2f0d9220a95697c18c5a3d1",
      validationReportSha256:
        "a90b1ae9b47dfae7275544d568685f921550e1644c065bfbb8fa6d64f934afd7",
      validationElapsedMs: 632996,
    },
  ]);
