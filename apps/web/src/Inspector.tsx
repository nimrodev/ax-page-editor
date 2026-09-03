import { ReactNode, useEffect, useRef, useState } from "react";
import { Modification } from "@ax/schema";
import { Selection } from "./HumanPreview";
import { ModificationStatus } from "./api";

interface InspectorProps {
  // Always the full current selection (NIM-56) — empty, one, or several.
  selections: Selection[];
  modifications: Modification[];
  modificationStatuses: ModificationStatus[];
  onHide: (targets: Selection[]) => void;
  onRemove: (modificationId: string) => void;
  onSetContext: (targets: Selection[], text: string) => void;
  onForwardLink: (targets: Selection[]) => void;
  // A new (truthy) value focuses the context textarea (NIM-66) — set once
  // a Markdown block's "Add context" popover action has located its
  // element and the resulting Selection has arrived, so the publisher
  // lands with the cursor ready rather than having to find and click the
  // textarea themselves after already telling the app they want to type.
  focusContextRequest?: number;
}

/**
 * A modification retained in the configuration but currently covered by
 * a hidden ancestor (NIM-52) is a different situation from one whose
 * locator failed to resolve at all — this is the one place in the UI
 * that distinction needs to be visible.
 */
function isShadowed(modificationStatuses: ModificationStatus[], id: string | undefined): boolean {
  if (!id) return false;
  return modificationStatuses.find((s) => s.id === id)?.status === "shadowed";
}

// Same three colors as MODIFICATION_MARK_COLORS/TYPE_META (hide: slate,
// context: blue, forwardLink: green) — an active toggle here should read
// as the same "thing" as its dashed mark in the preview and its row in
// the review list, not introduce a fourth palette of its own.
type Accent = "slate" | "blue" | "green";

const ACCENT: Record<Accent, { border: string; bg: string; text: string; iconBg: string; iconText: string }> = {
  slate: {
    border: "border-slate-300",
    bg: "bg-slate-100",
    text: "text-slate-800",
    iconBg: "bg-slate-200",
    iconText: "text-slate-600",
  },
  blue: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-900",
    iconBg: "bg-blue-100",
    iconText: "text-blue-700",
  },
  green: {
    border: "border-green-200",
    bg: "bg-green-50",
    text: "text-green-900",
    iconBg: "bg-green-100",
    iconText: "text-green-700",
  },
};

/**
 * One row of a shared "actions" card (see ActionGroup) — reads as a
 * toggle rather than two unrelated pieces of UI (previously: a plain
 * button when off, a whole different bordered box floating elsewhere
 * when on). Off is neutral; on gets the modification type's own accent
 * as a left bar and a tinted background, the same left-bar language
 * ReviewPanel and the navigator already use for a row's type.
 */
function ActionToggle({
  accent,
  icon,
  label,
  activeLabel,
  note,
  active,
  onActivate,
  onRemove,
}: {
  accent: Accent;
  icon: string;
  label: string;
  activeLabel: string;
  note?: string;
  active: boolean;
  onActivate: () => void;
  onRemove: () => void;
}) {
  if (!active) {
    return (
      <button
        onClick={onActivate}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
          {icon}
        </span>
        {label}
      </button>
    );
  }

  const c = ACCENT[accent];
  return (
    <div className={`flex items-start gap-2.5 border-l-[3px] ${c.border} ${c.bg} px-3 py-2.5`}>
      <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-lg ${c.iconBg} ${c.iconText} text-sm`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${c.text}`}>{activeLabel}</p>
        {note && <p className={`mt-0.5 text-xs ${c.text} opacity-75`}>{note}</p>}
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove"
        title="Remove"
        className={`flex-none rounded-md p-1 leading-none ${c.text} opacity-50 transition hover:bg-white/60 hover:opacity-100`}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Groups Hide and Forward into one visibly connected card — a divider
 * between rows, not a gap between two floating boxes — so the two whole-
 * element actions read as a pair on sight, the exact thing the previous
 * layout (Context sandwiched between them) failed to do.
 */
function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{children}</div>;
}

