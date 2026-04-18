#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import process from "node:process";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { inflateRawSync } from "node:zlib";
import { basicFileInfo, thumbnail } from "@phi-ag/rvt";
import { openPath } from "@phi-ag/rvt/node";

const usage = `
Usage:
  npm run revit:inspect -- <path-to-model.rvt> --out <output-dir>
  node scripts/revit/extract-rvt-metadata.mjs <path-to-model.rvt> [--out <output-dir>] [--include-source-path]

This is a preflight extractor. It inspects the RVT compound container, extracts
native Revit BasicFileInfo, ProjectInformation XML, stream diagnostics, and the
embedded preview PNG when present. It does not extract Revit geometry.
Requires 7z/p7zip on PATH.
`.trim();

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const IEND_MARKER = Buffer.from("IEND", "ascii");
const GZIP_SIGNATURE = Buffer.from([0x1f, 0x8b, 0x08]);

function parseArgs(argv) {
  const result = {
    inputPath: undefined,
    outputDir: undefined,
    includeSourcePath: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }

    if (arg === "--out") {
      result.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-source-path") {
      result.includeSourcePath = true;
      continue;
    }

    if (!result.inputPath) {
      result.inputPath = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!result.inputPath) {
    throw new Error("Missing RVT input path.");
  }

  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr.trim() : result.stderr;
    throw new Error(`${command} exited with ${result.status}: ${stderr}`);
  }

  return result;
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result;
}

function parse7zEntries(output) {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2})?\s*(\d{2}:\d{2}:\d{2})?\s+([D.]{5})\s+(?:(\d+)\s+)?(?:(\d+)\s+)?(.+)$/,
      );

      if (!match) return null;

      const [, date, time, attr, size, compressedSize, name] = match;
      return {
        name: name.trim(),
        isDirectory: attr.includes("D"),
        sizeBytes: size ? Number(size) : 0,
        compressedSizeBytes: compressedSize ? Number(compressedSize) : 0,
        modifiedAt: date && time ? `${date}T${time}` : null,
      };
    })
    .filter(Boolean);
}

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function textFor(xml, pattern) {
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : null;
}

function parseAttributes(attributes) {
  const parsed = {};
  const regex = /([\w:-]+)="([^"]*)"/g;

  for (const match of attributes.matchAll(regex)) {
    parsed[match[1]] = decodeXml(match[2]);
  }

  return parsed;
}

function parseProjectInformationXml(xml) {
  const parameters = [];
  const parameterRegex = /<([^\s/<:>]+)([^<>]*)>([^<>]*)<\/\1>/gu;
  const ignoredTags = new Set(["title", "term", "label"]);

  for (const match of xml.matchAll(parameterRegex)) {
    const [, tagName, rawAttributes, rawValue] = match;
    const attributes = parseAttributes(rawAttributes);

    if (ignoredTags.has(tagName)) continue;
    if (!attributes.displayName && !attributes.typeOfParameter) continue;

    parameters.push({
      name: tagName,
      displayName: attributes.displayName ?? tagName,
      type: attributes.type ?? null,
      typeOfParameter: attributes.typeOfParameter ?? null,
      value: decodeXml(rawValue.trim()),
    });
  }

  return {
    title: textFor(xml, /<title>([\s\S]*?)<\/title>/),
    updated: textFor(xml, /<updated>([\s\S]*?)<\/updated>/),
    designFileTitle: textFor(xml, /<A:title>([\s\S]*?)<\/A:title>/),
    product: textFor(xml, /<A:product>([\s\S]*?)<\/A:product>/),
    productVersion: textFor(
      xml,
      /<A:product-version>([\s\S]*?)<\/A:product-version>/,
    ),
    designFileUpdated: textFor(xml, /<A:updated>([\s\S]*?)<\/A:updated>/),
    parameters,
  };
}

function extractPng(buffer) {
  const start = buffer.indexOf(PNG_SIGNATURE);
  if (start === -1) return null;

  const iend = buffer.indexOf(IEND_MARKER, start);
  if (iend === -1) return null;

  const png = buffer.subarray(start, iend + 8);
  const width = png.length >= 24 ? png.readUInt32BE(16) : null;
  const height = png.length >= 24 ? png.readUInt32BE(20) : null;

  return {
    buffer: png,
    info: {
      sizeBytes: png.length,
      width,
      height,
    },
  };
}

function carvePreviewPng(previewPath, outputPath) {
  if (!existsSync(previewPath)) return null;

  const extracted = extractPng(readFileSync(previewPath));
  if (!extracted) return null;

  if (outputPath) {
    writeFileSync(outputPath, extracted.buffer);
  }

  return extracted.info;
}

