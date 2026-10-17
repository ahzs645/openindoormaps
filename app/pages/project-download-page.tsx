import { useEffect, useRef, useState } from "react";
import { fetchHostedProject } from "~/indoor-project/hosted-project";
import "./project-download-page.css";

/** Download transport only: no project import, floor preparation or route worker. */
export default function ProjectDownloadPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState<{
    url: string;
    name: string;
    bytes: number;
    sha256: string;
  }>();
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    return () => {
      if (saved) URL.revokeObjectURL(saved.url);
    };
  }, [saved]);

  async function download() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setSaved(undefined);
    setBusy(true);
    setStatus("Checking the current published package…");
    try {
      const query = location.hash.includes("?")
        ? location.hash.slice(location.hash.indexOf("?") + 1)
        : location.search;
      const manifest = new URLSearchParams(query).get("package");
      if (!manifest) throw new Error("Open the download link from your map.");
      const result = await fetchHostedProject(
        new URL(manifest, location.href).href,
        {
          signal: request.signal,
          onProgress: (received, total) => {
            if (!request.signal.aborted)
              setStatus(
                `${received === total ? "Verifying ZIP" : "Downloading"} · ${(received / 1e6).toFixed(2)} / ${(total / 1e6).toFixed(2)} MB`,
              );
          },
        },
      );
      request.signal.throwIfAborted();
      const blob = new Blob([result.bytes as Uint8Array<ArrayBuffer>], {
        type: "application/zip",
      });
      const url = URL.createObjectURL(blob);
      // The transport validates a bounded ZIP name. Strip path/control characters
      // before using a name supplied by a hosted manifest as a local filename.
      const name = result.fileName.replace(/[\\/\x00-\x1f\x7f]/g, "_");
      setSaved({
        url,
        name,
        bytes: result.bytes.length,
        sha256: result.sha256,
      });
      setStatus("Package verified. Save the ZIP below.");
    } catch (error) {
      if (!request.signal.aborted)
        setStatus(
          error instanceof Error
            ? error.message
            : "Map download failed. Please retry.",
        );
    } finally {
      if (controller.current === request) {
        controller.current = undefined;
        if (!request.signal.aborted) setBusy(false);
      }
    }
  }

  function cancel() {
    controller.current?.abort();
    controller.current = undefined;
    setBusy(false);
    setStatus("Download cancelled. You can try again.");
  }

  return (
    <main className="project-download-page">
      <article>
        <p className="download-kicker">OpenIndoorMaps</p>
        <h1>Download the latest published map</h1>
        <p>
          Get the portable visitor ZIP currently served by your map. This
          download does not prepare floors or calculate directions.
        </p>
        <p>
          The published package may stay the same when only the viewer changes.
          Unpublished geometry work is included after it is verified and
          published. Your personal viewer settings are stored separately in your
          browser.
        </p>
        <div className="download-actions">
          <button onClick={() => void download()} disabled={busy}>
            {saved ? "Check for a newer package" : "Prepare latest map ZIP"}
          </button>
          {busy && <button onClick={cancel}>Cancel download</button>}
        </div>
        <p role="status" aria-live="polite">
          {status}
        </p>
        {saved && (
          <section aria-label="Verified map package">
            <a className="download-save" href={saved.url} download={saved.name}>
              Save {saved.name} · {(saved.bytes / 1e6).toFixed(2)} MB
            </a>
            <details>
              <summary>Package fingerprint</summary>
              <p>
                SHA-256 <code>{saved.sha256}</code>
              </p>
            </details>
          </section>
        )}
        <p className="download-return">
          You can close this tab to return to your map.
        </p>
      </article>
    </main>
  );
}
