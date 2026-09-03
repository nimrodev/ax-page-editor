import { useEffect, useMemo, useRef, useState } from "react";
import { Modification } from "@ax/schema";
import { AgentPayload, MarkdownBlock } from "./api";
import { MarkerKind, splitHtmlByMarkers, wrapIndex } from "./agent-view-marks";
import { buildNavigatorEntries, ModificationNavigator, NavigatorEntry } from "./ModificationNavigator";
import { BlockPopover, buildBlockPopoverModel } from "./BlockPopover";

interface AgentPayloadViewProps {
  payload: AgentPayload;
  format: "markdown" | "html";
  modifications: Modification[];
  view: "agent" | "human";
  onLocateBlock: (axId: string) => void;
  onHideBlock: (axId: string) => void;
  onAddContextBlock: (axId: string) => void;
  onRemoveModification: (modificationId: string) => void;
}

interface SourceStyle {
  wrapperClass: string;
  label: string | null;
  labelClass: string;
  flashColor: string;
}

// One definition per modification type drives both the static marking and
// the jump navigator's flash color — a context note and forwarded content
// each get a distinct accent, reusing the same blue/green language as the
// Inspector's own badges rather than inventing a third palette. Green, not
// indigo, for forwarded content: indigo sat too close to blue to tell the
// two marks apart at a glance.
const SOURCE_STYLES: Record<MarkdownBlock["source"], SourceStyle> = {
  page: { wrapperClass: "", label: null, labelClass: "", flashColor: "" },
  context: {
    wrapperClass: "border-l-4 border-blue-300 bg-blue-50 pl-3",
    label: "Context note",
    labelClass: "bg-blue-100 text-blue-700",
    flashColor: "rgba(59, 130, 246, 0.7)", // blue-500
  },
  forwarded: {
    wrapperClass: "border-l-4 border-green-300 bg-green-50 pl-3",
    label: "Forwarded content",
    labelClass: "bg-green-100 text-green-700",
    flashColor: "rgba(22, 163, 74, 0.7)", // green-600
  },
};

const MARK_CLASS: Record<MarkerKind, string> = {
  context: "rounded bg-blue-100 text-blue-900",
  forwarded: "rounded bg-green-100 text-green-900",
};

const HINT_DISMISSED_KEY = "ax-block-hint-dismissed";

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
const SCROLL_TOP_THRESHOLD = 400;

