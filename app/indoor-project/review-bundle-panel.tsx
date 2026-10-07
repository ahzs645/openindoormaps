import { useEffect, useMemo, useState } from "react";
import { reviewFileBytes, type ReviewBundle } from "./review-bundle";
export function ReviewBundlePanel({ bundle }: { bundle?: ReviewBundle }) {
  const [selected, select] = useState("");
  const file = bundle?.files.find((f) => f.path === selected);
  const content = useMemo(
    () => (file ? reviewFileBytes(file) : undefined),
    [file],
  );
  const url = useMemo(
    () =>
      content
        ? URL.createObjectURL(
            new Blob([new Uint8Array(content).buffer], {
              type: /\.png$/i.test(selected)
                ? "image/png"
                : /\.jpe?g$/i.test(selected)
                  ? "image/jpeg"
                  : "text/plain;charset=utf-8",
            }),
          )
        : "",
    [content, selected],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!bundle) return null;
  return (
    <details className="project-review-files">
      <summary>
        Review files · {bundle.files.length} companions saved with this project
      </summary>
      <p>
        Checksummed recommendations, scans and proof from master{" "}
        {bundle.masterSha256.slice(0, 12)}. Text is shown as source material;
        recommendations are not applied corrections.
      </p>
      <div className="project-review-file-list">
        {bundle.files.map((f) => (
          <button
            key={f.path}
            aria-pressed={selected === f.path}
            onClick={() => select(f.path)}
          >
            {f.path}
          </button>
        ))}
      </div>
      {file && content && (
        <div>
          <a href={url} download={file.path}>
            Download {file.path}
          </a>
          {/\.(png|jpe?g)$/i.test(selected) ? (
            <img src={url} alt={file.path} />
          ) : (
            <pre>
              {new TextDecoder().decode(content.subarray(0, 128 * 1024))}
              {content.length > 128 * 1024
                ? "\n…Preview truncated; download the full report."
                : ""}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}
