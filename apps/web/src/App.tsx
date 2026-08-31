import { FormEvent, useCallback, useState } from "react";
import { AgentPayload, RenderFailure, renderPage } from "./api";
import { failureMessage } from "./failure-messages";
import { HumanPreview, Selection } from "./HumanPreview";
import { Inspector } from "./Inspector";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; payload: AgentPayload };

export default function App() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const [view, setView] = useState<"agent" | "human">("agent");
  const [humanViewRequested, setHumanViewRequested] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const handleSelect = useCallback((next: Selection) => setSelection(next), []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    const submittedUrl = url.trim();
    setState({ status: "loading" });
    setView("agent");
    setHumanViewRequested(false);
    setSelection(null);
    try {
      const payload = await renderPage(submittedUrl);
      setState({ status: "ready", url: submittedUrl, payload });
    } catch (err) {
      const message =
        err instanceof RenderFailure ? failureMessage(err.reason) : failureMessage("unknown");
      setState({ status: "error", message });
    }
  }

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

      <main className="mx-auto max-w-5xl px-6 py-8">
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
              {format === "markdown" ? (
                <div className="space-y-4 rounded border border-slate-200 bg-white p-4">
                  {state.payload.markdownBlocks.map((block) => (
                    <p key={block.axId} className="whitespace-pre-wrap text-sm text-slate-700">
                      {block.markdown}
                    </p>
                  ))}
                </div>
              ) : (
                <pre className="overflow-auto rounded border border-slate-200 bg-white p-4 text-xs text-slate-700">
                  {state.payload.html}
                </pre>
              )}
            </div>

            {humanViewRequested && (
              <div style={{ display: view === "human" ? "flex" : "none" }} className="gap-4">
                <div className="flex-1">
                  <HumanPreview url={state.url} onSelect={handleSelect} />
                </div>
                <Inspector selection={selection} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
