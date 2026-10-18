import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";

/** Copy only declared carriers as regular file contents. A split representation
 * uses its actual parts; its nominal unsplit path need not exist. Callers verify
 * source and destination checksums separately before admitting an export. */
export async function copyDeclaredProgressiveAssets(
  source: string,
  destination: string,
  manifest: ProgressiveManifest,
) {
  validateProgressiveManifest(manifest);
  const paths = new Set(
    Object.values(manifest.assets).flatMap((asset) =>
      asset.representations.flatMap((representation) =>
        representation.parts
          ? representation.parts.map((part) => part.path)
          : [representation.path],
      ),
    ),
  );
  for (const relative of paths) {
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(source, relative), target);
  }
  return { files: paths.size };
}