function summarize(entries) {
  const fileEntries = entries.filter((entry) => !entry.isDirectory);
  const partitionEntries = fileEntries.filter((entry) =>
    entry.name.startsWith("Partitions/"),
  );
  const largestPartition = partitionEntries.toSorted(
    (left, right) => right.sizeBytes - left.sizeBytes,
  )[0];

  return {
    entryCount: fileEntries.length,
    folderCount: entries.length - fileEntries.length,
    partitionCount: partitionEntries.length,
    hasProjectInformation: entries.some(
      (entry) => entry.name === "ProjectInformation",
    ),
    hasBasicFileInfo: entries.some((entry) => entry.name === "BasicFileInfo"),
    hasTransmissionData: entries.some(
      (entry) => entry.name === "TransmissionData",
    ),
    hasPreview: entries.some((entry) => entry.name === "RevitPreview4.0"),
    largestPartition: largestPartition
      ? {
          name: largestPartition.name,
          sizeBytes: largestPartition.sizeBytes,
        }
      : null,
  };
}

function parseWorksharing(content) {
  const match = content.match(/^Worksharing:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

async function extractNativeRvtInfo(inputPath, outputPath) {
  const cfb = await openPath(inputPath);
  const info = await basicFileInfo(cfb);
  const image = await thumbnail(cfb);
  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const extractedPng = extractPng(imageBuffer);

  if (extractedPng && outputPath) {
    writeFileSync(outputPath, extractedPng.buffer);
  }

  return {
    parser: "@phi-ag/rvt",
    basicFileInfo: {
      fileVersion: info.fileVersion,
      version: info.version,
      build: info.build,
      path: info.path,
      locale: info.locale,
      identityId: info.identityId,
      documentId: info.documentId,
      appName: info.appName ?? null,
      worksharing: parseWorksharing(info.content),
      content: info.content,
    },
    thumbnail: extractedPng
      ? {
          ...extractedPng.info,
          mimeType: image.type || "image/png",
        }
      : null,
  };
}

function gzipOffsets(buffer) {
  const offsets = [];
  let offset = 0;

  while (offset < buffer.length) {
    const foundAt = buffer.indexOf(GZIP_SIGNATURE, offset);
    if (foundAt === -1) break;
    offsets.push(foundAt);
    offset = foundAt + GZIP_SIGNATURE.length;
  }

  return offsets;
}

function binwalkGzipOffsets(path) {
  const result = runOptional("binwalk", [path]);
  if (!result) return null;

  return result.stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(
        /^\s*(\d+)\s+0x[0-9a-f]+\s+gzip compressed data/i,
      );
      return match ? Number(match[1]) : null;
    })
    .filter((offset) => offset !== null);
}

function gzipDeflateOffset(buffer, gzipOffset) {
  const flags = buffer[gzipOffset + 3];
  let offset = gzipOffset + 10;

  if (flags & 0x04) {
    const extraLength = buffer.readUInt16LE(offset);
    offset += 2 + extraLength;
  }

  if (flags & 0x08) {
    while (offset < buffer.length && buffer[offset] !== 0) offset += 1;
    offset += 1;
  }

  if (flags & 0x10) {
    while (offset < buffer.length && buffer[offset] !== 0) offset += 1;
    offset += 1;
  }

  if (flags & 0x02) {
    offset += 2;
  }

  return offset;
}

function elemTableDiagnostics(path) {
  if (!existsSync(path)) return null;

  const compressed = readFileSync(path);
  const [firstGzipOffset] = gzipOffsets(compressed);
  if (firstGzipOffset === undefined) {
    return {
      path: "Global/ElemTable",
      compressedSizeBytes: compressed.length,
      firstGzipOffset: null,
      error: "No gzip member found.",
    };
  }

  const deflateOffset = gzipDeflateOffset(compressed, firstGzipOffset);
  const decompressed = inflateRawSync(compressed.subarray(deflateOffset));
  const headerRecordCount =
    decompressed.length >= 6 ? decompressed.readUInt32LE(2) : null;
  const possibleRecordCount =
    decompressed.length >= 6
      ? Math.floor((decompressed.length - 6) / 40)
      : null;
  const firstRecordIds = [];

  for (
    let offset = 6;
    offset + 8 <= decompressed.length && firstRecordIds.length < 10;
    offset += 40
  ) {
    firstRecordIds.push(Number(decompressed.readBigInt64LE(offset)));
  }

  return {
    path: "Global/ElemTable",
    compressedSizeBytes: compressed.length,
    firstGzipOffset,
    deflateOffset,
    decompressedSizeBytes: decompressed.length,
    header: {
      byte0: decompressed[0] ?? null,
      byte1: decompressed[1] ?? null,
      recordCount: headerRecordCount,
    },
    possibleFortyByteRecordCount: possibleRecordCount,
    firstRecordIds,
    interpretation:
      "Raw proprietary Revit element table. Counts are detectable, but categories and geometry are not decoded.",
  };
}

