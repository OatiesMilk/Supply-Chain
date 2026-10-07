import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { POD_ATTACHMENT_ACCEPT, validatePodAttachments } from '@/utils/attachmentValidation';
import type { PodReadiness } from '@/utils/podRequirement';
export default function PodUploader({ recordId, required = false, disabled = false, onReadinessChange }: {
  recordId: string;
  required?: boolean;
  disabled?: boolean;
  onReadinessChange?: (recordId: string, readiness: PodReadiness) => void;
}) {
  const { files, stagedFiles, readiness, stageFiles, unstageFile, reload } = usePodAttachments(recordId);
  const { loading, uploading, hasPhoto, loadFailed } = readiness;
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  useEffect(() => {
    onReadinessChange?.(recordId, { loading, uploading, hasPhoto, loadFailed, hasStagedFiles: readiness.hasStagedFiles });
  }, [recordId, loading, uploading, hasPhoto, loadFailed, readiness.hasStagedFiles, onReadinessChange]);

  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length || uploading || disabled) return;
    const validationError = validatePodAttachments(selected);
    setError(validationError);
    if (validationError) return;
    try {
      await stageFiles(selected);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not stage files. Please try again.');
    }
  };

  return (
    <div className="space-y-2" aria-busy={uploading || loading}>
      <p className="flex items-center gap-1 text-xs font-bold text-slate-600">
        <Paperclip aria-hidden="true" className="h-4 w-4" /> Proof of Delivery {required && <span>(photo required)</span>}
      </p>
      {required && <p className="text-xs text-slate-600">Upload at least one JPG or PNG delivery photo before completing this delivery. PDF and DOC files are optional supporting documents.</p>}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || disabled}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        <Paperclip aria-hidden="true" className="h-4 w-4" />
        {uploading ? 'Uploading staged files…' : 'Select Photo / Document'}
      </button>
      <input ref={inputRef} type="file" multiple accept={POD_ATTACHMENT_ACCEPT} className="hidden" disabled={uploading || disabled} onChange={selectFiles} />
      {loading && <p role="status" className="text-xs text-slate-500">Checking attachments…</p>}
      {loadFailed && <p role="alert" className="text-xs text-red-700">Could not load attachments. <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {hasPhoto && !uploading && !loading && !loadFailed && <p role="status" className="text-xs font-semibold text-emerald-700">Delivery photo ready.</p>}
      
      {stagedFiles.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Staged for Upload</p>
          {stagedFiles.map(staged => (
            <div key={staged.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              <div className="flex items-center gap-2 min-w-0">
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="truncate">{staged.file.name}</span>
                <span className="shrink-0 opacity-50">{formatSize(staged.file.size)}</span>
              </div>
              <button type="button" onClick={() => void unstageFile(staged.id)} disabled={uploading || disabled} className="text-amber-700 hover:text-amber-900" aria-label="Remove staged file">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saved Attachments</p>
          {files.map(file => (
            <div key={file.id} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate">{file.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
