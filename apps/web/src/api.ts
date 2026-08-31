import { RenderFailureReason } from "@ax/schema";

export interface MarkdownBlock {
  axId: string;
  markdown: string;
}

export interface AgentPayload {
  markdownBlocks: MarkdownBlock[];
  html: string;
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

export function renderPage(url: string): Promise<AgentPayload> {
  return post("/api/render", { url });
}

export function fetchHumanView(url: string): Promise<HumanViewPayload> {
  return post("/api/page", { url });
}
