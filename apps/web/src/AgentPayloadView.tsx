import { useEffect, useMemo, useRef, useState } from "react";
import { AgentPayload, MarkdownBlock } from "./api";
import { MarkerKind, splitHtmlByMarkers, wrapIndex } from "./agent-view-marks";

interface AgentPayloadViewProps {
  payload: AgentPayload;
  format: "markdown" | "html";
}

interface SourceStyle {
  wrapperClass: string;
  label: string | null;
  labelClass: string;
  flashColor: string;
}

// One definition per modification type drives both the static marking and
// the jump navigator's flash color — a context note and forwarded content
// each get a distinct accent, reusing the same blue/indigo language as the
// Inspector's own badges rather than inventing a third palette.
const SOURCE_STYLES: Record<MarkdownBlock["source"], SourceStyle> = {
  page: { wrapperClass: "", label: null, labelClass: "", flashColor: "" },
  context: {
    wrapperClass: "border-l-4 border-blue-300 bg-blue-50 pl-3",
    label: "Context note",
    labelClass: "bg-blue-100 text-blue-700",
    flashColor: "rgba(59, 130, 246, 0.7)", // blue-500
  },
  forwarded: {
    wrapperClass: "border-l-4 border-indigo-300 bg-indigo-50 pl-3",
    label: "Forwarded content",
    labelClass: "bg-indigo-100 text-indigo-700",
    flashColor: "rgba(99, 102, 241, 0.7)", // indigo-500
  },
};

const MARK_CLASS: Record<MarkerKind, string> = {
  context: "rounded bg-blue-100 text-blue-900",
  forwarded: "rounded bg-indigo-100 text-indigo-900",
};

function flashElement(el: HTMLElement, color: string): void {
  el.style.setProperty("--ax-jump-flash-color", color);
  el.classList.add("ax-jump-flash");
  window.setTimeout(() => el.classList.remove("ax-jump-flash"), 900);
}

/**
 * Renders the agent payload in either format, marking modification-added
 * blocks (NIM-63) and offering a jump-to-change navigator over the same
 * data — one dataset (the non-"page" blocks) drives both, so marking and
 * navigation can never disagree about what counts as a change.
 */
export function AgentPayloadView({ payload, format }: AgentPayloadViewProps) {
  const changedBlocks = useMemo(
    () => payload.markdownBlocks.filter((b) => b.source !== "page"),
    [payload.markdownBlocks],
  );
  const [index, setIndex] = useState(0);
  const marksRef = useRef(new Map<string, HTMLElement>());

  // A fresh render can have a different (or empty) set of changed blocks —
  // don't carry a stale index over from the previous payload.
  useEffect(() => {
    setIndex(0);
  }, [payload]);

  const safeIndex = wrapIndex(index, changedBlocks.length);

  function jumpTo(rawIndex: number): void {
    if (changedBlocks.length === 0) return;
    const next = wrapIndex(rawIndex, changedBlocks.length);
    setIndex(next);

    const block = changedBlocks[next];
    const el = marksRef.current.get(block.axId);
    if (!el) return;
    // inline: "center" matters specifically for the HTML tab — its <pre>
    // holds very long, unwrapped lines, so the default "nearest" can leave
    // a mark sitting right at the edge of the viewport instead of visible.
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    flashElement(el, SOURCE_STYLES[block.source].flashColor);
  }

  const htmlSegments = useMemo(
    () => (format === "html" ? splitHtmlByMarkers(payload.html) : null),
    [format, payload.html],
  );

  // Only a non-"page" block is ever jumped to, so only its DOM node needs
  // tracking here — passing undefined for a plain page block (rather than
  // its real axId) keeps that filtering in one place instead of every
  // caller re-checking `block.source !== "page"` itself.
  function registerMark(axId: string | undefined, el: HTMLElement | null): void {
    if (!axId) return;
    if (el) marksRef.current.set(axId, el);
    else marksRef.current.delete(axId);
  }

  return (
    <div>
      {format === "markdown" ? (
        <div className="space-y-4 rounded border border-slate-200 bg-white p-4">
          {payload.markdownBlocks.map((block) => {
            const style = SOURCE_STYLES[block.source];
            return (
              <div
                key={block.axId}
                ref={(el) => registerMark(block.source === "page" ? undefined : block.axId, el)}
                className={`rounded py-1 ${style.wrapperClass}`}
              >
                {style.label && (
                  <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${style.labelClass}`}>
                    {style.label}
                  </span>
                )}
                <p className="whitespace-pre-wrap text-sm text-slate-700">{block.markdown}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="overflow-auto rounded border border-slate-200 bg-white p-4 text-xs text-slate-700">
          {htmlSegments!.map((segment, i) =>
            segment.markerKind ? (
              <mark
                key={i}
                ref={(el) => registerMark(segment.axId, el)}
                className={MARK_CLASS[segment.markerKind]}
              >
                {segment.text}
              </mark>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </pre>
      )}

      {changedBlocks.length > 0 && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-lg">
          <button
            onClick={() => jumpTo(safeIndex - 1)}
            aria-label="Previous change"
            className="rounded px-1.5 text-slate-600 hover:bg-slate-100"
          >
            ‹
          </button>
          <span className="tabular-nums text-slate-600">
            {safeIndex + 1} of {changedBlocks.length} {changedBlocks.length === 1 ? "change" : "changes"}
          </span>
          <button
            onClick={() => jumpTo(safeIndex + 1)}
            aria-label="Next change"
            className="rounded px-1.5 text-slate-600 hover:bg-slate-100"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
