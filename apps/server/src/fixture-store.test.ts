import { describe, expect, it } from "@jest/globals";
import { FixtureStore } from "./fixture-store";

const LLM_URL = "https://en.wikipedia.org/wiki/Large_language_model";

describe("FixtureStore", () => {
  it("returns the committed fixture content for a known demo URL", () => {
    const store = new FixtureStore();
    const html = store.get("https://en.wikipedia.org/wiki/Large_language_model");

    expect(html).toBeDefined();
    expect(html).toContain("<html");
    expect(html!.length).toBeGreaterThan(1000);
  });

  it("has all three verified demo pages", () => {
    const store = new FixtureStore();
    expect(store.get("https://en.wikipedia.org/wiki/Large_language_model")).toBeDefined();
    expect(store.get("https://www.bbc.com/news")).toBeDefined();
    expect(store.get("https://stripe.com/pricing")).toBeDefined();
  });

  it("returns undefined for a URL with no committed fixture", () => {
    const store = new FixtureStore();
    expect(store.get("https://example.com/nowhere")).toBeUndefined();
  });
});

// NIM-54's demo tool: a dev-only control mutates a fixture in place, in
// memory, so the resolution engine's drift/re-anchor/stale tiers can be
// demonstrated against a page that visibly changed, without touching the
// committed snapshot on disk or the real network.
describe("FixtureStore.mutate", () => {
  it("persists a mutation for subsequent get() calls on the same store", () => {
    const store = new FixtureStore();

    const mutated = store.mutate(LLM_URL, (document) => {
      document.querySelector("h1")!.textContent = "Mutated title";
    });

    expect(mutated).toContain("Mutated title");
    expect(store.get(LLM_URL)).toBe(mutated);
  });

  it("throws for a URL with no committed fixture to mutate", () => {
    const store = new FixtureStore();
    expect(() => store.mutate("https://example.com/nowhere", () => {})).toThrow();
  });

  it("reset() discards a mutation, reverting to the committed fixture", () => {
    const store = new FixtureStore();
    const original = store.get(LLM_URL);

    store.mutate(LLM_URL, (document) => {
      document.querySelector("h1")!.textContent = "Mutated title";
    });
    store.reset(LLM_URL);

    expect(store.get(LLM_URL)).toBe(original);
  });
});
