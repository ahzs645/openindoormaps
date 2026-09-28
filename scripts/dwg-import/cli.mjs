#!/usr/bin/env node

import { basename, join } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { AgentSwarmPipeline } from "./lib/swarm.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.input || !args.config) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

try {
  const config = loadConfig(args.config);
  const defaultOutputDir = join(
    process.cwd(),
    "generated",
    "dwg-import",
    basename(args.input).replace(/\.[^.]+$/u, ""),
  );

  const pipeline = new AgentSwarmPipeline({
    inputPath: args.input,
    outputDir: args.outdir ?? defaultOutputDir,
    bundleTarget: args.bundleTarget ?? null,
    locationDir: args.locationDir ?? null,
    config,
  });

  const result = pipeline.run();

  console.log("DWG import swarm completed.");
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Indoor map: ${result.artifacts.output.indoorMapPath}`);
  console.log(`POIs: ${result.artifacts.output.poisPath}`);
  console.log(`Routes: ${result.artifacts.output.indoorRoutesPath}`);
  console.log(`Bundle: ${result.artifacts.output.bundlePath}`);

  if (result.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
} catch (error) {
  console.error("DWG import swarm failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const value = rawArgs[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return {
    help: parsed.help ?? false,
    input: parsed.input,
    config: parsed.config,
    outdir: parsed.outdir,
    bundleTarget: parsed["bundle-target"],
    locationDir: parsed["location-dir"],
  };
}

function printUsage() {
  console.log(`Usage:
  npm run dwg:import -- --input <path/to/file.dwg|file.dxf> --config <config.json> [--outdir <dir>] [--bundle-target <path>] [--location-dir <app/data/slug>]

Examples:
  npm run dwg:import -- --input "floor plan.dwg" --config scripts/dwg-import/config.example.json
  npm run dwg:import -- --input building.dxf --config scripts/dwg-import/config.unbc.json --outdir generated/dwg-import/unbc`);
}
