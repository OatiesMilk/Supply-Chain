/**
 * Bundled Microgenesis Business Systems logo for client slip PDFs. Vite emits
 * the asset with the app, so slips render the logo offline and inside Teams
 * tabs without any external request. Cached once as a PNG data URL.
 */
import microgenesisLogoUrl from '@/assets/microgenesis_logo.png';
import type { SlipLogo } from './rmaClientSlipPdf';

const LOGO_WIDTH = 1921;
const LOGO_HEIGHT = 498;
let cached: Promise<SlipLogo | null> | null = null;

async function toDataUrl(url: string): Promise<string | null> {
  if (typeof fetch !== 'function') return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  if (typeof FileReader === 'undefined') return null;
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function loadMicrogenesisLogo(): Promise<SlipLogo | null> {
  cached ??= (async () => {
    for (const url of [microgenesisLogoUrl, '/microgenesis_logo.png']) {
      try {
        const dataUrl = await toDataUrl(url);
        if (dataUrl?.startsWith('data:image/png')) return { dataUrl, width: LOGO_WIDTH, height: LOGO_HEIGHT };
      } catch {
        // Try the next source; a slip without a logo is still a valid slip.
      }
    }
    cached = null;
    return null;
  })();
  return cached;
}
