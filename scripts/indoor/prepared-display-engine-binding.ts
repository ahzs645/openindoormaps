import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const roots = [
  "app/indoor-project/prepared-floor.ts",
  "app/indoor-project/native-explore.ts",
  "app/indoor-project/prepared-floor-cache.ts",
  "app/indoor-project/prepared-display-preparation.ts",
];
const generated = "app/indoor-project/prepared-display-engine-binding.ts";

/** Build-time only. Runtime readers compare a literal; they never fetch source
 * modules or walk geometry on the UI thread to decide whether a cache is fresh. */
export function preparedDisplayEngineBinding(projectRoot: string) {
  const visited = new Set<string>();
  const dependencies = new Map<string, string>();
  const resolveImport = (parent: string, specifier: string) => {
    const base = resolve(dirname(parent), specifier);
    const candidates = [
      base,
      ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map(
        (ext) => base + ext,
      ),
    ];
    return candidates.find(
      (path) => existsSync(path) && statSync(path).isFile(),
    );
  };
  const visit = (path: string) => {
    if (visited.has(path)) return;
    visited.add(path);
    const name = relative(projectRoot, path).replaceAll("\\", "/");
    if (name === generated) return;
    const bytes = readFileSync(path);
    dependencies.set(name, hash(bytes));
    if (!/\.(?:ts|tsx|js|mjs)$/.test(path)) return;
    const source = ts.createSourceFile(
      path,
      bytes.toString(),
      ts.ScriptTarget.Latest,
      true,
    );
    const reference = (
      value: ts.Node | undefined,
      directoryAllowed = false,
    ) => {
      if (
        !value ||
        !ts.isStringLiteralLike(value) ||
        (!value.text.startsWith(".") &&
          (!directoryAllowed || /^[a-z][a-z\d+.-]*:/i.test(value.text)))
      )
        return;
      const target = resolveImport(path, value.text);
      if (
        !target &&
        directoryAllowed &&
        existsSync(resolve(dirname(path), value.text)) &&
        statSync(resolve(dirname(path), value.text)).isDirectory()
      )
        return;
      // Generated loaders contain unused fallback URL literals; the checked
      // wrapper supplies the real WASM bytes. Hash the loader itself and every
      // existing referenced asset, without making its dead fallback mandatory.
      if (!target && directoryAllowed) return;
      if (!target)
        throw new Error(
          `Missing prepared-display dependency ${value.text} in ${name}`,
        );
      visit(target);
    };
    const scan = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        reference(node.moduleSpecifier);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      )
        reference(node.arguments[0]);
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "URL"
      )
        reference(node.arguments?.[0], true);
      ts.forEachChild(node, scan);
    };
    scan(source);
  };
  for (const path of roots) visit(resolve(projectRoot, path));
  const lock = resolve(projectRoot, "package-lock.json");
  dependencies.set("package-lock.json", hash(readFileSync(lock)));
  const modules = [...dependencies].sort(([a], [b]) => a.localeCompare(b));
  return {
    version: 1,
    sha256: hash(
      JSON.stringify(["prepared-native-display-engine-v1", modules]),
    ),
    modules,
  };
}

export function writePreparedDisplayEngineBinding(projectRoot: string) {
  const binding = preparedDisplayEngineBinding(projectRoot);
  const path = resolve(projectRoot, generated);
  const source = `// Generated from the complete local preparation module graph and dependency lock.\n// Refresh through Vite or scripts/indoor/prepared-display-engine-binding.ts.\nexport const PREPARED_DISPLAY_ENGINE_SHA256 = ${JSON.stringify(binding.sha256)};\n`;
  if (!existsSync(path) || readFileSync(path, "utf8") !== source)
    writeFileSync(path, source);
  return binding;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const binding = writePreparedDisplayEngineBinding(
    resolve(process.argv[2] ?? "."),
  );
  console.log(
    JSON.stringify({ sha256: binding.sha256, modules: binding.modules.length }),
  );
}
