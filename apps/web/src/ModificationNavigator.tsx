import { Modification } from "@ax/schema";
import { AgentPayload } from "./api";

export type NavigatorStatus = "applied" | "shadowed" | "unresolved";

export interface NavigatorEntry {
  modificationId: string;
  type: Modification["type"];
  status: NavigatorStatus;
  label: string;
  // Present only for an applied context/forwardLink — the block it
  // produced, and so the thing a click can actually scroll to. A hide has
  // nothing to scroll to by definition; a shadowed or unresolved
  // modification produced no block this render.
  axId?: string;
}

export const LABEL_LIMIT = 60;

export function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function labelFor(modification: Modification): string {
  switch (modification.type) {
    case "hide":
      return modification.target.textHint || "This element";
    case "context":
      return modification.value.text;
    case "forwardLink":
      return modification.value.href;
  }
}

/**
 * Joins the client's own modification list with what the last render
 * reported — status from modificationStatuses, and (for an applied
 * context/forwardLink) the block it produced, matched by the
 * modificationId the server tags onto that block's element. A
 * modification the last render doesn't know about yet defaults to
 * "unresolved" rather than silently disappearing from the list.
 */
export function buildNavigatorEntries(modifications: Modification[], payload: AgentPayload): NavigatorEntry[] {
  const statusById = new Map(payload.modificationStatuses.map((s) => [s.id, s.status]));
  const axIdByModificationId = new Map(
    payload.markdownBlocks.filter((b) => b.modificationId).map((b) => [b.modificationId as string, b.axId]),
  );

  return modifications.map((modification) => ({
    modificationId: modification.id,
    type: modification.type,
    status: statusById.get(modification.id) ?? "unresolved",
    label: truncate(labelFor(modification), LABEL_LIMIT),
    axId: axIdByModificationId.get(modification.id),
  }));
}

export const TYPE_META: Record<
  Modification["type"],
  { icon: string; iconClass: string; borderClass: string; typeLabel: string }
> = {
  context: { icon: "◧", iconClass: "bg-blue-100 text-blue-700", borderClass: "border-blue-300", typeLabel: "Context" },
  forwardLink: {
    icon: "⇥",
    iconClass: "bg-indigo-100 text-indigo-700",
    borderClass: "border-indigo-300",
    typeLabel: "Forwarded link",
  },
  hide: { icon: "⦰", iconClass: "bg-slate-200 text-slate-600", borderClass: "border-transparent", typeLabel: "Hidden" },
};

interface RowProps {
  entry: NavigatorEntry;
  active: boolean;
  onSelect: (entry: NavigatorEntry) => void;
}

function NavigatorRow({ entry, active, onSelect }: RowProps) {
  const meta = TYPE_META[entry.type];
  const shadowed = entry.status === "shadowed";
  const unresolved = entry.status === "unresolved";
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={`flex w-full items-start gap-2 rounded border-l-[3px] px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${meta.borderClass} ${shadowed ? "opacity-50" : ""} ${active ? "bg-slate-100" : ""}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded text-[11px] ${meta.iconClass}`}>
        {meta.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${shadowed ? "text-slate-400 line-through decoration-slate-400" : "text-slate-700"}`}>
          {entry.label}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">{meta.typeLabel}</span>
      </span>
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
    </button>
  );
}

export interface ModificationNavigatorProps {
  entries: NavigatorEntry[];
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  activeId: string | null;
  onSelect: (entry: NavigatorEntry) => void;
  jumpIndex: number;
  jumpCount: number;
  onJumpDelta: (delta: number) => void;
  // True right after switching tabs or views landed you somewhere new,
  // with a change you were looking at now off-screen. Rather than
  // re-scrolling for you unasked, the pill offers to take you back —
  // onResume only fires on a deliberate click.
  suggestResume: boolean;
  onResume: () => void;
}

/**
 * One control, two states, never both at once (NIM-64): a low-chrome pill
 * for scanning while reading, expanding on demand into the full review
 * list — the only place a `hide` modification is represented at all,
 * since it removes content and leaves nothing in the payload to scroll to.
 */
export function ModificationNavigator({
  entries,
  expanded,
  onToggleExpanded,
  activeId,
  onSelect,
  jumpIndex,
  jumpCount,
  onJumpDelta,
  suggestResume,
  onResume,
}: ModificationNavigatorProps) {
  if (entries.length === 0) return null;

  const hideEntries = entries.filter((e) => e.type === "hide");
  const otherEntries = entries.filter((e) => e.type !== "hide");
  const unresolvedCount = entries.filter((e) => e.status === "unresolved").length;
  const contextCount = entries.filter((e) => e.type === "context").length;
  const forwardCount = entries.filter((e) => e.type === "forwardLink").length;

  if (!expanded) {
    return (
      <div
        className={`flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm shadow-lg ${suggestResume ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"}`}
      >
        {jumpCount > 0 ? (
          <>
            <button
              onClick={() => onJumpDelta(-1)}
              aria-label="Previous change"
              className="rounded px-1.5 text-slate-600 hover:bg-slate-100"
            >
              ‹
            </button>
            {suggestResume ? (
              <button
                onClick={onResume}
                className="font-medium text-blue-600 hover:underline"
              >
                Resume at {jumpIndex + 1} of {jumpCount}
              </button>
            ) : (
              <span className="tabular-nums text-slate-600">
                {jumpIndex + 1} of {jumpCount} {jumpCount === 1 ? "change" : "changes"}
                {/* Hides never appear here — there's nothing to scroll to —
                    but staying silent about them would make this pill look
                    like the full count when it's only the jumpable part. */}
                {hideEntries.length > 0 && ` · ${hideEntries.length} hidden`}
              </span>
            )}
            <button
              onClick={() => onJumpDelta(1)}
              aria-label="Next change"
              className="rounded px-1.5 text-slate-600 hover:bg-slate-100"
            >
              ›
            </button>
          </>
        ) : (
          <span className="text-slate-600">
            {entries.length} {entries.length === 1 ? "modification" : "modifications"}
          </span>
        )}
        <button
          onClick={() => onToggleExpanded(true)}
          aria-label="Show all modifications"
          className="rounded px-1 text-slate-500 hover:bg-slate-100"
        >
          ▲
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-h-[50vh] w-80 flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{entries.length}</span> modifications — {contextCount}{" "}
          context, {forwardCount} forwarded, {hideEntries.length} hidden
          {unresolvedCount > 0 && <span className="text-amber-600"> · {unresolvedCount} unresolved</span>}
        </p>
        <button
          onClick={() => onToggleExpanded(false)}
          aria-label="Collapse"
          className="rounded px-1 text-slate-500 hover:bg-slate-100"
        >
          ▾
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {otherEntries.map((entry) => (
          <NavigatorRow
            key={entry.modificationId}
            entry={entry}
            active={entry.modificationId === activeId}
            onSelect={onSelect}
          />
        ))}
        {hideEntries.length > 0 && (
          <>
            <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Hidden ({hideEntries.length})
            </p>
            {hideEntries.map((entry) => (
              <NavigatorRow
                key={entry.modificationId}
                entry={entry}
                active={entry.modificationId === activeId}
                onSelect={onSelect}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