function partitionDiagnostics(path, label) {
  if (!existsSync(path)) return null;

  const buffer = readFileSync(path);
  const offsets = gzipOffsets(buffer);
  const binwalkOffsets = binwalkGzipOffsets(path);
  const reliableOffsets = binwalkOffsets ?? offsets;

  return {
    path: label,
    compressedSizeBytes: buffer.length,
    gzipMemberCount: reliableOffsets.length,
    gzipSignatureCount: offsets.length,
    gzipCountSource: binwalkOffsets ? "binwalk" : "byte-signature-scan",
    sampleOffsets: reliableOffsets.slice(0, 20),
    interpretation:
      "Compressed proprietary Revit partition chunks. Chunk count is detectable, but object semantics are not decoded.",
  };
}

function streamDiagnostics(tempDir) {
  return {
    elemTable: elemTableDiagnostics(join(tempDir, "Global", "ElemTable")),
    largestPartition75: partitionDiagnostics(
      join(tempDir, "Partitions", "75"),
      "Partitions/75",
    ),
  };
}

async function main() {
  const { inputPath, outputDir, includeSourcePath } = parseArgs(
    process.argv.slice(2),
  );
  const resolvedInputPath = resolve(inputPath);

  if (!existsSync(resolvedInputPath)) {
    throw new Error(`RVT file does not exist: ${resolvedInputPath}`);
  }

  const stats = statSync(resolvedInputPath);
  const tempDir = mkdtempSync(join(tmpdir(), "oim-rvt-"));
  const resolvedOutputDir = outputDir ? resolve(outputDir) : null;

  try {
    const list = run("7z", ["l", "-ba", resolvedInputPath]).stdout;
    const entries = parse7zEntries(list);

    run("7z", [
      "x",
      "-y",
      `-o${tempDir}`,
      resolvedInputPath,
      "ProjectInformation",
      "TransmissionData",
      "BasicFileInfo",
      "RevitPreview4.0",
      "Global/ElemTable",
      "Partitions/75",
    ]);

    if (resolvedOutputDir) {
      mkdirSync(resolvedOutputDir, { recursive: true });
    }

    const nativeRvt = await extractNativeRvtInfo(
      resolvedInputPath,
      resolvedOutputDir ? join(resolvedOutputDir, "preview.png") : null,
    );

    const projectInfoPath = join(tempDir, "ProjectInformation");
    const projectInformationXml = existsSync(projectInfoPath)
      ? run("7z", ["x", "-so", projectInfoPath]).stdout
      : null;

    if (projectInformationXml && resolvedOutputDir) {
      writeFileSync(
        join(resolvedOutputDir, "project-information.xml"),
        projectInformationXml,
      );
    }

    const preview =
      nativeRvt.thumbnail ??
      carvePreviewPng(
        join(tempDir, "RevitPreview4.0"),
        resolvedOutputDir ? join(resolvedOutputDir, "preview.png") : null,
      );

    const extractedFiles = {};
    if (projectInformationXml && resolvedOutputDir) {
      extractedFiles.projectInformationXml = "project-information.xml";
    }
    if (preview && resolvedOutputDir) {
      extractedFiles.previewPng = "preview.png";
    }

    const manifest = {
      schemaVersion: 1,
      sourceFile: {
        name: basename(resolvedInputPath),
        ...(includeSourcePath ? { path: resolvedInputPath } : {}),
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        sha256: sha256File(resolvedInputPath),
      },
      container: {
        type: "Autodesk Revit RVT OLE compound document",
        summary: summarize(entries),
        entries,
      },
      projectInformation: projectInformationXml
        ? parseProjectInformationXml(projectInformationXml)
        : null,
      nativeRvt,
      preview,
      streamDiagnostics: streamDiagnostics(tempDir),
      extractedFiles,
      openIndoorMapsImport: {
        status: "metadata-only",
        canExtractRvtContainer: true,
        canExtractGeometry: false,
        geometryRequirement:
          "Export RVT with Revit or Autodesk Design Automation to IFC, then convert rooms/spaces/routes into OpenIndoorMaps GeoJSON.",
        targetCollections: ["indoorMap", "indoorRoutes", "pois"],
      },
    };

    if (resolvedOutputDir) {
      writeFileSync(
        join(resolvedOutputDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      console.log(`Wrote ${join(resolvedOutputDir, "manifest.json")}`);
      if (extractedFiles.projectInformationXml) {
        console.log(
          `Wrote ${join(resolvedOutputDir, extractedFiles.projectInformationXml)}`,
        );
      }
      if (extractedFiles.previewPng) {
        console.log(
          `Wrote ${join(resolvedOutputDir, extractedFiles.previewPng)}`,
        );
      }
    } else {
      console.log(JSON.stringify(manifest, null, 2));
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error(usage);
  process.exit(1);
}
