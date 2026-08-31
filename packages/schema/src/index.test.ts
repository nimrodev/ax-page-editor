import { describe, expect, it } from "vitest";
import { ConfigurationSchema, RenderFailureReasonSchema } from "./index";

describe("ConfigurationSchema", () => {
  it("round-trips a configuration with all three modification types", () => {
    const input = {
      version: 1,
      url: "https://example.com/pricing",
      updatedAt: "2026-08-31T00:00:00.000Z",
      modifications: [
        {
          id: "m_01",
          type: "hide",
          target: {
            path: "main>nav",
            fingerprint: "abc123",
            textHint: "Main navigation",
          },
        },
        {
          id: "m_02",
          type: "context",
          target: {
            path: "main>section:nth-of-type(2)",
            fingerprint: "def456",
            textHint: "Enterprise tier",
          },
          value: { text: "Contact sales for enterprise pricing." },
        },
        {
          id: "m_03",
          type: "forwardLink",
          target: {
            path: "main>a:nth-of-type(1)",
            fingerprint: "ghi789",
            textHint: "Learn more",
          },
          value: { href: "https://example.com/details", maxChars: 4000 },
        },
      ],
    };

    const result = ConfigurationSchema.parse(input);

    expect(result.modifications).toHaveLength(3);
    expect(result.modifications[0].type).toBe("hide");
    expect(result.modifications[1].type).toBe("context");
    expect(result.modifications[2].type).toBe("forwardLink");
  });

  it("rejects a modification type outside the three defined", () => {
    const input = {
      version: 1,
      url: "https://example.com",
      updatedAt: "2026-08-31T00:00:00.000Z",
      modifications: [
        {
          id: "m_01",
          type: "delete",
          target: { path: "main", fingerprint: "x", textHint: "x" },
        },
      ],
    };

    expect(() => ConfigurationSchema.parse(input)).toThrow();
  });

  it("requires a locator with path, fingerprint and textHint", () => {
    const input = {
      version: 1,
      url: "https://example.com",
      updatedAt: "2026-08-31T00:00:00.000Z",
      modifications: [
        { id: "m_01", type: "hide", target: { path: "main" } },
      ],
    };

    expect(() => ConfigurationSchema.parse(input)).toThrow();
  });
});

describe("RenderFailureReasonSchema", () => {
  it("accepts every known failure reason", () => {
    const reasons = [
      "blocked-for-security",
      "blocked-by-site",
      "timeout",
      "unsupported-content-type",
      "too-large",
      "too-many-redirects",
      "network",
      "budget-exceeded",
    ];
    for (const reason of reasons) {
      expect(RenderFailureReasonSchema.parse(reason)).toBe(reason);
    }
  });

  it("rejects an unknown reason", () => {
    expect(() => RenderFailureReasonSchema.parse("made-up-reason")).toThrow();
  });
});
