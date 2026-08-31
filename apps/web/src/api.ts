import { RenderFailureReason } from "@ax/schema";

export interface MarkdownBlock {
  axId: string;
  markdown: string;
}

export interface AgentPayload {
  markdownBlocks: MarkdownBlock[];
  html: string;
}

export type ClientRenderFailureReason = RenderFailureReason | "unknown";

export class RenderFailure extends Error {
  constructor(public readonly reason: ClientRenderFailureReason) {
    super(`Render failed: ${reason}`);
  }
}

export async function renderPage(url: string): Promise<AgentPayload> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const reason = (body?.reason ?? "unknown") as ClientRenderFailureReason;
    throw new RenderFailure(reason);
  }

  return res.json();
}
