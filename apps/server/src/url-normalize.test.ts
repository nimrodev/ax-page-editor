import { describe, expect, it } from "@jest/globals";
import { normalizeUrl } from "./url-normalize";

describe("normalizeUrl", () => {
  const cases: Array<[label: string, input: string, expected: string]> = [
    ["leaves an already-clean URL untouched", "https://example.com/pricing", "https://example.com/pricing"],
    ["drops a trailing slash on a non-root path", "https://example.com/pricing/", "https://example.com/pricing"],
    ["keeps the root path as a bare slash", "https://example.com/", "https://example.com/"],
    ["drops a fragment", "https://example.com/pricing#plans", "https://example.com/pricing"],
    ["lowercases the scheme and host, but not the path", "HTTPS://Example.COM/Pricing", "https://example.com/Pricing"],
    ["drops a utm_ tracking parameter", "https://example.com/pricing?utm_source=newsletter", "https://example.com/pricing"],
    ["drops fbclid specifically", "https://example.com/pricing?fbclid=abc123", "https://example.com/pricing"],
    [
      "keeps a non-tracking parameter that could denote a different page",
      "https://example.com/pricing?plan=enterprise",
      "https://example.com/pricing?plan=enterprise",
    ],
    [
      "keeps the meaningful parameter and drops only the tracking one",
      "https://example.com/pricing?plan=enterprise&utm_medium=email",
      "https://example.com/pricing?plan=enterprise",
    ],
    [
      "sorts remaining parameters so order doesn't create a second identity",
      "https://example.com/search?b=2&a=1",
      "https://example.com/search?a=1&b=2",
    ],
    [
      "collapses every cosmetic difference onto the same identity at once",
      "HTTPS://Example.com/pricing/?utm_source=x&plan=pro#section",
      "https://example.com/pricing?plan=pro",
    ],
  ];

  it.each(cases)("%s", (_label, input, expected) => {
    expect(normalizeUrl(input).normalized).toBe(expected);
  });

  it("retains the exact original input for display, unmodified", () => {
    const input = "HTTPS://Example.COM/Pricing/?utm_source=x#top";
    expect(normalizeUrl(input).original).toBe(input);
  });

  it("treats a different value for a meaningful parameter as a different page", () => {
    const a = normalizeUrl("https://example.com/pricing?plan=starter").normalized;
    const b = normalizeUrl("https://example.com/pricing?plan=enterprise").normalized;
    expect(a).not.toBe(b);
  });
});
