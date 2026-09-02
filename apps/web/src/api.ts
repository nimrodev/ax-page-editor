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
  // is "unresolved"). Lets a caller explain what happened in its own
  // words rather than just showing status (NIM-54's dev-mutation panel).
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

// Mirrors DevMutation in apps/server/src/dev-mutation.ts — this is
// dev-only demo tooling (NIM-54), not part of the product's own data
// model, so it isn't worth a shared @ax/schema entry the way Modification
// and Locator are.
export type DevMutation =
  | { type: "move"; selector: string; toParentSelector: string; toIndex?: number }
  | { type: "edit"; selector: string; text: string }
  | { type: "insert"; parentSelector: string; html: string; atIndex?: number }
  | { type: "delete"; selector: string };

/**
 * Whether this server instance is running against the fixture-backed demo
 * pages (AX_USE_FIXTURES) — the dev mutation control only works there, so
 * the app checks this once rather than offering a control that 403s the
 * moment it's used against the real network. Fails closed (false) on any
 * error, same reasoning as loadConfiguration above: a broken check should
 * hide a dev tool, not break the page.
 */
export async function fetchDevToolsEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/dev/enabled");
    if (!res.ok) return false;
    const body: { enabled: boolean } = await res.json();
    return body.enabled;
  } catch {
    return false;
  }
}

/**
 * Not routed through post() above: that helper's error shape (RenderFailure
 * + a `reason` enum) is specific to page-render failures, and a dev
 * mutation's own error — "No fixture for <url>" from FixtureStore.mutate,
 * say — is exactly the text the publisher needs to see, not one of that
 * enum's members. Throws the server's own message on failure so a caller
 * can show it directly, rather than silently swallowing why nothing
 * happened (the bug this was written to fix).
 */
async function postDevAction(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => null);
    throw new Error(responseBody?.message ?? `Request failed (${res.status})`);
  }
}

export function devMutate(url: string, mutations: DevMutation[]): Promise<void> {
  return postDevAction("/api/dev/mutate", { url, mutations });
}

export function devReset(url: string): Promise<void> {
  return postDevAction("/api/dev/reset", { url });
}
