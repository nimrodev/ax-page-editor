import { Modification } from "@ax/schema";
import { ModificationStatus } from "./api";
import { labelFor, LABEL_LIMIT, TYPE_META, truncate } from "./ModificationNavigator";

export interface ReviewEntry {
  modification: Modification;
  status: ModificationStatus["status"];
  // Present only for a drifted, still-applied context note (NIM-54,
  // CONTEXT.md — Needs review) — editorial state for this list alone,
  // never present in the agent payload. Absent, not false, otherwise.
  needsReview?: boolean;
  label: string;
}

/**
 * Every modification on the page, independent of the Inspector's current
 * selection (NIM-55) — a status not yet reported by the last render
 * defaults to "unresolved" rather than the entry disappearing, matching
 * buildNavigatorEntries's own rule for the same case in the agent view.
 */
export function buildReviewEntries(modifications: Modification[], statuses: ModificationStatus[]): ReviewEntry[] {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  return modifications.map((modification) => {
    const reported = statusById.get(modification.id);
    return {
      modification,
      status: reported?.status ?? "unresolved",
      ...(reported?.needsReview ? { needsReview: true } : {}),
      label: truncate(labelFor(modification), LABEL_LIMIT),
    };
  });
}

interface ReviewPanelProps {
  entries: ReviewEntry[];
  onReveal: (modification: Modification) => void;
  onRemove: (modificationId: string) => void;
}

/**
 * The one place a publisher sees every modification on the page at once
 * (NIM-55) — the Inspector only ever shows what touches the currently
 * selected element. Reuses the agent view navigator's type icons and
 * label logic so a "context note" reads the same way in both places.
 */
export function ReviewPanel({ entries, onReveal, onRemove }: ReviewPanelProps) {
  return (
    <div className="w-96 shrink-0 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Modifications ({entries.length})</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No modifications on this page yet.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {entries.map((entry) => {
            const meta = TYPE_META[entry.modification.type];
            const shadowed = entry.status === "shadowed";
            const unresolved = entry.status === "unresolved";
            return (
              <li
                key={entry.modification.id}
                className={`flex items-start gap-2 rounded border-l-[3px] px-2 py-1.5 text-sm ${meta.borderClass} ${shadowed ? "opacity-50" : ""} ${unresolved ? "bg-amber-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onReveal(entry.modification)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded text-[11px] ${meta.iconClass}`}
                  >
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate ${shadowed ? "text-slate-400 line-through decoration-slate-400" : "text-slate-700"}`}
                    >
                      {entry.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{meta.typeLabel}</span>
                  </span>
                </button>
                {unresolved && (
                  <span className="mt-0.5 flex-none rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Unresolved
                  </span>
                )}
                {shadowed && (
                  <span className="mt-0.5 flex-none rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Shadowed
                  </span>
                )}
                {entry.needsReview && (
                  <span className="mt-0.5 flex-none rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                    Needs review
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(entry.modification.id)}
                  aria-label={`Remove ${meta.typeLabel.toLowerCase()} modification`}
                  className="mt-0.5 flex-none text-slate-400 hover:text-slate-700"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
