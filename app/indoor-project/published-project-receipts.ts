import type { PublishedProjectReceipt } from "./published-project";

// Publication trust root: generated from the successful full normal importer.
// Remote manifests and ZIP files cannot add or alter these approved records.
export const PUBLISHED_PROJECT_RECEIPTS: readonly PublishedProjectReceipt[] =
  Object.freeze([
    {
      id: "unbc-visitor-09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a",
      packageSha256:
        "09d35032a47d4cde544207c5a83f28c061750dfdaf2b32e07f042362c164658a",
      packageBytes: 45_519_753,
      validatorSha256:
        "9ff279531839658e175655b3796bf95fdc2f9d676e7c37076cb9da97ed1dd32b",
      datasetSha256:
        "87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b",
      source: {
        modelFileName:
          "UNBC Model - 2026-06-30 - FINAL (Fixed Library) (1).rvt",
        modelSha256:
          "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
        roomsSha256:
          "f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50",
      },
      entries: {
        "gis/reference-points.json": {
          bytes: 602,
          sha256:
            "c4a341aa16898c3154791428b8d593c897dfed5e6fdca8751a051eb7129320f5",
        },
        "manifest.json": {
          bytes: 753,
          sha256:
            "8e39083d8683bdb31466f866453285d71aeeedf4966ee913a7203be947e14a03",
        },
        "viewer/metadata.json": {
          bytes: 1_237_401,
          sha256:
            "14e5dbd0dbdedcb6aac56027b6689e5504ac617ea1cdf5f9f3d58463e70a7e80",
        },
        "viewer/indoor.json": {
          bytes: 230_656_326,
          sha256:
            "87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b",
        },
      },
      progressiveRevisionSha256:
        "cacc11ed6afa9e415fb0f31da1241f8bf527f8d8c53ff9b243725432854a2115",
      validationReportSha256:
        "55dc6923b5c0882f9489932aba02ccdf0e1935859796d13a71fb0c4a8bf57ad0",
      validationElapsedMs: 439_974,
    },
    {
      id: "unbc-visitor-6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22",
      packageSha256:
        "6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22",
      packageBytes: 45_290_239,
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
          bytes: 1_237_401,
          sha256:
            "14e5dbd0dbdedcb6aac56027b6689e5504ac617ea1cdf5f9f3d58463e70a7e80",
        },
        "gis/reference-points.json": {
          bytes: 602,
          sha256:
            "c4a341aa16898c3154791428b8d593c897dfed5e6fdca8751a051eb7129320f5",
        },
        "viewer/indoor.json": {
          bytes: 229_156_273,
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
      validationElapsedMs: 632_996,
    },
  ]);
