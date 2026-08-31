import * as dns from "node:dns/promises";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/**
 * True if the address is loopback, private, link-local, cloud metadata, or
 * otherwise unroutable — the ranges a server-side fetcher must never reach.
 * IPv4 ranges per RFC 1918 / RFC 5735; IPv6 per RFC 4193 / RFC 4291.
 */
function isBlockedV4(a: number, b: number): boolean {
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 192 && b === 168) return true; // private 192.168/16
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 0) return true; // unspecified / "this network"
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    return isBlockedV4(Number(v4[1]), Number(v4[2]));
  }

  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) carries a real IPv4 address the
  // ranges above must still apply to — otherwise it's a free bypass.
  const mapped = lower.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mapped) {
    return isBlockedV4(Number(mapped[1]), Number(mapped[2]));
  }

  if (lower === "::1") return true; // loopback
  if (lower === "::") return true; // unspecified
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (/^f[cd]/.test(lower)) return true; // unique local fc00::/7

  return false;
}

export interface SsrfGuardDeps {
  resolveHost: (host: string) => Promise<string[]>;
}

const defaultDeps: SsrfGuardDeps = {
  resolveHost: async (host: string) => {
    const records = await dns.lookup(host, { all: true });
    return records.map((r) => r.address);
  },
};

export class SsrfGuard {
  private readonly resolveHost: SsrfGuardDeps["resolveHost"];

  constructor(deps: Partial<SsrfGuardDeps> = {}) {
    this.resolveHost = deps.resolveHost ?? defaultDeps.resolveHost;
  }

  async assertSafeUrl(rawUrl: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new SsrfBlockedError(`"${rawUrl}" is not a valid URL.`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new SsrfBlockedError(`Scheme "${url.protocol}" is not allowed.`);
    }

    const addresses = await this.resolveHost(url.hostname);
    if (addresses.length === 0) {
      throw new SsrfBlockedError(`"${url.hostname}" did not resolve to any address.`);
    }

    for (const address of addresses) {
      if (isBlockedAddress(address)) {
        throw new SsrfBlockedError(`"${url.hostname}" resolves to a blocked address.`);
      }
    }
  }
}
