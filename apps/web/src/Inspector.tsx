import { useEffect, useState } from "react";
import { Modification } from "@ax/schema";
import { Selection } from "./HumanPreview";

interface InspectorProps {
  selection: Selection | null;
  modifications: Modification[];
  onHide: (selection: Selection) => void;
  onRemove: (modificationId: string) => void;
  onSetContext: (selection: Selection, text: string) => void;
}

export function Inspector({ selection, modifications, onHide, onRemove, onSetContext }: InspectorProps) {
  const hideModification = selection
    ? modifications.find((m) => m.type === "hide" && m.target.path === selection.locator.path)
    : undefined;

  const contextModification = selection
    ? modifications.find(
        (m): m is Extract<Modification, { type: "context" }> =>
          m.type === "context" && m.target.path === selection.locator.path,
      )
    : undefined;

  const [draftText, setDraftText] = useState("");

  // Reset the draft to the stored value whenever the selection changes,
  // so switching elements doesn't carry over a half-typed note.
  useEffect(() => {
    setDraftText(contextModification?.value.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.locator.path]);

  const hasUnsavedChange = draftText.trim() !== (contextModification?.value.text ?? "");

  return (
    <div className="w-96 shrink-0 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Inspector</h2>
      {selection ? (
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

          {hideModification ? (
            <div className="rounded border border-blue-200 bg-blue-50 p-2">
              <p className="text-blue-900">Hidden from AI agents</p>
              <button
                onClick={() => onRemove(hideModification.id)}
                className="mt-1 text-xs font-medium text-blue-700 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => onHide(selection)}
              className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
            >
              Hide from AI agents
            </button>
          )}

          <div className="border-t border-slate-100 pt-3">
            <label className="text-xs font-medium text-slate-500">
              Context for agents
            </label>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Explain what this element shows or does…"
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
            />
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => onSetContext(selection, draftText.trim())}
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
      ) : (
        <p className="mt-3 text-sm text-slate-400">Click an element in the preview to see its details.</p>
      )}
    </div>
  );
}
