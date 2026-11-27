import { fetchProtectedSignature } from '@/api';
import type { IssuerSignature } from './rmaClientSlipPdf';

/** Base64 data URL from raw bytes (works in browsers and Node). */
export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * The RMA creator's signature for record `recordId`, via the record-scoped
 * endpoint. 204 (none on file), any error status or a non-image response
 * resolves to null so the slip falls back to the printed name.
 */
export async function fetchIssuerSignature(recordId: string, signal?: AbortSignal): Promise<IssuerSignature | null> {
  const response = await fetchProtectedSignature(`/api/v1/records/${encodeURIComponent(recordId)}/issuer-signature`, signal);
  if (response.status !== 200) return null;
  const mimeType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) return null;
  const width = Number(response.headers.get('X-Signature-Width')) || 300;
  const height = Number(response.headers.get('X-Signature-Height')) || 100;
  return { dataUrl: bytesToDataUrl(bytes, mimeType), mimeType, width, height };
}
