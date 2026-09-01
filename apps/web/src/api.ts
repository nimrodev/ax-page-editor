import { RenderFailureReason, Modification } from "@ax/schema";

export interface MarkdownBlock {
  axId: string;
  markdown: string;
  source: "page" | "context" | "forwarded";
  modificationId?: string;
}

export interface ModificationStatus {
  id: string;
  status: "applied" | "shadowed" | "unresolved";
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
