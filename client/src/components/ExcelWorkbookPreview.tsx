import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

type WorkbookState = { workbook: any; error: string | null };

function cellText(cell: any): string {
  if (cell?.text !== undefined) return String(cell.text);
  const value = cell?.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part: any) => part.text ?? '').join('');
    if ('text' in value) return String(value.text ?? '');
    if ('result' in value) return cellText(value.result);
    if ('hyperlink' in value) return String(value.text ?? value.hyperlink);
    return '';
  }
  return String(value);
}

function colorValue(value: any): string | undefined {
  if (!value) return undefined;
  if (value.argb) return `#${String(value.argb).slice(-6)}`;
  if (value.rgb) return `#${String(value.rgb).slice(-6)}`;
  return undefined;
}

function cellStyle(cell: any): React.CSSProperties {
  const fill = cell.fill?.fgColor ?? cell.fill?.bgColor;
  const font = cell.font ?? {};
  const alignment = cell.alignment ?? {};
  const border = cell.border ?? {};
  const cssBorder = (side: any) => side?.style ? `${side.style === 'hair' ? 1 : 1}px solid ${colorValue(side.color) ?? '#cbd5e1'}` : undefined;
  return {
    backgroundColor: colorValue(fill),
    color: colorValue(font.color),
    fontFamily: font.name ? `'${font.name}', sans-serif` : undefined,
    fontSize: font.size ? `${Math.max(8, font.size * 1.333)}px` : undefined,
    fontWeight: font.bold ? 700 : undefined,
    fontStyle: font.italic ? 'italic' : undefined,
    textDecoration: font.underline ? 'underline' : undefined,
    textAlign: alignment.horizontal === 'centerContinuous' ? 'center' : alignment.horizontal,
    verticalAlign: alignment.vertical === 'middle' ? 'middle' : alignment.vertical === 'bottom' ? 'bottom' : 'top',
    whiteSpace: alignment.wrapText ? 'pre-wrap' : 'normal',
    overflowWrap: 'anywhere',
    borderTop: cssBorder(border.top), borderRight: cssBorder(border.right),
    borderBottom: cssBorder(border.bottom), borderLeft: cssBorder(border.left),
  };
}

