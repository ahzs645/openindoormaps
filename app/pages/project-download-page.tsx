import { useEffect, useRef, useState } from "react";
import {
  fetchHostedProject,
  hostedDevelopmentOffer,
} from "~/indoor-project/hosted-project";
import {
  buildDevelopmentDownload,
  readDevelopmentSnapshot,
  type DevelopmentSnapshot,
} from "~/indoor-project/development-download";
import "./project-download-page.css";

/** Download transport only: no project import, floor preparation or route worker. */
export default function ProjectDownloadPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [development, setDevelopment] = useState<{
    url: string;
    viewerSha256: string;
    snapshot: DevelopmentSnapshot;
  }>();
  const [developmentStatus, setDevelopmentStatus] = useState("");
  const [saved, setSaved] = useState<{
    url: string;
    name: string;
    bytes: number;
    sha256: string;
  }>();
  const controller = useRef<AbortController>();
  useEffect(() => {
    const request = new AbortController();
    const query = location.hash.includes("?")
      ? location.hash.slice(location.hash.indexOf("?") + 1)
      : location.search;
    const manifest = new URLSearchParams(query).get("package");
    if (manifest)
      void (async () => {
        try {
          const offer = await hostedDevelopmentOffer(
            new URL(manifest, location.href).href,
            request.signal,
          );
          if (!offer) return;
          const snapshot = await readDevelopmentSnapshot(
            offer.url,
            request.signal,
          );
          if (snapshot.viewer.sha256 !== offer.viewerSha256)
            throw new Error(
              "The development snapshot does not match this visitor release.",
            );
          if (!request.signal.aborted) setDevelopment({ ...offer, snapshot });
        } catch (error) {
          if (!request.signal.aborted)
            setDevelopmentStatus(
              error instanceof Error
                ? error.message
                : "Development download is unavailable.",
            );
        }
      })();
    return () => request.abort();
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    return () => {
      if (saved) URL.revokeObjectURL(saved.url);
    };
  }, [saved]);

  async function download(kind: "viewer" | "development" = "viewer") {
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
      const result =
        kind === "development" && development
          ? await buildDevelopmentDownload(
              development.url,
              development.viewerSha256,
              { signal: request.signal, onProgress: setStatus },
            )
          : await fetchHostedProject(new URL(manifest, location.href).href, {
              signal: request.signal,
              onProgress: (received, total) => {
                if (!request.signal.aborted)
                  setStatus(
                    `${received === total ? "Verifying ZIP" : "Downloading"} · ${(received / 1e6).toFixed(2)} / ${(total / 1e6).toFixed(2)} MB`,
                  );
              },
            });
      request.signal.throwIfAborted();
      const blob = new Blob([result.bytes as Uint8Array<ArrayBuffer>], {
        type: "application/zip",
      });
      const url = URL.createObjectURL(blob);
      // The transport validates a bounded ZIP name. Strip path/control characters
      // before using a name supplied by a hosted manifest as a local filename.
      const name = result.fileName.replaceAll(/[^\w.-]/g, "_");
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
          <button onClick={() => void download("viewer")} disabled={busy}>
            {saved ? "Check for a newer package" : "Prepare latest map ZIP"}
          </button>
          {busy && <button onClick={cancel}>Cancel download</button>}
        </div>
        {development && (
          <section
            className="development-download"
            aria-label="Development snapshot"
          >
            <h2>Continue development elsewhere</h2>
            <p>
              Download both repositories at their recorded commits, the current
              visitor map, checksums and restore instructions. Dependencies can
              be installed again with npm.
            </p>
            <p>
              <strong>
                {development.snapshot.nativeRebuildReady
                  ? "Native authoring inputs included."
                  : "Native rebuild backup is incomplete."}
              </strong>{" "}
              {development.snapshot.nativeRebuildReady
                ? ""
                : "The missing inputs below are needed to resume the native source work."}
            </p>
            <ul>
              {development.snapshot.missingInputs.map((x) => (
                <li key={x.name}>
                  <strong>{x.name}</strong> — {x.reason}
                </li>
              ))}
            </ul>
            <button
              disabled={busy}
              onClick={() => void download("development")}
            >
              Prepare development snapshot ·{" "}
              {(
                (development.snapshot.viewer.bytes +
                  development.snapshot.repositories.reduce(
                    (n, r) => n + r.bytes,
                    0,
                  )) /
                1e6
              ).toFixed(1)}{" "}
              MB
            </button>
            <details>
              <summary>Source versions and contents</summary>
              {development.snapshot.repositories.map((r) => (
                <p key={r.name}>
                  {r.name} · <code>{r.commit}</code>
                </p>
              ))}
              <p>
                Map SHA-256 <code>{development.viewerSha256}</code>
              </p>
              <p>
                Release <code>{development.snapshot.releaseId}</code>
              </p>
            </details>
          </section>
        )}
        {developmentStatus && <p>{developmentStatus}</p>}
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
