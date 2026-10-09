import type { NativeExactPlanarTopology } from "./native-exact-planar-topology";
import type { NativeContainedCellDisplay } from "./native-contained-cell-display";
/** Explicit reviewed footprints excluded from indoor selection and routing.
 * Source floors/model geometry remain intact; missing reasons mean outdoors. */
export type IndoorExclusions = {
  version: 1;
  sourceModelSha256: string;
  areas: {
    id: string;
    /** Older masks without a reason are confirmed outdoor footprints. */
    reason?: "outdoor" | "off-limits";
    /** Reviewed lift shaft owner; display centering never moves its lobby stop. */
    connectorId?: string;
    levelId: number;
    elevationFeet: number;
    label: string;
    notes?: string;
    nativeFloorIds: number[];
    partsFeet: [number, number][][][];
  }[];
};
/** Portable contract consumed by OpenIndoorMaps. Coordinates never identify a node. */
export type IndoorNode = {
  id: string;
  roomKey: string;
  levelId: number;
  building: string;
  surfaceId: string;
  pointFeet: [number, number, number];
  geographic: [number, number];
  kind: "arrival" | "junction" | "portal" | "stair" | "connector";
};
export type IndoorEdge = {
  /** Original source-owned physical stair flight; no named room is invented for intermediate landings. */
  nativeSourceStair?: import("./native-source-stair-width").NativeSourceStairReceipt & {
    foreignMaterial: import("./native-source-stair-material").NativeSourceStairMaterial;
    walkingBody: import("./native-source-stair-body").NativeSourceStairBody;
  };
  /** Source-bound ramp profile; rechecked independently by each route calculation. */
  nativeRampSurface?: {
    version: 1;
    sourceModelSha256: string;
    nativeRampId: number;
    nativeFloorElementIds: number[];
    pointsFeet: [number, number, number][];
    widthCertificate: import("./native-ramp-crossfall").NativeRampCrossfallCertificate;
  };
  id: string;
  from: string;
  to: string;
  kind:
    | "walk"
    | "door"
    | "opening"
    | "stairs"
    | "local-steps"
    | "ramp"
    | "elevator"
    | "escalator";
  lengthMetres: number;
  pointsFeet: [number, number, number][];
  roomKeys: string[];
  evidence: string;
  nativeElementId?: number;
  /** Walking branch rebuilt inside this model-bound native circulation cell. */
  nativeCellId?: string;
  accessible: "unknown" | "yes" | "no";
  enabled: boolean;
  notes?: string;
  /** Omitted means bidirectional, preserving older prepared projects. */
  direction?: "both" | "from-to" | "to-from";
  connectorId?: string;
  /** A proved finite doorless seam. Runtime still proves each local crossing. */
  openingSpan?: {
    version: 1;
    sourceModelSha256: string;
    levelId: number;
    pointsFeet: [[number, number, number], [number, number, number]];
    nativeFloorElementIds: number[];
    walkingStripWidthFeet: number;
    /** Source/native-proved local crossing aperture, with body margin. */
    apertureFeet: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
  };
  /** Fixed threshold proved by a registered drawing, without a fabricated native door ID. */
  sourceDoorProof?: {
    version: 1;
    sourceModelSha256: string;
    sourceSha256: string;
    sectionId: string;
    registrationErrorFeet: number;
    levelId: number;
    elevationFeet: number;
    nativeFloorElementIds: number[];
    wallSegmentIndices: number[];
    doorSymbolSegmentIndices: number[];
    doorSymbolCollection: "wallSegments";
    apertureFeet: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    walkingStripWidthFeet: number;
  };
  routingQuality?: {
    turnCount: number;
    estimatedRasterClearanceFeet: number;
    clearanceCertified: false;
  };
};
export type IndoorRecord = {
  key: string;
  number: string;
  name: string;
  building: string;
  levelId: number;
  elevationFeet: number;
  elevationEvidence: string;
  surfaceId: string;
  circulation: boolean;
  stair: boolean;
  access: "public" | "staff" | "unknown";
  walkable: boolean;
  arrivalNodeId?: string;
  confidence: number;
  ringsFeet: [number, number][][];
  properties: Record<string, unknown>;
};
export type IndoorIssue = {
  id: string;
  code: string;
  severity: "info" | "review";
  message: string;
  roomKey?: string;
  nativeElementId?: number;
  levelId?: number;
};
export type IndoorDataset = {
  /** Original physical planes; fractional-level grouping is presentation only. */
  nativeSourceStairMaterials?: import("./native-source-stair-material").NativeSourceStairMaterials;
  nativePhysicalLevels?: {
    version: 1;
    sourceModelSha256: string;
    levels: {
      nativeLevelId: number;
      sourceName: string;
      elevationFeet: number;
      nativeFloorElementIds: number[];
      nativeStairElementIds: number[];
      annotationLevel: boolean;
    }[];
    displayAliases: {
      nativeLevelId: number;
      displayFloorId: string;
      sourceName: string;
      elevationFeet: number;
      evidence: "original-fractional-level-name";
      provisional: true;
    }[];
  };
  nativeDerivedFrameReturns?: import("./native-derived-frame-returns").NativeDerivedFrameReturns;
  nativeProvisionalCornerSeals?: import("./native-provisional-corner-seals").NativeProvisionalCornerSeals;
  nativeMaterialSections?: import("./native-material-sections").NativeMaterialSections;
  /** Derived production-cutter sections of owners the prepared rows omit (compiler-only, re-derived). */
  nativeMaterialSectionSupplement?: import("./native-material-section-supplement").NativeMaterialSectionSupplement;
  nativeIndoorEnvelopes?: import("./native-indoor-envelopes").NativeIndoorEnvelopes;
  /** Checked presentation coverage only; native selections and routes stay unchanged. */
  nativeDisplayScopes?: import("./native-display-scopes").NativeDisplayScopes;
  /** Published exact native floor outlines; derived display/selection only, never routing. */
  nativeExploreMapping?: import("./native-explore-mapping").PublishedNativeExploreMapping;
  doorAperturePatchState?: { regenerated: boolean; sourceGeometryKey: string };
  nativeSelectionContactRepairs?: import("./native-selection-contact-repairs").NativeSelectionContactRepairs;
  nativeDoorBoundaryClosures?: import("./native-door-boundary-closures").NativeDoorBoundaryClosures;
  nativeWallPositionRepairs?: import("./native-wall-position-repairs").NativeWallPositionRepairs;
  selectionDoorThresholds?: import("./selection-door-thresholds").SelectionDoorThresholds;
  /** Portable logical outlines for authoring selection only; no navigation or physical walls. */
  reviewedAreaPartitions?: import("./reviewed-area-partitions").ReviewedAreaPartitions;
  indoorExclusions?: IndoorExclusions;
  format: "reviter-indoor";
  version: 1;
  generator: "reviter/indoor-pipeline-1";
  source: { modelFileName: string; modelSha256: string; roomsSha256: string };
  alignment: {
    originFeet: [number, number, number];
    originGeographic: [number, number];
    projectionLatitude: number;
    rotationRadians: number;
    horizontalMetresPerFoot: number;
    verticalMetresPerFoot: number;
    rmsMetres: number;
    referenceCount: number;
  };
  floors: {
    id: string;
    name: string;
    levelIds: number[];
    elevationFeet: number;
  }[];
  nativeLevels: { id: number; name: string; elevationFeet: number }[];
  /** Exact coplanar native slab profiles; inner rings are floor openings. */
  walkingSupport?: {
    version: 1;
    sourceModelSha256: string;
    floors: {
      nativeElementId: number;
      elevationFeet: number;
      ringsFeet: [number, number][][];
      /** Separate native shells with their own nested holes. */
      partsFeet?: [number, number][][][];
    }[];
  };
  /** Model-derived walking cells. Room records retain semantic/source identities. */
  circulationGeometry?: {
    version: 1;
    sourceModelSha256: string;
    sourceGeometryKey: string;
    /** Exact rational authority; numeric rings are representation/search only. */
    exactTopology?: NativeExactPlanarTopology;
    /** Every positive omission from numeric drawing, separate from routing. */
    displayResidualTopology?: NativeExactPlanarTopology;
    /** All source circulation identities assessed on supported native floors. */
    preparedRoomKeys?: string[];
    /** Unclassified source claims clipped to physical floor and obstacles. */
    reviewSurfaces?: {
      roomKey: string;
      levelId: number;
      elevationFeet: number;
      ringsFeet: [number, number][][];
    }[];
    /** Exact low slab tops used as solid fixture blocks in 2D/3D. */
    fixtures?: {
      id: string;
      nativeElementId: number;
      levelIds: number[];
      elevationFeet: number;
      heightFeet: number;
      ringsFeet: [number, number][][];
    }[];
    cells: {
      id: string;
      exactFaceId?: string;
      containedDisplay?: NativeContainedCellDisplay;
      levelIds: number[];
      elevationFeet: number;
      roomKeys: string[];
      nativeFloorIds: number[];
      /** Unchanged enabled native connector identifies an otherwise unclaimed landing. */
      connectorAnchors?: {
        edgeId: string;
        nodeId: string;
        roomKey: string;
        nativeElementId: number;
      }[];
      ringsFeet: [number, number][][];
      sourceCoverage: number;
    }[];
  };
  records: IndoorRecord[];
  nodes: IndoorNode[];
  edges: IndoorEdge[];
  walls: {
    reviewPatchId?: string;
    kind?: "wall" | "column";
    /** Bounding envelope rather than a verified native wall face. Display only. */
    approximate?: boolean;
    levelId: number;
    nativeElementId: number;
    ringsFeet: [number, number][][];
  }[];
  /** Optional native fenestration comparison. This does not replace routing barriers. */
  windowDisplay?: {
    version: 1;
    sourceModelSha256: string;
    mode: "native" | "simplified";
    routing: "original-barriers";
    elements: {
      nativeElementId: number;
      hostId: number;
      levelId: number;
      role: "glazing" | "frame" | "opaque-panel" | "unknown-panel";
      footprintFeet: [number, number][];
      baseElevationFeet: number;
      topElevationFeet: number;
      assemblyTopElevationFeet: number;
      materialId?: number;
      transparency?: number;
      materialColorSrgb?: [number, number, number];
      materialEvidence: "native-material" | "category-or-type";
    }[];
    wallCuts: {
      hostId: number;
      nativeWallId: number;
      levelId: number;
      wallGeometryKey: string;
      ringsFeet: [number, number][][];
      baseElevationFeet: number;
      topElevationFeet: number;
      assemblyTopElevationFeet: number;
    }[];
    unresolvedNativeElementIds: number[];
  };
  boundaryPatchState?: { patchIds: string[]; regenerated: boolean };
  /** Native wall ownership; repeated floor slices are one physical element. */
  wallDisplay?: {
    version: 1;
    sourceModelSha256: string;
    elements: {
      nativeElementId: number;
      levelId: number;
      baseElevationFeet: number;
      topElevationFeet: number;
    }[];
  };
  /** Native display geometry; it does not authorize a routing edge. Optional for older ZIPs. */
  doors?: {
    id: string;
    levelId: number;
    nativeElementId: number;
    pointFeet: [number, number];
    /** Original persisted InsertableInst host; never inferred from proximity. */
    hostWallNativeElementId?: number;
    footprintFeet?: [number, number][];
    /** Unit native traversal direction; host depth is not doorway width. */
    normalFeet?: [number, number];
    roomKeys: string[];
    state: "connected" | "unmatched" | "ambiguous";
  }[];
  /** Prepared visual geometry. It never authorizes a graph edge or replaces source routing polygons. */
  presentation?: {
    version: 1;
    generator:
      | "reviter/native-room-presentation-1"
      | "reviter/native-room-presentation-2";
    sourceModelSha256: string;
    junctionToleranceFeet: number;
    rooms: {
      roomKey: string;
      levelId: number;
      sourceGeometryKey: string;
      interiorRingsFeet: [number, number][][];
      blockPartsFeet: [number, number][][][];
      boundarySource:
        | "native-wall-enclosure"
        | "revit-finish-face"
        | "registered-source-wall-enclosure"
        | "source-backed-native-wall-enclosure"
        | "native-mesh-wall-enclosure"
        | "reviewed-native-wall-enclosure";
      reviewProof?: {
        sourceModelSha256: string;
        nativeFloorCoveredSquareFeet: number;
        closures: {
          nativeWallId: number;
          reachFeet: number;
          ringsFeet: [number, number][][];
        }[];
      };
      meshProof?: {
        cutElevationFeet: number;
        precisionFeet: number;
        nativeFloorCoveredSquareFeet: number;
        nativeElementIds: number[];
      };
      boundaryEvidence?: string;
      sourceProof?: {
        sourceSha256: string;
        sectionId: string;
        registrationErrorFeet: number;
        wallSegmentIndices: number[];
        doorSegmentIndices: number[];
        nativeFloorCoveredSquareFeet: number;
        /** Registered architectural swing symbols, closed for display only. */
        omittedNativeEdgeFragments?: {
          ringsFeet: [number, number][][][];
          squareFeet: number;
        };
        modelReviewedDividerIndices?: number[];
        closedDoorSwings?: {
          arcSegmentIndices: number[];
          leafSegmentIndices: number[];
          supportingWallSegmentIndices: number[];
          hingeFeet: [number, number];
          radiusFeet: number;
          closedLeafFeet: [[number, number], [number, number]];
          thresholdSegments: [[number, number], [number, number]][];
        }[];
        jointRepairs?: {
          nativeWallElementId: number;
          supportingElementId: number;
          gapFeet: number;
          toleranceFeet: number;
          wallSegmentIndices: [number, number];
        }[];
      };
      boundaryElementIds: number[];
      sourceCoverage: number;
      cellCoverage: number;
    }[];
    diagnostics: {
      roomKey: string;
      levelId: number;
      code: string;
      message: string;
    }[];
  };
  /** Native tread projections for display and selection only, including curved flights.
   * The source room boundary and navigation graph remain authoritative for routing. */
  stairDisplay?: {
    version: 1;
    generator: "reviter/native-stair-display-1";
    sourceModelSha256: string;
    /** Complete physical source inventory. Display alone never creates a route. */
    sourceFlights?: {
      stairElementId: number;
      levelIds: number[];
      buildings: string[];
      floorElevationFeet: number;
      sourceGeometry: "native-cache" | "native-brep";
      authoredTreadRolesSha256?: string;
      historicalPreparedTreads?: {
        runElementId: number;
        elevationFeet: number;
        thicknessFeet?: number;
        ringFeet: [number, number][];
      }[];
      context?: "outdoor" | "tiered-seating";
      /** Native run endpoints, including the terminal riser beyond the last tread. */
      runs?: {
        runElementId: number;
        bottomElevationFeet: number;
        topElevationFeet: number;
        beginWithRiser: boolean;
        endWithRiser: boolean;
      }[];
      /** Owner-tagged native turning platforms; holes and elevation are retained. */
      landings?: {
        nativeElementId: number;
        elevationFeet: number;
        thicknessFeet: number;
        ringsFeet: [number, number][][];
      }[];
      treads: {
        runElementId: number;
        elevationFeet: number;
        thicknessFeet?: number;
        ringFeet: [number, number][];
      }[];
    }[];
    flights: {
      roomKey: string;
      levelId: number;
      floorElevationFeet: number;
      sourceGeometryKey: string;
      stairElementId: number;
      displayOnly?: true;
      authoredTreadRolesSha256?: string;
      historicalPreparedTreads?: {
        runElementId: number;
        elevationFeet: number;
        thicknessFeet?: number;
        ringFeet: [number, number][];
      }[];
      /** Actual native solid slab faces near this flight. Holes remain openings. */
      floorOccluders?: {
        nativeElementId: number;
        elevationFeet: number;
        ringsFeet: [number, number][][];
      }[];
      /** Owner-tagged native turning platforms; holes and elevation are retained. */
      landings?: {
        nativeElementId: number;
        elevationFeet: number;
        thicknessFeet: number;
        ringsFeet: [number, number][][];
      }[];
      runs?: {
        runElementId: number;
        bottomElevationFeet: number;
        topElevationFeet: number;
        beginWithRiser: boolean;
        endWithRiser: boolean;
      }[];
      treads: {
        runElementId: number;
        elevationFeet: number;
        /** Native tread thickness; older packages use a 50 mm display tread. */
        thicknessFeet?: number;
        ringFeet: [number, number][];
      }[];
    }[];
  };
  connectors?: {
    id: string;
    kind: "elevator" | "escalator";
    nativeElementId: number;
    reviewedShaft?: {
      pinId: string;
      pointFeet: [number, number];
      wallElementIds: number[];
    };
    sourceModelSha256: string;
    evidence: string;
    accessible: "yes" | "no" | "unknown";
    direction: "both" | "from-to" | "to-from";
    entrances: {
      nodeId: string;
      roomKey: string;
      levelId: number;
      areaKey?: string;
    }[];
  }[];
  /** Source-supported sloping faces, separate from stair display and routing policy. */
  rampDisplay?: {
    version: 1;
    sourceModelSha256: string;
    ramps: {
      edgeId?: string;
      /** Measured native ramp with no reviewed navigation connection yet. */
      displayOnly?: true;
      buildings?: string[];
      circulation?: boolean;
      nativeElementId: number;
      levelIds: number[];
      anchorPointFeet: [number, number, number];
      /** Immutable original owner faces used by exact route certificates. */
      trianglesFeet: [number, number, number][][];
      /** Display-only wall clipping; never a source walking inventory. */
      displayTrianglesFeet?: [number, number, number][][];
      /** Closed native ramp slab, including the underside and edge faces. */
      bodyTrianglesFeet?: [number, number, number][][];
      /** Adjacent low native walls supporting/enclosing the ramp platform. */
      platforms?: {
        nativeElementId: number;
        trianglesFeet: [number, number, number][][];
      }[];
    }[];
  };
  visitor?: {
    version: 1;
    buildings: Record<string, { name: string; shortName?: string }>;
    places: Record<
      string,
      {
        displayName?: string;
        description?: string;
        category?:
          | "study"
          | "food"
          | "washroom"
          | "department"
          | "entrance"
          | "other";
        department?: string;
        color?: string;
        landmark?: boolean;
      }
    >;
  };
  issues: IndoorIssue[];
  report: {
    recordCount: number;
    routableArrivals: number;
    components: number;
    largestComponentArrivals: number;
    unmatchedDoors: number;
    cellSizeFeet: number;
    omittedSourceLabels: number;
  };
};