export function AgentPayloadView({
  payload,
  format,
  modifications,
  view,
  onLocateBlock,
  onHideBlock,
  onAddContextBlock,
  onRemoveModification,
}: AgentPayloadViewProps) {
  const changedBlocks = useMemo(
    () => payload.markdownBlocks.filter((b) => b.source !== "page"),
    [payload.markdownBlocks],
  );
  const entries = useMemo(() => buildNavigatorEntries(modifications, payload), [modifications, payload]);
  const [index, setIndex] = useState(0);
  // Starts expanded (NIM-64 originally defaulted collapsed) — a publisher
  // opening Agent view for the first time was landing on a bare pill with
  // no indication of what it even summarizes, before ever seeing the list.
  const [expanded, setExpanded] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openPopoverAxId, setOpenPopoverAxId] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(HINT_DISMISSED_KEY) === "1",
  );
  const marksRef = useRef(new Map<string, HTMLElement>());
  const containerRef = useRef<HTMLDivElement>(null);

  // The payload can run to hundreds of blocks with nothing but the window
  // itself to scroll — this button only earns its place once you've
  // actually scrolled far enough that getting back to the top by hand
  // would be a chore.
  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > SCROLL_TOP_THRESHOLD);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // A fresh render can have a different (or empty) set of changed blocks —
  // don't carry a stale index over from the previous payload.
  useEffect(() => {
    setIndex(0);
    setActiveId(null);
  }, [payload]);

  // Closes the block popover on any click outside it — the popover itself
  // stops its own click events from bubbling here (see the onClick below).
  useEffect(() => {
    if (!openPopoverAxId) return;
    function handleDocumentClick() {
      setOpenPopoverAxId(null);
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [openPopoverAxId]);

  const safeIndex = wrapIndex(index, changedBlocks.length);
  const [suggestResume, setSuggestResume] = useState(false);

  // Markdown/HTML tabs render entirely separate DOM trees, and switching
  // between Human and Agent view leaves this component mounted but hides
  // it — either way, whichever change was in focus (even just "change 1"
  // by default, before any manual jump) is no longer the thing on screen.
  // Rather than re-scrolling for you unasked — a jump you didn't request,
  // in whatever direction you'd just scrolled the page yourself — this
  // only raises a "resume" offer on the pill; jumpTo still does the actual
  // scrolling, but only in response to a deliberate click. Both effects
  // skip their very first run: there's nothing to "return to" yet.
  const isFirstFormatRender = useRef(true);
  useEffect(() => {
    if (isFirstFormatRender.current) {
      isFirstFormatRender.current = false;
      return;
    }
    if (changedBlocks.length > 0) setSuggestResume(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  const isFirstViewRender = useRef(true);
  useEffect(() => {
    if (isFirstViewRender.current) {
      isFirstViewRender.current = false;
      return;
    }
    if (view === "agent" && changedBlocks.length > 0) setSuggestResume(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function jumpTo(rawIndex: number): void {
    if (changedBlocks.length === 0) return;
    const next = wrapIndex(rawIndex, changedBlocks.length);
    setIndex(next);
    setSuggestResume(false);

    const block = changedBlocks[next];
    const entry = entries.find((e) => e.axId === block.axId);
    if (entry) setActiveId(entry.modificationId);

    const el = marksRef.current.get(block.axId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    flashElement(el, SOURCE_STYLES[block.source].flashColor);
  }

  // A navigator row for a hide, or for a shadowed/unresolved modification,
  // has no axId — there's no block in this render's payload to scroll to.
  // Its own persistent "active" highlight in the list is the only feedback
  // a click on one of those can give.
  function selectEntry(entry: NavigatorEntry): void {
    setActiveId(entry.modificationId);
    setSuggestResume(false);
    if (!entry.axId) return;
    const idx = changedBlocks.findIndex((b) => b.axId === entry.axId);
    if (idx >= 0) jumpTo(idx);
  }

  function resumeToActive(): void {
    jumpTo(safeIndex);
  }

  function dismissHint(): void {
    setHintDismissed(true);
    localStorage.setItem(HINT_DISMISSED_KEY, "1");
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
    <div ref={containerRef}>
      {format === "markdown" && !hintDismissed && (
        <div className="mb-3 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>Click any paragraph below to locate it on your page, or hide/annotate it directly.</span>
          <button onClick={dismissHint} aria-label="Dismiss" className="text-amber-700 hover:underline">
            Got it
          </button>
        </div>
      )}
      {format === "markdown" ? (
        <div className="space-y-4 rounded border border-slate-200 bg-white p-4">
          {payload.markdownBlocks.map((block) => {
            const style = SOURCE_STYLES[block.source];
            const isOpen = openPopoverAxId === block.axId;
            return (
              <div
                key={block.axId}
                ref={(el) => registerMark(block.source === "page" ? undefined : block.axId, el)}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenPopoverAxId((current) => (current === block.axId ? null : block.axId));
                }}
                className={`relative cursor-pointer rounded py-1 ring-inset transition-shadow hover:ring-1 hover:ring-amber-300 ${isOpen ? "ring-1 ring-amber-400" : ""} ${style.wrapperClass}`}
              >
                {style.label && (
                  <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${style.labelClass}`}>
                    {style.label}
                  </span>
                )}
                <p className="whitespace-pre-wrap text-sm text-slate-700">{block.markdown}</p>
                {isOpen && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <BlockPopover
                      model={buildBlockPopoverModel(block, modifications)}
                      onLocate={() => {
                        setOpenPopoverAxId(null);
                        onLocateBlock(block.axId);
                      }}
                      onHide={() => {
                        setOpenPopoverAxId(null);
                        onHideBlock(block.axId);
                      }}
                      onAddContext={() => {
                        setOpenPopoverAxId(null);
                        onAddContextBlock(block.axId);
                      }}
                      onRemove={(modificationId) => {
                        setOpenPopoverAxId(null);
                        onRemoveModification(modificationId);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="overflow-auto whitespace-pre-wrap break-all rounded border border-slate-200 bg-white p-4 text-xs text-slate-700">
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

      {/* ModificationNavigator positions itself (mid-right collapsed,
          bottom-right expanded) since the two states now cross-fade
          rather than swap — a wrapper here with any transform would
          create a containing block that hijacks its fixed children's
          positioning. The Top button sits just above it in either state:
          above the collapsed pill's mid-right position, or above the
          expanded panel's own bottom-6 anchor plus its max-h-[50vh] cap
          — a fixed worst-case offset, so it never overlaps even though
          the panel's actual height varies with content. */}
      <ModificationNavigator
        entries={entries}
        expanded={expanded}
        onToggleExpanded={setExpanded}
        activeId={activeId}
        onSelect={selectEntry}
        jumpIndex={safeIndex}
        jumpCount={changedBlocks.length}
        onJumpDelta={(delta) => jumpTo(safeIndex + delta)}
        suggestResume={suggestResume}
        onResume={resumeToActive}
      />
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className={`fixed right-6 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-lg transition-all duration-300 ease-out hover:bg-slate-50 ${expanded ? "bottom-[calc(50vh+2rem)]" : "top-1/2 -translate-y-24"}`}
        >
          ↑ Top
        </button>
      )}
    </div>
  );
}
