import { useEffect, useRef, useState } from "react";
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
    <div className="mt-3 space-y-4 text-sm">
      <dl className="space-y-2">
        <div>
          <dt className="text-slate-400">Tag</dt>
          <dd className="font-mono text-slate-700">&lt;{selection.tag}&gt;</dd>
        </div>
        <div>
          <dt className="text-slate-400">Text</dt>
          <dd className="text-slate-700">{selection.text || "(no text content)"}</dd>
        </div>
      </dl>

      {/*
        Hide and Forward are both whole-element actions on the current
        selection — placed side by side so they read as a pair, with
        Context (an annotation, not an action on the element itself) kept
        visually separate below. Previously Context sat between them,
        which made the two actions look unrelated to each other.
      */}
      <div className="flex gap-2">
        <div className="flex-1">
          {hideModification ? (
            <div className="rounded border border-blue-200 bg-blue-50 p-2">
              <p className="text-blue-900">
                {isShadowed(modificationStatuses, hideModification.id)
                  ? "Hidden from AI agents (currently inside another hidden element)"
                  : "Hidden from AI agents"}
              </p>
              <button
                onClick={() => onRemove(hideModification.id)}
                className="mt-1 text-xs font-medium text-blue-700 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => onHide([selection])}
              className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
            >
              Hide from AI agents
            </button>
          )}
        </div>

        {canForward && (
          <div className="flex-1">
            {forwardModification ? (
              <div className="rounded border border-green-200 bg-green-50 p-2">
                <p className="text-green-900">
                  {isShadowed(modificationStatuses, forwardModification.id)
                    ? "Forwarding linked content (hidden by an ancestor, not currently applied)"
                    : "Forwarding linked content to agents"}
                </p>
                <button
                  onClick={() => onRemove(forwardModification.id)}
                  className="mt-1 text-xs font-medium text-green-700 underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => onForwardLink([selection])}
                className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
              >
                Forward this link's content
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <label className="text-xs font-medium text-slate-500">Context for agents</label>
        {contextModification && isShadowed(modificationStatuses, contextModification.id) && (
          <p className="mt-1 text-xs text-amber-700">
            Hidden by an ancestor — not shown to agents until that's unhidden. Your note is kept, unchanged.
          </p>
        )}
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Explain what this element shows or does…"
          rows={3}
          className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
        />
        <div className="mt-1 flex gap-2">
          <button
            onClick={() => onSetContext([selection], draftText.trim())}
            disabled={!hasUnsavedChange || draftText.trim().length === 0}
            className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {contextModification ? "Save" : "Add context"}
          </button>
          {contextModification && (
            <button
              onClick={() => {
                onRemove(contextModification.id);
                setDraftText("");
              }}
              className="rounded px-3 py-1 text-xs font-medium text-slate-500 underline"
            >
              Remove
            </button>
          )}
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
    <div className="mt-3 space-y-4 text-sm">
      <p className="rounded bg-slate-100 px-2 py-1.5 font-medium text-slate-700">
        {selections.length} elements selected
      </p>

      {/* See SingleInspector: Hide and Forward are both whole-element actions, kept side by side and apart from Context. */}
      <div className="flex gap-2">
        <button
          onClick={() => onHide(selections)}
          className="flex-1 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
        >
          Hide all from AI agents
        </button>
        {canForwardAll && (
          <button
            onClick={() => onForwardLink(selections)}
            className="flex-1 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
          >
            Forward all links' content
          </button>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <label className="text-xs font-medium text-slate-500">Context for agents</label>
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Explain what these elements show or do…"
          rows={3}
          className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
        />
        <button
          onClick={() => {
            onSetContext(selections, draftText.trim());
            setDraftText("");
          }}
          disabled={draftText.trim().length === 0}
          className="mt-1 rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Add context to all
        </button>
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
