import { useEffect, useRef, useState } from 'react';
import { History, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';

interface Props {
  deleted: boolean;
  hasHistory: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRestore: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onHistory?: () => void;
}

export default function ChatMessageMenu({
  deleted,
  hasHistory,
  canEdit,
  canDelete,
  canRestore,
  onEdit,
  onDelete,
  onRestore,
  onHistory,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const anyAction = canEdit || canDelete || canRestore || hasHistory;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  if (!anyAction) return null;

  const act = (callback?: () => void) => {
    setOpen(false);
    callback?.();
  };

  return (
    <div ref={ref} className="absolute right-1 top-1 z-20">
      <button
        type="button"
        aria-label="Message actions"
        title="Message actions"
        className="rounded p-1 text-ink-muted opacity-70 hover:bg-ink/10 hover:opacity-100"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-36 rounded-cozy border border-ink/15 bg-paper p-1 shadow-xl">
          {!deleted && canEdit && (
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-ink/5" onClick={() => act(onEdit)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          {!deleted && canDelete && (
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-danger-ink hover:bg-danger/10" onClick={() => act(onDelete)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {deleted && canRestore && (
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-ink/5" onClick={() => act(onRestore)}>
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </button>
          )}
          {hasHistory && (
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-ink/5" onClick={() => act(onHistory)}>
              <History className="h-3.5 w-3.5" /> History
            </button>
          )}
        </div>
      )}
    </div>
  );
}
