import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import type { DeliveryRecord, UserRole } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { useCompleteRecordMutation } from '@/api/queries/useRecordsQuery';
import { PodAttachmentList } from '@/components/PodAttachmentPreview';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { screenKeyForCategory } from '@/routes/screenRouting';

const isProofPhoto = (file: { is_photo: boolean; mime_type: string }) => file.is_photo
  && ['image/jpeg', 'image/png'].includes(file.mime_type.toLowerCase());

export default function TransportSignoffPanel({ record, currentUserRole }: { record: DeliveryRecord; currentUserRole: UserRole }) {
  const access = usePermissions();
  const { files, readiness, reload } = usePodAttachments(record.id);
  const complete = useCompleteRecordMutation();
  const [remarks, setRemarks] = useState('');
  const [selectedPhotoId, setSelectedPhotoId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const photos = files.filter(isProofPhoto);
  const awaiting = record.status === 'Transport Complete';
  const signedOff = record.status === 'Delivered' && !!record.completion_signed_off_at;
  const selectedPhoto = signedOff
    ? photos.some(file => file.id === record.completion_reviewed_photo_id) ? record.completion_reviewed_photo_id! : ''
    : photos.some(file => file.id === selectedPhotoId) ? selectedPhotoId : photos[0]?.id ?? '';
  const reviewedPhoto = photos.find(file => file.id === record.completion_reviewed_photo_id);
  const canSignOff = currentUserRole === 'Sales Coordinator' && access.canAccess(screenKeyForCategory(record.category))
    && access.canRecord(record.category, 'RECEIVE');

  useEffect(() => {
    if (!photos.some(file => file.id === selectedPhotoId)) setSelectedPhotoId(photos[0]?.id ?? '');
  }, [files, selectedPhotoId]);

  if (!awaiting && !signedOff) return null;

  const isCollection = record.category === 'Accounting Collection';
  const submit = async () => {
    if (!selectedPhoto || !record.edit_version || !remarks.trim() || !canSignOff) return;
    setError(null);
    try {
      await complete.mutateAsync({
        id: record.id, remarks: remarks.trim(), reviewedPhotoId: selectedPhoto,
        expectedEditVersion: record.edit_version,
      });
      setRemarks('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the reviewed handoff.');
      await reload();
    }
  };

  return (
    <section aria-labelledby="transport-signoff-title" className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 id="transport-signoff-title" className="font-bold text-slate-900">
              {signedOff ? 'Sales verification complete' : 'Awaiting Sales verification'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">Review the saved transport proof, recipient and Time Out before sign-off.</p>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-slate-500">Received by</dt><dd className="font-semibold text-slate-800">{record.received_by || 'Not recorded'}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Transport Time Out</dt><dd className="font-semibold text-slate-800">{formatManilaTimestamp(record.time_out)}</dd></div>
            {isCollection && record.amount != null && <div><dt className="text-xs font-semibold text-slate-500">Collection amount</dt><dd className="font-semibold text-slate-800">{record.amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</dd></div>}
            {signedOff && <div><dt className="text-xs font-semibold text-slate-500">Verified by</dt><dd className="font-semibold text-slate-800">{record.completion_signed_off_by || 'Sales Coordinator'}</dd></div>}
            {signedOff && <div><dt className="text-xs font-semibold text-slate-500">Verified at</dt><dd className="font-semibold text-slate-800">{formatManilaTimestamp(record.completion_signed_off_at)}</dd></div>}
          </dl>

          {signedOff && record.completion_remarks && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><span className="font-semibold">Verification remarks:</span> {record.completion_remarks}</p>}
          {signedOff && <p className="text-xs text-slate-600">Proof reviewed: {reviewedPhoto?.name ?? record.completion_reviewed_photo_id ?? 'Photo reference unavailable'}</p>}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">Saved transport proof</p>
            {readiness.loading ? <p className="text-xs text-slate-500">Loading saved proof…</p>
              : readiness.loadFailed ? <button type="button" onClick={() => void reload()} className="text-sm font-semibold text-blue-700 underline">Retry loading proof</button>
              : files.length ? <PodAttachmentList files={files} /> : <p className="text-sm text-red-700">No saved evidence was found.</p>}
          </div>

          {awaiting && canSignOff && <div className="space-y-3 border-t border-slate-100 pt-3">
            {photos.length > 0 && <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-slate-700">Photo reviewed for sign-off</legend>
              <div className="flex flex-wrap gap-2">
                {photos.map(file => <label key={file.id} className={`flex max-w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selectedPhoto === file.id ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-700'}`}>
                  <input type="radio" name={`reviewed-photo-${record.id}`} value={file.id} checked={selectedPhoto === file.id} onChange={() => setSelectedPhotoId(file.id)} />
                  <span className="max-w-56 truncate">{file.name}</span>
                </label>)}
              </div>
            </fieldset>}
            <div className="space-y-1.5">
              <label htmlFor={`signoff-remarks-${record.id}`} className="text-xs font-semibold text-slate-700">Verification remarks <span className="text-red-700">*</span></label>
              <textarea id={`signoff-remarks-${record.id}`} rows={3} required value={remarks} onChange={event => setRemarks(event.target.value)}
                placeholder="Record what you checked before sign-off."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20" />
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="button" onClick={() => void submit()} disabled={complete.isPending || readiness.loading || readiness.uploading || readiness.loadFailed || !selectedPhoto || !record.edit_version || !remarks.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:cursor-not-allowed disabled:opacity-50">
              {complete.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
              {isCollection ? 'Verify collection and complete' : 'Confirm receipt and complete'}
            </button>
          </div>}
          {awaiting && !canSignOff && <p className="border-t border-slate-100 pt-3 text-xs text-slate-600">A Sales Coordinator with access to this category must review and complete this handoff.</p>}
        </div>
      </div>
    </section>
  );
}
