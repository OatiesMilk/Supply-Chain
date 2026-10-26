import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';

// One comment composer for every record workspace (TSK-116). The Send button
// sits inside the same bordered box as the textarea: centred with a single
// line, bottom-aligned as the text grows. The textarea grows to six lines and
// then scrolls. Typed text is only cleared by the caller after a successful send.

const LINE_HEIGHT = 24;      // text-base / leading-6
const VERTICAL_PADDING = 12; // py-1.5
export const COMPOSER_MAX_LINES = 6;

/** Height and overflow for the auto-growing textarea, from its scrollHeight. */
export function composerTextareaSize(scrollHeight: number) {
  const min = LINE_HEIGHT + VERTICAL_PADDING;
  const max = LINE_HEIGHT * COMPOSER_MAX_LINES + VERTICAL_PADDING;
  return {
    height: Math.min(Math.max(scrollHeight, min), max),
    overflowY: scrollHeight > max ? 'auto' as const : 'hidden' as const,
  };
}

export default function CommentComposer({
  id, value, onChange, onSubmit, submitting, describedBy, error, className = '',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  describedBy?: string;
  error?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fitToContent = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const { height, overflowY } = composerTextareaSize(textarea.scrollHeight);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = overflowY;
  }, []);

  useLayoutEffect(fitToContent, [value, fitToContent]);

  // Line wrapping depends on width: refit when the box is first laid out (it can
  // mount inside a panel that has no width yet) and when the viewport resizes.
  // Only width changes refit, so the height change cannot loop.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === 'undefined') return;
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      fitToContent();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [fitToContent]);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">Comment (optional)</label>
      <div className="flex items-end gap-1 rounded-lg border border-slate-300 bg-white p-1 focus-within:border-[#0078C1] focus-within:ring-2 focus-within:ring-[#0078C1]/30">
        <textarea
          id={id}
          ref={textareaRef}
          aria-describedby={describedBy}
          disabled={submitting}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit(); }
          }}
          placeholder="Add to the discussion… (Ctrl+Enter to send)"
          rows={1}
          className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-base leading-6 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Send comment"
          title="Send comment (Ctrl+Enter)"
          onClick={onSubmit}
          disabled={!value.trim() || submitting}
          className="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-md bg-[#0078C1] text-white hover:bg-[#005fa3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
