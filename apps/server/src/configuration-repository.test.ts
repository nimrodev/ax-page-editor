import { describe, expect, it } from "@jest/globals";
import { Configuration } from "@ax/schema";
import { SqliteConfigurationRepository } from "./configuration-repository";

function configurationFor(url: string, overrides: Partial<Configuration> = {}): Configuration {
  return {
    version: 1,
    url,
    originalUrl: url,
    updatedAt: "2026-01-01T00:00:00.000Z",
    modifications: [],
    ...overrides,
  };
}

describe("SqliteConfigurationRepository", () => {
  it("returns null for a URL that was never saved", () => {
    const repo = new SqliteConfigurationRepository(":memory:");
    expect(repo.get("https://example.com/pricing")).toBeNull();
  });

  it("returns exactly what was saved, round-tripped through storage", () => {
    const repo = new SqliteConfigurationRepository(":memory:");
    const configuration = configurationFor("https://example.com/pricing", {
      modifications: [{ id: "m1", type: "hide", target: { path: "p", fingerprint: "x", textHint: "y" } }],
    });

    repo.save(configuration);

    expect(repo.get("https://example.com/pricing")).toEqual(configuration);
  });

  it("overwrites the prior document for the same normalized URL rather than duplicating it", () => {
    const repo = new SqliteConfigurationRepository(":memory:");
    repo.save(configurationFor("https://example.com/pricing", { updatedAt: "2026-01-01T00:00:00.000Z" }));
    repo.save(configurationFor("https://example.com/pricing", { updatedAt: "2026-01-02T00:00:00.000Z" }));

    expect(repo.get("https://example.com/pricing")?.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("keeps configurations for different URLs independent", () => {
    const repo = new SqliteConfigurationRepository(":memory:");
    repo.save(configurationFor("https://example.com/pricing"));
    repo.save(configurationFor("https://example.com/about"));

    expect(repo.get("https://example.com/pricing")?.url).toBe("https://example.com/pricing");
    expect(repo.get("https://example.com/about")?.url).toBe("https://example.com/about");
  });

  it("persists across repository instances backed by the same file", () => {
    const path = `/tmp/ax-configuration-repository-test-${Date.now()}.sqlite`;
    const first = new SqliteConfigurationRepository(path);
    first.save(configurationFor("https://example.com/pricing"));

    const second = new SqliteConfigurationRepository(path);
    expect(second.get("https://example.com/pricing")?.url).toBe("https://example.com/pricing");
  });
});