/** The single-element detailed view — unchanged from before multi-select existed, just fed selections[0]. */
function SingleInspector({
  selection,
  modifications,
  modificationStatuses,
  onHide,
  onRemove,
  onSetContext,
  onForwardLink,
  focusContextRequest,
}: {
  selection: Selection;
  modifications: Modification[];
  modificationStatuses: ModificationStatus[];
  onHide: (targets: Selection[]) => void;
  onRemove: (modificationId: string) => void;
  onSetContext: (targets: Selection[], text: string) => void;
  onForwardLink: (targets: Selection[]) => void;
  focusContextRequest?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hideModification = modifications.find(
    (m) => m.type === "hide" && m.target.path === selection.locator.path,
  );

  const contextModification = modifications.find(
    (m): m is Extract<Modification, { type: "context" }> =>
      m.type === "context" && m.target.path === selection.locator.path,
  );

  // Forwarding is offered only for a link selection (NIM-51's own
  // acceptance criterion), and only when it actually has a destination —
  // an <a> with no href isn't a link an agent could follow anyway.
  const forwardModification = modifications.find(
    (m): m is Extract<Modification, { type: "forwardLink" }> =>
      m.type === "forwardLink" && m.target.path === selection.locator.path,
  );
  const canForward = selection.tag === "a" && !!selection.href;

  const [draftText, setDraftText] = useState("");

  // Reset the draft to the stored value whenever the selection changes,
  // so switching elements doesn't carry over a half-typed note.
  useEffect(() => {
    setDraftText(contextModification?.value.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.locator.path]);

  const hasUnsavedChange = draftText.trim() !== (contextModification?.value.text ?? "");

  useEffect(() => {
    if (focusContextRequest) textareaRef.current?.focus();
  }, [focusContextRequest]);

  return (
    <div className="mt-3 space-y-3 text-sm">
      <dl className="space-y-2 rounded-xl bg-slate-50 px-3 py-2.5">
        <div>
          <dt className="text-xs text-slate-400">Tag</dt>
          <dd className="font-mono text-slate-700">&lt;{selection.tag}&gt;</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Text</dt>
          <dd className="text-slate-700">{selection.text || "(no text content)"}</dd>
        </div>
      </dl>

      {/*
        Hide and Forward are both whole-element actions on the current
        selection — grouped into one connected card so they read as a
        pair, with Context (an annotation, not an action on the element
        itself) kept visually separate below.
      */}
      <ActionGroup>
        <ActionToggle
          accent="slate"
          icon="⦰"
          label="Hide from AI agents"
          activeLabel="Hidden from AI agents"
          note={
            hideModification && isShadowed(modificationStatuses, hideModification.id)
              ? "Currently inside another hidden element"
              : undefined
          }
          active={!!hideModification}
          onActivate={() => onHide([selection])}
          onRemove={() => hideModification && onRemove(hideModification.id)}
        />

        {canForward && (
          <ActionToggle
            accent="green"
            icon="⇥"
            label="Forward this link's content"
            activeLabel="Forwarding linked content"
            note={
              forwardModification && isShadowed(modificationStatuses, forwardModification.id)
                ? "Hidden by an ancestor, not currently applied"
                : undefined
            }
            active={!!forwardModification}
            onActivate={() => onForwardLink([selection])}
            onRemove={() => forwardModification && onRemove(forwardModification.id)}
          />
        )}
      </ActionGroup>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-blue-100 text-sm text-blue-700">
            ◧
          </span>
          <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Context for agents</label>
        </div>
        {contextModification && isShadowed(modificationStatuses, contextModification.id) && (
          <p className="mt-2 text-xs text-amber-700">
            Hidden by an ancestor — not shown to agents until that's unhidden. Your note is kept, unchanged.
          </p>
        )}
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Explain what this element shows or does…"
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-200 p-2.5 text-sm shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-1">
          {contextModification && (
            <button
              onClick={() => {
                onRemove(contextModification.id);
                setDraftText("");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
            >
              Remove
            </button>
          )}
          <button
            onClick={() => onSetContext([selection], draftText.trim())}
            disabled={!hasUnsavedChange || draftText.trim().length === 0}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900"
          >
            {contextModification ? "Save" : "Add context"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * NIM-56's "compact bar": actions here are commands, not toggles — there
 * is no per-element status shown (a mixed selection would need tri-state
 * controls to represent that), and no batch-remove. Clicking "Hide all"
 * always applies hide to every selected element (skipping any already
 * hidden is handled upstream, in App.tsx's upsert), never removes it from
 * ones that already have it.
 */
function MultiInspector({
  selections,
  onHide,
  onSetContext,
  onForwardLink,
}: {
  selections: Selection[];
  onHide: (targets: Selection[]) => void;
  onSetContext: (targets: Selection[], text: string) => void;
  onForwardLink: (targets: Selection[]) => void;
}) {
  const [draftText, setDraftText] = useState("");
  const canForwardAll = selections.every((s) => s.tag === "a" && !!s.href);

  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="rounded-xl bg-slate-100 px-3 py-2 font-semibold text-slate-700">
        {selections.length} elements selected
      </p>

      {/* Commands, not toggles (see doc comment above) — filled with each type's own accent as a call to action, same colors as ActionToggle's active state. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={() => onHide(selections)}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <span aria-hidden>⦰</span> Hide all
        </button>
        {canForwardAll && (
          <button
            onClick={() => onForwardLink(selections)}
            className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700"
          >
            <span aria-hidden>⇥</span> Forward all
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-blue-100 text-sm text-blue-700">
            ◧
          </span>
          <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Context for agents</label>
        </div>
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Explain what these elements show or do…"
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-200 p-2.5 text-sm shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              onSetContext(selections, draftText.trim());
              setDraftText("");
            }}
            disabled={draftText.trim().length === 0}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900"
          >
            Add context to all
          </button>
        </div>
      </div>
    </div>
  );
}

export function Inspector({
  selections,
  modifications,
  modificationStatuses,
  onHide,
  onRemove,
  onSetContext,
  onForwardLink,
  focusContextRequest,
}: InspectorProps) {
  return (
    <div className="w-96 shrink-0 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Inspector</h2>
      {selections.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">Click an element in the preview to see its details.</p>
      )}
      {selections.length === 1 && (
        <SingleInspector
          selection={selections[0]}
          modifications={modifications}
          modificationStatuses={modificationStatuses}
          onHide={onHide}
          onRemove={onRemove}
          onSetContext={onSetContext}
          onForwardLink={onForwardLink}
          focusContextRequest={focusContextRequest}
        />
      )}
      {selections.length > 1 && (
        <MultiInspector selections={selections} onHide={onHide} onSetContext={onSetContext} onForwardLink={onForwardLink} />
      )}
    </div>
  );
}