function ExcelSheet({ worksheet, workbook }: { worksheet: any; workbook: any }) {
  const merges = new Map<string, { colSpan: number; rowSpan: number }>();
  const hidden = new Set<string>();
  for (const range of worksheet.model.merges ?? []) {
    const [start, end] = range.split(':');
    const a = start.match(/^([A-Z]+)(\d+)$/i);
    const b = end.match(/^([A-Z]+)(\d+)$/i);
    if (!a || !b) continue;
    const col = (letters: string) => letters.toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    const colSpan = col(b[1]) - col(a[1]) + 1;
    const rowSpan = Number(b[2]) - Number(a[2]) + 1;
    merges.set(start.toUpperCase(), { colSpan, rowSpan });
    for (let row = Number(a[2]); row <= Number(b[2]); row++) {
      for (let column = col(a[1]); column <= col(b[1]); column++) {
        if (row === Number(a[2]) && column === col(a[1])) continue;
        let letters = '';
        for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode((n - 1) % 26 + 65) + letters;
        hidden.add(`${letters}${row}`);
      }
    }
  }

  const columnCount = Math.max(worksheet.columnCount, 1);
  const rowCount = Math.max(worksheet.rowCount, 1);
  const columnWidth = (index: number) => {
    const width = worksheet.getColumn(index + 1).width;
    return width ? Math.max(48, Math.min(width * 7.5, 420)) : 120;
  };
  const rowHeight = (index: number) => (worksheet.getRow(index + 1).height ?? 18) * 1.333;
  const images = worksheet.getImages().flatMap((entry: any) => {
    const image = workbook.getImage(Number(entry.imageId));
    const range = entry.range;
    let src = image?.base64;
    if (!src && image?.buffer) {
      const bytes = new Uint8Array(image.buffer as ArrayBuffer);
      let binary = '';
      bytes.forEach(byte => { binary += String.fromCharCode(byte); });
      src = btoa(binary);
    }
    if (!src) return [];
    if (!src.startsWith('data:')) src = `data:image/${image.extension};base64,${src}`;
    const xAt = (value: number) => Array.from({ length: Math.floor(value) }, (_, i) => columnWidth(i)).reduce((sum, width) => sum + width, 0) + (value % 1) * columnWidth(Math.floor(value));
    const yAt = (value: number) => Array.from({ length: Math.floor(value) }, (_, i) => rowHeight(i)).reduce((sum, height) => sum + height, 0) + (value % 1) * rowHeight(Math.floor(value));
    return [{ src, left: xAt(range.tl.col), top: yAt(range.tl.row), width: Math.max(1, xAt(range.br.col) - xAt(range.tl.col)), height: Math.max(1, yAt(range.br.row) - yAt(range.tl.row)) }];
  });
  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-300 bg-white">
      <div className="relative w-max min-w-full">
      <table className="border-separate border-spacing-0 text-left text-[11px] text-slate-800" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
        <colgroup>{Array.from({ length: columnCount }, (_, index) => {
          return <col key={index} style={{ width: columnWidth(index) }} />;
        })}</colgroup>
        <tbody>{Array.from({ length: rowCount }, (_, rowIndex) => {
          const rowNumber = rowIndex + 1;
          const row = worksheet.getRow(rowNumber);
          return <tr key={rowNumber} style={{ height: row.height ? `${row.height * 1.333}px` : undefined }}>
            {Array.from({ length: columnCount }, (_, colIndex) => {
              const cell = row.getCell(colIndex + 1);
              if (hidden.has(cell.address.toUpperCase())) return null;
              const merge = merges.get(cell.address.toUpperCase());
              return <td key={cell.address} colSpan={merge?.colSpan} rowSpan={merge?.rowSpan} style={cellStyle(cell)} className="min-h-6 border-b border-slate-100 px-3 py-2">{cellText(cell)}</td>;
            })}
          </tr>;
        })}</tbody>
      </table>
      {images.map((image: { src: string; left: number; top: number; width: number; height: number }, index: number) => <img key={index} src={image.src} alt="" aria-hidden="true" className="pointer-events-none absolute z-10 object-contain" style={{ left: image.left, top: image.top, width: image.width, height: image.height }} />)}
      </div>
    </div>
  );
}

export default function ExcelWorkbookPreview({ blob }: { blob: Blob }) {
  const [state, setState] = useState<WorkbookState | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(null);
    import('exceljs').then(async module => {
      const workbook = new module.default.Workbook();
      await workbook.xlsx.load(await blob.arrayBuffer());
      if (!cancelled) { setActiveSheet(0); setState({ workbook, error: null }); }
    }).catch(error => {
      if (!cancelled) setState({ workbook: null, error: error instanceof Error ? error.message : 'The workbook could not be previewed.' });
    });
    return () => { cancelled = true; };
  }, [blob]);

  if (!state) return <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Opening generated workbook…</div>;
  if (state.error || !state.workbook) return <div role="alert" className="flex h-full min-h-48 items-center justify-center p-6 text-sm text-red-700">{state.error ?? 'The workbook could not be previewed.'}</div>;
  const sheets = state.workbook.worksheets;
  const worksheet = sheets[activeSheet];
  return <div className="flex h-full min-h-0 flex-col gap-2">
    {sheets.length > 1 && <div role="tablist" aria-label="Workbook sheets" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200">
      {sheets.map((sheet: any, index: number) => <button key={sheet.id} type="button" role="tab" aria-selected={activeSheet === index} onClick={() => setActiveSheet(index)} className={`min-h-10 whitespace-nowrap border-b-2 px-3 text-xs font-semibold ${activeSheet === index ? 'border-[#1F3864] text-[#1F3864]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{sheet.name}</button>)}
    </div>}
    {worksheet ? <ExcelSheet worksheet={worksheet} workbook={state.workbook} /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No worksheets in this workbook.</div>}
  </div>;
}
