import { ClientRenderFailureReason } from "./api";

/**
 * Publisher-facing copy for each failure reason — never a status code, never
 * a stack trace. UI copy lives here rather than server-side, since wording
 * is a product decision, not a transport-layer one.
 */
export function failureMessage(reason: ClientRenderFailureReason): string {
  switch (reason) {
    case "blocked-for-security":
      return "This page couldn't be loaded because it points at an address we block for security. If you believe this is a mistake, check the AX_USER_AGENT configuration.";
    case "blocked-by-site":
      return "The site blocked this request. Some sites reject unfamiliar visitors — try setting a different user agent in your configuration.";
    case "timeout":
      return "The site took too long to respond. It may be slow or temporarily unreachable — try again in a moment.";
    case "unsupported-content-type":
      return "This page isn't a webpage we can read — it may be a PDF, an image, or another file type.";
    case "too-large":
      return "This page is larger than we can safely process.";
    case "too-many-redirects":
      return "This page redirected too many times to follow safely.";
    case "budget-exceeded":
      return "Too many requests were needed to load this page.";
    case "network":
    case "unknown":
    default:
      return "Something went wrong loading this page. Check the URL and try again.";
  }
}
