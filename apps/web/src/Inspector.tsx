import { Selection } from "./HumanPreview";

export function Inspector({ selection }: { selection: Selection | null }) {
  return (
    <div className="w-72 shrink-0 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Inspector</h2>
      {selection ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-slate-400">Tag</dt>
            <dd className="font-mono text-slate-700">&lt;{selection.tag}&gt;</dd>
          </div>
          <div>
            <dt className="text-slate-400">Text</dt>
            <dd className="text-slate-700">{selection.text || "(no text content)"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Click an element in the preview to see its details.</p>
      )}
    </div>
  );
}
