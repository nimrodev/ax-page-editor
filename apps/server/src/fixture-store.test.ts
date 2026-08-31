import { describe, expect, it } from "@jest/globals";
import { FixtureStore } from "./fixture-store";

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
