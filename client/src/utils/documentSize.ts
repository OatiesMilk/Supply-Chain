export type DocumentSize = 'a4' | 'letter' | 'legal';

export const DEFAULT_DOCUMENT_SIZE: DocumentSize = 'legal';

export const DOCX_MARGIN = 720;

export function getDocxDimensions(size: DocumentSize) {
  // Portrait dimensions in twips. docx package swaps them for landscape.
  switch (size) {
    case 'a4': return { width: 11906, height: 16838 };
    case 'letter': return { width: 12240, height: 15840 };
    case 'legal':
    default: return { width: 12240, height: 20160 };
  }
}

export function getDocxLandscapeContentWidth(size: DocumentSize) {
  const dim = getDocxDimensions(size);
  // In landscape, portrait height becomes width
  return dim.height - (DOCX_MARGIN * 2);
}

export function getExcelPageSetup(size: DocumentSize) {
  // paperSize: a4=9, letter=1, legal=5
  const paperSize = size === 'a4' ? 9 : size === 'letter' ? 1 : 5;
  return {
    orientation: 'landscape' as const,
    paperSize,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  };
}

export function getPdfFormat(size: DocumentSize) {
  return size; // jsPDF accepts 'a4', 'letter', 'legal'
}

export function fitColumnWidths(widths: number[], usableWidth: number, roundTwips = false): number[] {
  if (widths.length === 0) return [];
  const total = widths.reduce((sum, w) => sum + w, 0);

  if (total <= 0) {
    const even = usableWidth / widths.length;
    return widths.map((_, i) => roundTwips ? (i === widths.length - 1 ? usableWidth - Math.round(even) * (widths.length - 1) : Math.round(even)) : even);
  }

  const result = widths.map(w => (w / total) * usableWidth);

  if (roundTwips) {
    const rounded = result.map(w => Math.round(w));
    const sumRounded = rounded.slice(0, -1).reduce((a, b) => a + b, 0);
    rounded[rounded.length - 1] = usableWidth - sumRounded;
    return rounded;
  }

  const sumPrevious = result.slice(0, -1).reduce((a, b) => a + b, 0);
  result[result.length - 1] = usableWidth - sumPrevious;
  return result;
}
