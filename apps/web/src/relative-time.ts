/**
 * Renders an ISO timestamp as a publisher-facing relative phrase — "just
 * now", "5 minutes ago" — rather than a raw timestamp, since the exact
 * second a configuration was saved is never the thing a publisher is
 * asking when they see "loaded your saved changes" (NIM-53).
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));

  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;

  return then.toLocaleDateString();
}
