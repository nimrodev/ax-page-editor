import { useEffect, useRef, useState } from "react";
import { Locator, Modification } from "@ax/schema";
import { fetchHumanView, RenderFailure } from "./api";
import { failureMessage } from "./failure-messages";
import { IFRAME_OVERLAY_SCRIPT } from "./iframe-overlay";

export interface Selection {
  axId: string;
  tag: string;
  text: string;
  href: string | null;
  locator: Locator;
}

interface AxSelectMessage {
  type: "ax:select";
  axId: string;
  tag: string;
  text: string;
  href: string | null;
  locator: Locator;
}

function isAxSelectMessage(data: unknown): data is AxSelectMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "ax:select";
}

interface HumanPreviewProps {
  url: string;
  onSelect: (selection: Selection) => void;
  // A new token each time, even for the same locator — clicking the same
  // review-list row twice should re-reveal it (re-scroll, re-flash) both
  // times, not silently no-op the second time because the locator didn't
  // change.
  revealRequest?: { locator: Locator; token: number } | null;
  // Marked in the preview always, unasked (NIM-57) — every modification
  // on the page, not just the one currently selected or being reviewed.
  modifications: Modification[];
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; html: string };

export interface MarkPayloadEntry {
  id: string;
  type: Modification["type"];
  target: Locator;
  // True when another modification targets this exact same locator path
  // — a context note and a forwarded link on the same selection, say,
  // which the Inspector explicitly allows at once. A single CSS outline
  // can't show two colors on one element, so the overlay needs to know
  // to fall back to a combined "multiple" style rather than let the
  // second mark silently overwrite the first with no sign anything else
  // is there.
  sharedElement: boolean;
}

/**
 * Strips each modification down to what the overlay script actually
 * needs to mark it (NIM-57) — an id, a type to pick the outline color,
 * and the locator to resolve. Dropping `value` isn't just tidiness: a
 * context note's full text has no reason to cross into the sandboxed
 * iframe at all when a colored outline is all that's rendered there.
 */
export function buildMarkPayload(modifications: Modification[]): MarkPayloadEntry[] {
  const countByPath = new Map<string, number>();
  for (const m of modifications) {
    countByPath.set(m.target.path, (countByPath.get(m.target.path) ?? 0) + 1);
  }

  return modifications.map((m) => ({
    id: m.id,
    type: m.type,
    target: m.target,
    sharedElement: (countByPath.get(m.target.path) ?? 0) > 1,
  }));
}

/**
 * Renders the page as it actually looks, in a sandboxed iframe, and turns
 * clicks on its elements into selection events for the parent. allow-scripts
 * is needed only so the overlay script below can run — the fetched page's
 * own scripts were already stripped by sanitizeDocument (ADR-0005).
 */
export function HumanPreview({ url, onSelect, revealRequest, modifications }: HumanPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // A ref, not just the prop, because the overlay's "ready" ping arrives
  // on its own schedule (whenever the srcdoc's script finishes setting
  // up) — the message handler that reacts to it is created once and
  // can't close over a fresh `modifications` value without one.
  const modificationsRef = useRef(modifications);
  modificationsRef.current = modifications;

  function sendMarks() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "ax:mark-modifications", modifications: buildMarkPayload(modificationsRef.current) },
      "*",
    );
  }

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetchHumanView(url)
      .then(({ html }) => {
        if (!cancelled) setState({ status: "ready", html });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof RenderFailure ? failureMessage(err.reason) : failureMessage("unknown");
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (isAxSelectMessage(event.data)) {
        onSelect({
          axId: event.data.axId,
          tag: event.data.tag,
          text: event.data.text,
          href: event.data.href,
          locator: event.data.locator,
        });
      }
      // The srcdoc's script sets up its listeners on its own schedule —
      // this ping is how it tells the parent it's actually ready to
      // receive "ax:mark-modifications", rather than the parent racing a
      // fixed delay against an iframe load event that fires too early.
      if ((event.data as { type?: unknown } | null)?.type === "ax:overlay-ready") {
        sendMarks();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect]);

  // The review list (NIM-55) asking to reveal a modification whose
  // element lives inside the sandboxed iframe — this frame has no DOM
  // access into it, so the request crosses via postMessage the same way
  // a click's selection crosses back out.
  useEffect(() => {
    if (!revealRequest) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "ax:reveal", locator: revealRequest.locator }, "*");
  }, [revealRequest]);

  // Marks are always on (NIM-57's explicit requirement) — re-sent
  // whenever the modification list itself changes, not just once at
  // load, so hiding or removing something in the Inspector is reflected
  // here without a page reload.
  useEffect(() => {
    sendMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifications]);

  if (state.status === "loading") {
    return <p className="text-slate-500">Loading preview…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">
        {state.message}
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="Page preview"
      sandbox="allow-scripts"
      srcDoc={state.html + IFRAME_OVERLAY_SCRIPT}
      className="h-[70vh] w-full rounded border border-slate-200 bg-white"
    />
  );
}
