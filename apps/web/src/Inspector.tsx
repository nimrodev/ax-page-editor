import { Modification } from "@ax/schema";
import { Selection } from "./HumanPreview";

interface InspectorProps {
  selection: Selection | null;
  modifications: Modification[];
  onHide: (selection: Selection) => void;
  onRemove: (modificationId: string) => void;
}

export function Inspector({ selection, modifications, onHide, onRemove }: InspectorProps) {
  const hideModification = selection
    ? modifications.find((m) => m.type === "hide" && m.target.path === selection.locator.path)
    : undefined;

  return (
    <div className="w-72 shrink-0 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Inspector</h2>
      {selection ? (
        <div className="mt-3 space-y-3 text-sm">
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
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Click an element in the preview to see its details.</p>
      )}
    </div>
  );
}
