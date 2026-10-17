import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import ts from "typescript";

export const VISITOR_OFFLINE_SHELL_LIMIT = 128 * 1024 * 1024;
export type VisitorOfflineShellManifest = {
  format: "openindoormaps-visitor-offline-shell-v1";
  version: 1;
  basePath: string;
  assets: { path: string; sha256: string; bytes: number }[];
  totalBytes: number;
  revisionSha256: string;
};
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
type BuildGraph = Record<
  string,
  {
    type: string;
    isEntry?: boolean;
    facadeModuleId?: string | null;
    imports?: string[];
    dynamicImports?: string[];
    viteMetadata?: { importedAssets?: Set<string>; importedCss?: Set<string> };
  }
>;

/** Follow the real visitor entry and emitted worker/asset closures. The main
 * router's other lazy routes and Vite preload lookup table are not visitors. */
export async function selectVisitorOfflineShellFiles(
  directory: string,
  basePath: string,
  candidates: string[],
  graph?: BuildGraph,
): Promise<string[]> {
  const files = new Set(candidates),
    selected = new Set<string>();
  const site = new URL(basePath, "https://visitor-build.invalid/");
  const reference = (value: string, from: string) => {
    if (files.has(value)) return value;
    try {
      const url = new URL(value, new URL(from, site));
      if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname))
        return;
      const name = decodeURIComponent(url.pathname.slice(site.pathname.length));
      if (files.has(name)) return name;
    } catch {
      /* A non-file string is not a dependency. */
    }
  };
  const html = await readFile(path.join(directory, "index.html"), "utf8");
  const roots = new Set<string>();
  for (const match of html.matchAll(
    /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/g,
  )) {
    const name = reference(match[1], "index.html");
    if (name) roots.add(name);
  }
  const visitorEntries = Object.entries(graph ?? {})
    .filter(([, chunk]) =>
      chunk.facadeModuleId
        ?.replaceAll("\\", "/")
        .split("?")[0]
        .endsWith("/app/pages/progressive-visitor-page.tsx"),
    )
    .map(([name]) => name);
  if (visitorEntries.length === 0)
    visitorEntries.push(
      ...candidates.filter(
        (name) =>
          /^progressive-visitor-page(?:-|\.)/.test(path.posix.basename(name)) &&
          /\.m?js$/.test(name),
      ),
    );
  if (visitorEntries.length === 0)
    throw new Error(
      "The offline build is missing its progressive visitor entry.",
    );
  const visitors = new Set(visitorEntries);
  const visit = async (name: string): Promise<void> => {
    if (!files.has(name) || selected.has(name)) return;
    selected.add(name);
    const metadata = graph?.[name];
    for (const child of [
      ...(metadata?.imports ?? []),
      ...(metadata?.viteMetadata?.importedAssets ?? []),
      ...(metadata?.viteMetadata?.importedCss ?? []),
    ])
      await visit(child);
    if (/\.m?js$/.test(name)) {
      const text = await readFile(path.join(directory, name), "utf8");
      const parsed = ts.createSourceFile(
        name,
        text,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.JS,
      );
      const dependencies = new Set<string>();
      const walk = (node: ts.Node) => {
        // This table contains every other route's lazy dependencies, not just
        // the selected route. Real imports/asset URLs below provide the edges.
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === "__vite__mapDeps"
        )
          return;
        if (ts.isStringLiteralLike(node)) {
          const child = reference(node.text, name);
          const dynamic =
            ts.isCallExpression(node.parent) &&
            node.parent.expression.kind === ts.SyntaxKind.ImportKeyword;
          if (child && (!dynamic || visitors.has(child)))
            dependencies.add(child);
        }
        ts.forEachChild(node, walk);
      };
      walk(parsed);
      for (const child of dependencies) await visit(child);
    } else if (name.endsWith(".css")) {
      const text = await readFile(path.join(directory, name), "utf8");
      for (const match of text.matchAll(
        /url\(\s*["']?([^\s"')]+)["']?\s*\)/g,
      )) {
        const child = reference(match[1], name);
        if (child) await visit(child);
      }
    }
  };
  await visit("index.html");
  for (const name of roots) await visit(name);
  for (const name of visitors) await visit(name);
  for (const name of candidates)
    if (name.startsWith("glyphs/") || (!graph && name.endsWith(".css")))
      await visit(name);
  return [...selected].sort();
}

/** Build bytes, including lazy route/floor workers and WASM, are separate from
 * visitor map data. This inventory is fetched only by explicit offline download. */
export async function writeVisitorOfflineShellManifest(
  directory: string,
  basePath: string,
  graph?: BuildGraph,
): Promise<VisitorOfflineShellManifest> {
  if (
    !basePath.startsWith("/") ||
    !basePath.endsWith("/") ||
    /[\\%?#:]/.test(basePath) ||
    basePath.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error(
      "Offline visitor shell requires an absolute same-origin base path.",
    );
  const assets: VisitorOfflineShellManifest["assets"] = [];
  const candidates: string[] = [];
  async function walk(relative: string) {
    for (const entry of await readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (
        entry.isFile() &&
        name !== "visitor-offline-sw.js" &&
        (name === "index.html" ||
          name === "glyphs/LICENSE.txt" ||
          (name.startsWith("glyphs/") && name.endsWith(".pbf")) ||
          /\.(?:m?js|css|wasm|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|gif|ico|webmanifest)$/i.test(
            name,
          ))
      ) {
        if (
          /[\\%?#:]/.test(name) ||
          name.split("/").some((part) => !part || part === "." || part === "..")
        )
          throw new Error(`Invalid offline visitor asset path: ${name}`);
        candidates.push(name);
      }
    }
  }
  await walk("");
  const selected = await selectVisitorOfflineShellFiles(
    directory,
    basePath,
    candidates,
    graph,
  );
  for (const name of selected) {
    const value = await readFile(path.join(directory, name));
    if (value.length === 0 || value.length > 64 * 1024 * 1024)
      throw new Error(`Oversized/empty offline visitor asset: ${name}`);
    assets.push({ path: name, sha256: hash(value), bytes: value.length });
  }
  assets.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  if (
    !assets.some((asset) => asset.path === "index.html") ||
    assets.length > 2048 ||
    totalBytes > VISITOR_OFFLINE_SHELL_LIMIT
  )
    throw new Error(
      "Offline visitor app inventory is missing its index or exceeds its bound.",
    );
  const body = {
    format: "openindoormaps-visitor-offline-shell-v1" as const,
    version: 1 as const,
    basePath,
    assets,
    totalBytes,
  };
  const manifest = {
    ...body,
    revisionSha256: hash(JSON.stringify(body)),
  };
  const text = JSON.stringify(manifest, null, 2) + "\n";
  if (Buffer.byteLength(text) > 2 * 1024 * 1024)
    throw new Error(
      "Offline visitor app inventory exceeds its manifest bound.",
    );
  await writeFile(path.join(directory, "visitor-offline-shell.json"), text);
  return manifest;
}

export function visitorOfflineShellPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "visitor-offline-app-shell-inventory",
    apply: "build",
    configResolved(value) {
      config = value;
    },
    async writeBundle(_options, bundle) {
      const result = await writeVisitorOfflineShellManifest(
        path.resolve(config.root, config.build.outDir),
        config.base,
        bundle as unknown as BuildGraph,
      );
      config.logger.info(
        `Visitor offline app shell: ${result.assets.length} files, ${(result.totalBytes / 1_000_000).toFixed(2)} MB uncompressed (separate from map data).`,
      );
    },
  };
}
