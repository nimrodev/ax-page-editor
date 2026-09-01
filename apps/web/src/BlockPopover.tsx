import { Modification } from "@ax/schema";
import { MarkdownBlock } from "./api";
import { labelFor, LABEL_LIMIT, TYPE_META, truncate } from "./ModificationNavigator";

export type BlockPopoverModel =
  | { kind: "actionable" }
  | { kind: "existing"; modification: Modification; label: string };

/**
 * A block already produced by a modification (a context note, forwarded
 * content) should surface what's already there rather than offer to add
 * a new one on top of it (NIM-66) — an ordinary page paragraph has
 * nothing to surface, so it's always actionable. Falls back to
 * "actionable" if modificationId points at nothing in the current list
 * (e.g. it was just removed elsewhere) rather than crashing on a
 * dangling reference.
 */
export function buildBlockPopoverModel(block: MarkdownBlock, modifications: Modification[]): BlockPopoverModel {
  if (!block.modificationId) return { kind: "actionable" };
  const modification = modifications.find((m) => m.id === block.modificationId);
  if (!modification) return { kind: "actionable" };
  return { kind: "existing", modification, label: truncate(labelFor(modification), LABEL_LIMIT) };
}

interface BlockPopoverProps {
  model: BlockPopoverModel;
  onLocate: () => void;
  onHide: () => void;
  onAddContext: () => void;
  onRemove: (modificationId: string) => void;
}

/**
 * What a publisher sees after clicking a Markdown block (NIM-66) —
 * anchored to the block itself, not a separate dialog, so the payload
 * never stops looking like agent-facing text until you actually click
 * into it.
 */
export function BlockPopover({ model, onLocate, onHide, onAddContext, onRemove }: BlockPopoverProps) {
  if (model.kind === "existing") {
    const meta = TYPE_META[model.modification.type];
    return (
      <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className={`flex h-4 w-4 items-center justify-center rounded text-[10px] ${meta.iconClass}`}>
            {meta.icon}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{meta.typeLabel}</span>
        </div>
        <p className="mb-2 truncate text-slate-600">{model.label}</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onLocate}
            className="flex-1 rounded bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200"
          >
            Locate on page
          </button>
          <button
            type="button"
            onClick={() => onRemove(model.modification.id)}
            className="rounded px-2 py-1 font-medium text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
      <button
        type="button"
        onClick={onLocate}
        className="mb-1.5 block w-full rounded bg-amber-50 px-2 py-1.5 text-left font-medium text-amber-800 hover:bg-amber-100"
      >
        Locate on page →
      </button>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onHide}
          className="flex-1 rounded border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
        >
          Hide
        </button>
        <button
          type="button"
          onClick={onAddContext}
          className="flex-1 rounded border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
        >
          Add context
        </button>
      </div>
    </div>
  );
}
