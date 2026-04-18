export type RevitImportTaskStatus = "done" | "current" | "blocked" | "next";

export interface RevitImportTask {
  id: string;
  label: string;
  status: RevitImportTaskStatus;
  detail: string;
  output?: string;
}

export type RevitModelArtifactStatus = "ready" | "missing" | "blocked";

export interface RevitModelArtifact {
  label: string;
  status: RevitModelArtifactStatus;
  path?: string;
  generatedFrom?: string;
  detail: string;
}

export interface RevitImportFixture {
  id: string;
  name: string;
  sourceFileName: string;
  status: "metadata-only" | "ifc-ready" | "geojson-ready";
  preview?: {
    src: string;
    width: number;
    height: number;
    sizeBytes: number;
  };
  sourceFile: {
    sizeBytes: number;
    sha256: string;
  };
  nativeRvt: {
    parser: string;
    fileVersion: number;
    version: string;
    build: string;
    locale: string;
    appName: string;
    documentId: string;
    identityId: string;
    worksharing: string;
  };
  container: {
    type: string;
    entryCount: number;
    folderCount: number;
    partitionCount: number;
    largestPartition: {
      name: string;
      sizeBytes: number;
    };
  };
  streamDiagnostics: {
    elemTable: {
      recordCount: number;
      decompressedSizeBytes: number;
      firstRecordIds: number[];
    };
    largestPartition: {
      name: string;
      gzipMemberCount: number;
      gzipCountSource: string;
      gzipSignatureCount: number;
    };
  };
  openIndoorMapsImport: {
    canExtractGeometry: boolean;
    targetCollections: string[];
    nextConversion: string;
  };
  modelArtifacts: {
    ifc: RevitModelArtifact;
    glb: RevitModelArtifact;
    openIndoorMapsGeoJson: RevitModelArtifact;
  };
  taskList: RevitImportTask[];
}
