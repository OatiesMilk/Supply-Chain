import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, File, FileText, ImageOff, X } from 'lucide-react';
import type { ApiPodAttachment } from '@/api';
import { nextLightboxIndex, splitPodAttachments } from '@/utils/podPreview';

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedAt(value: string) {
  return new Date(value).toLocaleString();
}

function documentType(file: ApiPodAttachment) {
  const extension = file.name.split('.').pop()?.toUpperCase();
  if (file.mime_type === 'application/pdf' || extension === 'PDF') return 'PDF';
  if (file.mime_type.includes('word') || extension === 'DOC' || extension === 'DOCX') return 'DOC';
  return extension || 'FILE';
}

function PhotoThumbnail({ file, onOpen, onRemove, removeDisabled = false }: {
  file: ApiPodAttachment;
  onOpen: () => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="group relative aspect-square min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
      {failed ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-slate-500">
          <ImageOff aria-hidden="true" className="h-6 w-6" />
          <span className="text-[10px] font-semibold">Preview unavailable</span>
          <a
            href={file.download_url}
            download={file.name}
            aria-label={`Download ${file.name}`}
            className="text-[10px] font-bold text-blue-700 underline"
          >
            Download
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Preview ${file.name}`}
          className="block h-full w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {!loaded && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-slate-200" />}
          <img
            src={file.download_url}
            alt={file.name}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`h-full w-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        </button>
      )}
      {!failed && (
        <a
          href={file.download_url}
          download={file.name}
          aria-label={`Download ${file.name}`}
          onClick={event => event.stopPropagation()}
          className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-white hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
        </a>
      )}
      {onRemove && (
        <button
          type="button"
          disabled={removeDisabled}
          onClick={event => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${file.name}`}
          className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-white hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function PodPhotoLightbox({
  files,
  index,
  onClose,
  onIndexChange,
}: {
  files: readonly ApiPodAttachment[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const file = files[index];

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onIndexChange(nextLightboxIndex(index, -1, files.length));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onIndexChange(nextLightboxIndex(index, 1, files.length));
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [files.length, index, onClose, onIndexChange]);

  if (!file) return null;

  const move = (delta: number) => onIndexChange(nextLightboxIndex(index, delta, files.length));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 sm:p-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${file.name}`}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-slate-400">{formatUploadedAt(file.uploaded_at)}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close photo preview"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-4">
          <img src={file.download_url} alt={file.name} className="max-h-[70dvh] max-w-full object-contain sm:max-h-[80dvh]" />
          {files.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="Previous photo"
                className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4"
              >
                <ChevronLeft aria-hidden="true" className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="Next photo"
                className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4"
              >
                <ChevronRight aria-hidden="true" className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-3">
          {files.length > 1 && (
            <span className="mr-1 text-xs text-slate-400">{index + 1} of {files.length}</span>
          )}
          <a
            href={file.download_url}
            download={file.name}
            aria-label={`Download ${file.name}`}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Download aria-hidden="true" className="h-4 w-4" /> Download
          </a>
        </div>
      </div>
    </div>
  );
}

export function PodAttachmentList({ files, onRemove, removeDisabled = false }: {
  files: readonly ApiPodAttachment[];
  onRemove?: (file: ApiPodAttachment) => void;
  removeDisabled?: boolean;
}) {
  const { photos, documents } = splitPodAttachments(files);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,6rem)] gap-2 sm:grid-cols-[repeat(auto-fill,7rem)]">
          {photos.map((file, index) => (
            <PhotoThumbnail
              key={file.id}
              file={file}
              onOpen={() => setLightboxIndex(index)}
              onRemove={onRemove ? () => onRemove(file) : undefined}
              removeDisabled={removeDisabled}
            />
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {documents.map(file => {
            const kind = documentType(file);
            const Icon = kind === 'PDF' ? FileText : File;
            return (
              <div key={file.id} className="flex min-w-0 items-center gap-3 px-3 py-2 hover:bg-slate-50">
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{file.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                    {kind}{file.size ? ` · ${formatSize(file.size)}` : ''} · {formatUploadedAt(file.uploaded_at)}
                  </p>
                </div>
                <a
                  href={file.download_url}
                  download={file.name}
                  aria-label={`Download ${file.name}`}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-600 hover:bg-slate-200 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                {onRemove && (
                  <button
                    type="button"
                    disabled={removeDisabled}
                    onClick={() => onRemove(file)}
                    aria-label={`Remove ${file.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lightboxIndex !== null && (
        <PodPhotoLightbox
          files={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
