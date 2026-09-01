import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { AgentPayload } from "./api";
import { buildNavigatorEntries } from "./ModificationNavigator";

function locator(textHint: string) {
  return { path: "p", fingerprint: "x", textHint };
}

function payloadWith(overrides: Partial<AgentPayload>): AgentPayload {
  return { markdownBlocks: [], html: "", modificationStatuses: [], ...overrides };
}

describe("buildNavigatorEntries", () => {
  it("joins an applied context modification to the block it produced, via modificationId", () => {
    const modifications: Modification[] = [
      { id: "mod-1", type: "context", target: locator("Target"), value: { text: "An explanation" } },
    ];
    const payload = payloadWith({
      modificationStatuses: [{ id: "mod-1", status: "applied" }],
      markdownBlocks: [{ axId: "ax-1-context", markdown: "An explanation", source: "context", modificationId: "mod-1" }],
    });

    const entries = buildNavigatorEntries(modifications, payload);

    expect(entries).toEqual([
      { modificationId: "mod-1", type: "context", status: "applied", label: "An explanation", axId: "ax-1-context" },
    ]);
  });

  it("gives a hide modification a label from its target's textHint and no axId, since it produced no block", () => {
    const modifications: Modification[] = [{ id: "mod-2", type: "hide", target: locator("Newsletter banner") }];
    const payload = payloadWith({ modificationStatuses: [{ id: "mod-2", status: "applied" }] });

    const entries = buildNavigatorEntries(modifications, payload);

    expect(entries).toEqual([
      { modificationId: "mod-2", type: "hide", status: "applied", label: "Newsletter banner", axId: undefined },
    ]);
  });

  it("defaults a modification the last render never reported on to 'unresolved' rather than dropping it", () => {
    const modifications: Modification[] = [{ id: "mod-3", type: "hide", target: locator("Recently added") }];
    const payload = payloadWith({ modificationStatuses: [] });

    const entries = buildNavigatorEntries(modifications, payload);

    expect(entries[0].status).toBe("unresolved");
  });

  it("carries no axId for a shadowed modification, since it never produced a block", () => {
    const modifications: Modification[] = [
      { id: "mod-4", type: "context", target: locator("Inside a hidden section"), value: { text: "note" } },
    ];
    const payload = payloadWith({ modificationStatuses: [{ id: "mod-4", status: "shadowed" }] });

    const entries = buildNavigatorEntries(modifications, payload);

    expect(entries).toEqual([
      { modificationId: "mod-4", type: "context", status: "shadowed", label: "note", axId: undefined },
    ]);
  });

  it("truncates a long label rather than overflowing the row", () => {
    const longText = "x".repeat(120);
    const modifications: Modification[] = [
      { id: "mod-5", type: "context", target: locator("t"), value: { text: longText } },
    ];
    const payload = payloadWith({ modificationStatuses: [{ id: "mod-5", status: "applied" }] });

    const entries = buildNavigatorEntries(modifications, payload);

    expect(entries[0].label.length).toBeLessThan(longText.length);
    expect(entries[0].label.endsWith("…")).toBe(true);
  });
});
