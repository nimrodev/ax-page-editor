import { FormEvent, useCallback, useEffect, useState } from "react";
import { Modification } from "@ax/schema";
import { AgentPayload, RenderFailure, renderPage } from "./api";
import { failureMessage } from "./failure-messages";
import { HumanPreview, Selection } from "./HumanPreview";
import { Inspector } from "./Inspector";
import { AgentPayloadView } from "./AgentPayloadView";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; payload: AgentPayload };

/**
 * A modification's id is derived from its (type, target path) rather than
 * generated fresh each time, so re-applying to the same element is
 * naturally an upsert on the client too — matching the server's own
 * dedupeModifications, which enforces the same rule at the render seam
 * regardless of what a client sends.
 */
function modificationId(type: string, path: string): string {
  return `${type}:${path}`;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const [view, setView] = useState<"agent" | "human">("agent");
  const [humanViewRequested, setHumanViewRequested] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [modifications, setModifications] = useState<Modification[]>([]);

  const handleSelect = useCallback((next: Selection) => setSelection(next), []);

  const handleHide = useCallback((target: Selection) => {
    const id = modificationId("hide", target.locator.path);
    setModifications((prev) => [
      ...prev.filter((m) => m.id !== id),
      { id, type: "hide", target: target.locator },
    ]);
  }, []);

  const handleSetContext = useCallback((target: Selection, text: string) => {
    const id = modificationId("context", target.locator.path);
    setModifications((prev) => [
      ...prev.filter((m) => m.id !== id),
      { id, type: "context", target: target.locator, value: { text } },
    ]);
  }, []);

  const handleForwardLink = useCallback((target: Selection) => {
    const href = target.href;
    if (!href) return;
    const id = modificationId("forwardLink", target.locator.path);
    setModifications((prev) => [
      ...prev.filter((m) => m.id !== id),
      { id, type: "forwardLink", target: target.locator, value: { href } },
    ]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setModifications((prev) => prev.filter((m) => m.id !== id));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    const submittedUrl = url.trim();
    setState({ status: "loading" });
    setView("agent");
    setHumanViewRequested(false);
    setSelection(null);
    setModifications([]);
    try {
      const payload = await renderPage(submittedUrl);
      setState({ status: "ready", url: submittedUrl, payload });
    } catch (err) {
      const message =
        err instanceof RenderFailure ? failureMessage(err.reason) : failureMessage("unknown");
      setState({ status: "error", message });
    }
  }

  // Re-renders the agent payload whenever the modification list changes,
  // so hiding something in Human view is reflected in Agent view without
  // a separate "apply" step. The render seam is stateless and re-fetches
  // fresh each time (ADR-0001), so this is a normal render call, not a
  // save.
  const readyUrl = state.status === "ready" ? state.url : null;
  useEffect(() => {
    if (!readyUrl) return;
    let cancelled = false;

    renderPage(readyUrl, modifications)
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", url: readyUrl, payload });
      })
      .catch(() => {
        // A modification-triggered re-render failing (e.g. a transient
        // network blip) leaves the last good payload on screen rather
        // than replacing it with an error, so a flaky re-render can't
        // blank out a page the user already successfully loaded.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyUrl, modifications]);

  function selectView(next: "agent" | "human") {
    setView(next);
    if (next === "human") setHumanViewRequested(true);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-800">AX Page Editor</h1>
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/pricing"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={state.status === "loading"}
          >
            {state.status === "loading" ? "Loading…" : "Load page"}
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        {state.status === "idle" && (
          <p className="text-slate-500">
            Enter a URL above to see what an AI agent reads from that page today.
          </p>
        )}

        {state.status === "error" && (
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">
            {state.message}
          </div>
        )}

        {state.status === "ready" && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {view === "agent" ? "This is what an AI agent sees today." : "The page as it actually looks."}
              </p>
              <div className="flex gap-1 text-sm">
                <button
                  onClick={() => selectView("agent")}
                  className={`rounded px-3 py-1 ${view === "agent" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Agent view
                </button>
                <button
                  onClick={() => selectView("human")}
                  className={`rounded px-3 py-1 ${view === "human" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Human view
                </button>
              </div>
            </div>

            <div style={{ display: view === "agent" ? "block" : "none" }}>
              <div className="mb-2 flex justify-end gap-1 text-sm">
                <button
                  onClick={() => setFormat("markdown")}
                  className={`rounded px-2 py-1 ${format === "markdown" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setFormat("html")}
                  className={`rounded px-2 py-1 ${format === "html" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  HTML
                </button>
              </div>
              <AgentPayloadView payload={state.payload} format={format} modifications={modifications} view={view} />
            </div>

            {/*
              Once requested, HumanPreview stays mounted for the rest of
              this page's session — switching views toggles CSS display,
              never mount/unmount. The click highlight is applied as a live
              DOM style inside the iframe, not tracked in React state, so
              it only survives a view switch because the iframe's document
              is never torn down. Conditionally rendering this on `view`
              instead of `humanViewRequested` would silently break
              "selection survives switching views".
            */}
            {humanViewRequested && (
              <div style={{ display: view === "human" ? "flex" : "none" }} className="gap-4">
                <div className="flex-1">
                  <HumanPreview url={state.url} onSelect={handleSelect} />
                </div>
                <Inspector
                  selection={selection}
                  modifications={modifications}
                  modificationStatuses={state.status === "ready" ? state.payload.modificationStatuses : []}
                  onHide={handleHide}
                  onRemove={handleRemove}
                  onSetContext={handleSetContext}
                  onForwardLink={handleForwardLink}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
