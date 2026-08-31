import { FormEvent, useState } from "react";
import { AgentPayload, RenderFailure, renderPage } from "./api";
import { failureMessage } from "./failure-messages";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: AgentPayload };

export default function App() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [format, setFormat] = useState<"markdown" | "html">("markdown");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setState({ status: "loading" });
    try {
      const payload = await renderPage(url.trim());
      setState({ status: "ready", payload });
    } catch (err) {
      const message =
        err instanceof RenderFailure ? failureMessage(err.reason) : failureMessage("unknown");
      setState({ status: "error", message });
    }
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

      <main className="mx-auto max-w-4xl px-6 py-8">
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
                This is what an AI agent sees today.
              </p>
              <div className="flex gap-1 text-sm">
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
        )}
      </main>
    </div>
  );
}
