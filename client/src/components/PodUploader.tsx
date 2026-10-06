import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip } from 'lucide-react';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { POD_ATTACHMENT_ACCEPT, validatePodAttachments } from '@/utils/attachmentValidation';
import type { PodReadiness } from '@/utils/podRequirement';

export default function PodUploader({ recordId, required = false, disabled = false, onReadinessChange }: {
  recordId: string;
  required?: boolean;
  disabled?: boolean;
  onReadinessChange?: (recordId: string, readiness: PodReadiness) => void;
}) {
  const { files, readiness, uploadFiles, reload } = usePodAttachments(recordId);
  const { loading, uploading, hasPhoto, loadFailed } = readiness;
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onReadinessChange?.(recordId, { loading, uploading, hasPhoto, loadFailed });
  }, [recordId, loading, uploading, hasPhoto, loadFailed, onReadinessChange]);

  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length || uploading || disabled) return;
    const validationError = validatePodAttachments(selected);
    setError(validationError);
    if (validationError) return;
    try {
      await uploadFiles(selected);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed. Please try again.');
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
        {uploading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Paperclip aria-hidden="true" className="h-4 w-4" />}
        {uploading ? 'Uploading…' : 'Upload Photo / Document'}
      </button>
      <input ref={inputRef} type="file" multiple accept={POD_ATTACHMENT_ACCEPT} className="hidden" disabled={uploading || disabled} onChange={selectFiles} />
      {loading && <p role="status" className="text-xs text-slate-500">Checking saved attachments…</p>}
      {loadFailed && <p role="alert" className="text-xs text-red-700">Could not load attachments. <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {hasPhoto && !uploading && !loading && !loadFailed && <p role="status" className="text-xs font-semibold text-emerald-700">Delivery photo saved.</p>}
      {files.map(file => <div key={file.id} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
        <FileText aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span>
      </div>)}
    </div>
  );
}
