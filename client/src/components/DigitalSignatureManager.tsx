import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, PenLine, Trash2, Upload } from 'lucide-react';
import { api, ApiError, fetchProtectedSignature, type ApiUserSignatureMeta } from '@/api';
import { getSignatureRejection, SIGNATURE_ACCEPT } from '@/utils/signatureValidation';

type Props =
  | { mode: 'self'; userName: string; onChange?: (meta: ApiUserSignatureMeta) => void }
  | { mode: 'admin'; userId: string; userName: string; onChange?: (meta: ApiUserSignatureMeta) => void };

const EMPTY: ApiUserSignatureMeta = { has_signature: false, mime_type: null, size: null, width: null, height: null, updated_at: null, image_url: null };
const message = (error: unknown, fallback: string) => error instanceof ApiError || error instanceof Error ? error.message : fallback;

/**
 * Preview, upload/replace and remove a digital signature. The image is
 * loaded through the authorized signature endpoint as a short-lived object
 * URL (revoked on change/unmount); it is never a public link.
 */
export default function DigitalSignatureManager(props: Props) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<ApiUserSignatureMeta | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'upload' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const targetId = props.mode === 'admin' ? props.userId : null;
  const onChange = props.onChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMeta(targetId ? await api.getUserSignature(targetId) : await api.getMySignature());
    } catch (err) {
      setMeta(EMPTY);
      setError(message(err, 'Could not load the digital signature.'));
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!meta?.image_url) { setPreview(null); return; }
    const controller = new AbortController();
    let url: string | null = null;
    void (async () => {
      try {
        const response = await fetchProtectedSignature(meta.image_url!, controller.signal);
        if (!response.ok || response.status === 204) return;
        url = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted) setPreview(url);
      } catch {
        // Metadata still shows a signature is on file; the preview is optional.
      }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [meta?.image_url]);

  const applied = (next: ApiUserSignatureMeta, text: string) => {
    setMeta(next);
    setNotice(text);
    onChange?.(next);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    const rejection = getSignatureRejection(file);
    if (rejection) { setError(rejection); return; }
    setBusy('upload');
    setError(null);
    try {
      const next = targetId ? await api.uploadUserSignature(targetId, file) : await api.uploadMySignature(file);
      applied(next, meta?.has_signature ? 'Signature replaced.' : 'Signature uploaded.');
    } catch (err) {
      setError(message(err, 'Could not upload the signature.'));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    setNotice(null);
    try {
      if (targetId) await api.deleteUserSignature(targetId); else await api.deleteMySignature();
      applied(EMPTY, 'Signature removed.');
    } catch (err) {
      setError(message(err, 'Could not remove the signature.'));
    } finally {
      setBusy(null);
    }
  };

  const hasSignature = !!meta?.has_signature;
  return (
    <div className="space-y-3" data-testid="digital-signature-manager">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-bold text-slate-900">Issued by:</p>
        <div className="mt-1 flex h-16 items-end justify-start">
          {loading ? (
            <Loader2 aria-label="Loading signature" className="mb-4 h-4 w-4 animate-spin text-slate-400" />
          ) : preview ? (
            <img src={preview} alt={`Digital signature of ${props.userName}`} className="max-h-14 max-w-[11rem] object-contain" />
          ) : (
            <span className="mb-1 text-xs text-slate-400">{hasSignature ? 'Signature on file' : 'No signature uploaded'}</span>
          )}
        </div>
        <p className="text-xs text-slate-800">{props.userName}</p>
        <div className="mt-0.5 h-px w-44 bg-slate-900" aria-hidden="true" />
      </div>

      <p id={hintId} className="text-xs leading-5 text-slate-500">
        PNG or JPG, up to 2 MB. Shown above the printed name in the &ldquo;Issued by&rdquo; block of RMA client slips{props.mode === 'self' ? ' you create' : ''}.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} id={inputId} type="file" accept={SIGNATURE_ACCEPT} className="sr-only" aria-describedby={hintId}
          disabled={loading || !!busy} onChange={event => void upload(event.target.files?.[0])} />
        <label htmlFor={inputId}
          className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue ${loading || busy ? 'pointer-events-none opacity-50' : ''}`}>
          {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : hasSignature ? <PenLine className="h-4 w-4" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {hasSignature ? 'Replace signature' : 'Upload signature'}
        </label>
        {hasSignature && (
          <button type="button" onClick={() => void remove()} disabled={loading || !!busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer">
            {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Remove
          </button>
        )}
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-xs">
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {!error && notice && <p className="text-emerald-700">{notice}</p>}
      </div>
    </div>
  );
}
