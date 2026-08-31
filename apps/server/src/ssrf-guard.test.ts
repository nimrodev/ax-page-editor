import { describe, expect, it } from "@jest/globals";
import { isBlockedAddress, SsrfGuard, SsrfBlockedError } from "./ssrf-guard";

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.5.5.5", "loopback range"],
    ["10.0.0.5", "private 10/8"],
    ["172.16.0.1", "private 172.16/12"],
    ["172.31.255.255", "private 172.16/12 upper bound"],
    ["192.168.1.1", "private 192.168/16"],
    ["169.254.169.254", "cloud metadata address"],
    ["169.254.0.1", "link-local"],
    ["0.0.0.0", "unspecified"],
    ["::1", "ipv6 loopback"],
    ["fe80::1", "ipv6 link-local"],
    ["fc00::1", "ipv6 unique local"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ["93.184.216.34", "public ipv4"],
    ["172.15.255.255", "just below the private range"],
    ["172.32.0.0", "just above the private range"],
    ["2606:2800:220:1:248:1893:25c8:1946", "public ipv6"],
  ])("allows %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it.each([
    ["100.64.0.1", "CGNAT range 100.64/10"],
    ["100.100.0.1", "CGNAT range, mid"],
    ["100.127.255.255", "CGNAT range upper bound"],
    ["::ffff:169.254.169.254", "IPv4-mapped IPv6 cloud metadata"],
    ["::ffff:10.0.0.5", "IPv4-mapped IPv6 private range"],
    ["::ffff:127.0.0.1", "IPv4-mapped IPv6 loopback"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ["100.63.255.255", "just below the CGNAT range"],
    ["100.128.0.0", "just above the CGNAT range"],
    ["::ffff:93.184.216.34", "IPv4-mapped IPv6 public address"],
  ])("allows %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("SsrfGuard.assertSafeUrl", () => {
  const guard = new SsrfGuard({
    resolveHost: async (host: string) => {
      const table: Record<string, string[]> = {
        "public.example.com": ["93.184.216.34"],
        "internal.example.com": ["10.0.0.5"],
        "metadata.example.com": ["169.254.169.254"],
      };
      return table[host] ?? [];
    },
  });

  it("rejects a non-http(s) scheme", async () => {
    await expect(guard.assertSafeUrl("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects a URL whose host resolves to a private address", async () => {
    await expect(guard.assertSafeUrl("http://internal.example.com/")).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects a URL whose host resolves to a cloud metadata address", async () => {
    await expect(guard.assertSafeUrl("http://metadata.example.com/")).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("allows a URL whose host resolves to a public address", async () => {
    await expect(guard.assertSafeUrl("https://public.example.com/")).resolves.toBeUndefined();
  });

  it("rejects a host with no DNS records", async () => {
    await expect(guard.assertSafeUrl("https://nowhere.example.com/")).rejects.toThrow(
      SsrfBlockedError,
    );
  });
});
