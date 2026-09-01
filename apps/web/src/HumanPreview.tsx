import { useEffect, useRef, useState } from "react";
import { Locator } from "@ax/schema";
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
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; html: string };

/**
 * Renders the page as it actually looks, in a sandboxed iframe, and turns
 * clicks on its elements into selection events for the parent. allow-scripts
 * is needed only so the overlay script below can run — the fetched page's
 * own scripts were already stripped by sanitizeDocument (ADR-0005).
 */
export function HumanPreview({ url, onSelect, revealRequest }: HumanPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSelect]);

  // The review list (NIM-55) asking to reveal a modification whose
  // element lives inside the sandboxed iframe — this frame has no DOM
  // access into it, so the request crosses via postMessage the same way
  // a click's selection crosses back out.
  useEffect(() => {
    if (!revealRequest) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "ax:reveal", locator: revealRequest.locator }, "*");
  }, [revealRequest]);

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
