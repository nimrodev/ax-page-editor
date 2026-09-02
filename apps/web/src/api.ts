import { RenderFailureReason, Modification, Configuration } from "@ax/schema";

export type { Configuration };

export interface MarkdownBlock {
  axId: string;
  markdown: string;
  source: "page" | "context" | "forwarded";
  modificationId?: string;
}

export interface ModificationStatus {
  id: string;
  status: "applied" | "shadowed" | "unresolved";
  // Which of ADR-0003's four graded tiers resolved this modification —
  // "exact" | "drift" | "reanchor" | "stale" (always "stale" when status
  // is "unresolved").
  tier: "exact" | "drift" | "reanchor" | "stale";
  // True only for an "applied" context note whose target has drifted
  // (CONTEXT.md — Needs review) — editorial state for the publisher's
  // own review list, never present in the agent payload itself (NIM-54).
  needsReview?: boolean;
}

export interface AgentPayload {
  markdownBlocks: MarkdownBlock[];
  html: string;
  modificationStatuses: ModificationStatus[];
}

export interface HumanViewPayload {
  html: string;
}

export type ClientRenderFailureReason = RenderFailureReason | "unknown";

export class RenderFailure extends Error {
  constructor(public readonly reason: ClientRenderFailureReason) {
    super(`Render failed: ${reason}`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.json().catch(() => null);
    const reason = (responseBody?.reason ?? "unknown") as ClientRenderFailureReason;
    throw new RenderFailure(reason);
  }

  return res.json();
}

export function renderPage(url: string, modifications: Modification[] = []): Promise<AgentPayload> {
  return post("/api/render", { url, modifications });
}

export function fetchHumanView(url: string): Promise<HumanViewPayload> {
  return post("/api/page", { url });
}

export function saveConfiguration(url: string, modifications: Modification[]): Promise<Configuration> {
  return post("/api/configuration", { url, modifications });
}

/**
 * Null both when nothing was ever saved for this page and when the
 * request itself fails — restoring a saved configuration is a courtesy,
 * not something a network blip should turn into a page-load error.
 */
export async function loadConfiguration(url: string): Promise<Configuration | null> {
  try {
    const res = await fetch(`/api/configuration?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const body: { configuration: Configuration | null } = await res.json();
    return body.configuration;
  } catch {
    return null;
  }
}
