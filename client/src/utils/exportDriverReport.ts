import { DeliveryRecord } from '../types';
import { AREA_HIERARCHY } from '../data';

// ─── Style constants (navy/gold — matches Microgenesis template) ──────────────

const NAVY    = 'FF1F3864';
const DARKER  = 'FF0D1B2A';
const GOLD    = 'FFFFC000';
const WHITE   = 'FFFFFFFF';
const LTGOLD  = 'FFFFF2CC'; // light gold for alt rows
const EVEN    = 'FFF8F9FA';

const thin = (argb = 'FFD0D5DD') => ({ style: 'thin' as const, color: { argb } });
const bdr  = (argb = 'FFD0D5DD') => ({ top: thin(argb), bottom: thin(argb), left: thin(argb), right: thin(argb) });
const fillSolid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

function sc(cell: any, opts: {
  bg?: string; color?: string; bold?: boolean; italic?: boolean; size?: number;
  h?: string; v?: string; fmt?: string; wrap?: boolean; bdrColor?: string;
}) {
  if (opts.bg) cell.fill = fillSolid(opts.bg);
  cell.font = {
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    size: opts.size ?? 10,
    color: { argb: opts.color ?? DARKER },
  };
  cell.alignment = { horizontal: opts.h ?? 'left', vertical: opts.v ?? 'middle', wrapText: opts.wrap ?? false };
  if (opts.fmt) cell.numFmt = opts.fmt;
  cell.border = bdr(opts.bdrColor);
}

// ─── Area groups ──────────────────────────────────────────────────────────────

const _NCR     = AREA_HIERARCHY.find(r => r.region === 'Metro Manila (NCR)')!;
const _CENTRAL = AREA_HIERARCHY.find(r => r.region === 'Luzon — Central & North')!;
const _CALA    = AREA_HIERARCHY.find(r => r.region === 'Luzon — CALABARZON')!;
const _ZAMB    = AREA_HIERARCHY.find(r => r.region === 'Luzon — Zambales')!;
const _VIS     = AREA_HIERARCHY.find(r => r.region === 'Visayas')!;
const _MIN     = AREA_HIERARCHY.find(r => r.region === 'Mindanao')!;

const AREA_GROUPS: { label: string; areas: string[] }[] = [
  {
    label: 'AREA 1 — Metro Manila South',
    areas: [
      ...(_NCR.subregions.find(s => s.name === 'South Manila Belt')?.areas ?? []),
      ...(_NCR.subregions.find(s => s.name === 'Ortigas Corridor')?.areas ?? []),
    ],
  },
  {
    label: 'AREA 2 — Metro Manila Central / East',
    areas: [
      ...(_NCR.subregions.find(s => s.name === 'North QC')?.areas ?? []),
      ...(_NCR.subregions.find(s => s.name === 'Central QC / Manila')?.areas ?? []),
      ...(_NCR.subregions.find(s => s.name === 'East Metro')?.areas ?? []),
      ...(_NCR.subregions.find(s => s.name === 'North Metro')?.areas ?? []),
    ],
  },
  {
    label: 'AREA 3 — Cavite / South Luzon',
    areas: [
      ..._CALA.subregions.flatMap(s => s.areas),
      ..._ZAMB.subregions.flatMap(s => s.areas),
    ],
  },
  {
    label: 'AREA 4 — North / Pampanga / Clark / Bulacan',
    areas: _CENTRAL.subregions.flatMap(s => s.areas),
  },
  {
    label: 'AREA 5 — Visayas & Mindanao',
    areas: [
      ..._VIS.subregions.flatMap(s => s.areas),
      ..._MIN.subregions.flatMap(s => s.areas),
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch('/microgenesis_logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function parseMins(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function depBucket(t: string | null | undefined): number | null {
  const m = parseMins(t);
  if (m === null || m < 480) return null;
  if (m < 510) return 0;
  if (m < 540) return 1;
  if (m < 570) return 2;
  return 3;
}

function arrBucket(t: string | null | undefined): number | null {
  const m = parseMins(t);
  if (m === null || m < 1080) return null;
  if (m < 1110) return 0;
  if (m < 1140) return 1;
  if (m < 1170) return 2;
  return 3;
}

function pct(n: number, total: number): number {
  return total > 0 ? n / total : 0;
}

function monthName(mo: number): string {
  return new Date(2000, mo - 1, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase();
}

// ─── Driver statistics ────────────────────────────────────────────────────────

interface DriverStats {
  acc: number;
  rh: number;
  pend: number;
  dep: [number, number, number, number];
  arr: [number, number, number, number];
  vehicles: Set<string>;
  lastRemark: string;
}

function buildDriverStats(
  drivers: string[],
  assigned: DeliveryRecord[],
  auditSets?: Map<string, Set<string>>,
): Map<string, DriverStats> {
  const map = new Map<string, DriverStats>();
  for (const d of drivers) {
    const recs = assigned.filter(r => r.driver!.trim() === d);
    const dep: [number, number, number, number] = [0, 0, 0, 0];
    const arr: [number, number, number, number] = [0, 0, 0, 0];
    for (const r of recs) {
      const db = depBucket(r.time_in);
      if (db !== null) dep[db]++;
      const ab = arrBucket(r.time_out);
      if (ab !== null) arr[ab]++;
    }
    const vehicles = new Set<string>();
    for (const r of recs) { if (r.vehicle?.trim()) vehicles.add(r.vehicle.trim()); }
    const lastRec = recs
      .filter(r => r.remarks?.trim())
      .sort((a, b) => new Date(b.modified_at ?? b.created_at).getTime() - new Date(a.modified_at ?? a.created_at).getTime())[0];

    let acc: number, rh: number, pend: number;
    if (auditSets) {
      acc = 0; rh = 0; pend = 0;
      for (const r of recs) {
        const held = auditSets.get(r.id) ?? new Set([r.status]);
        if (held.has('Delivered'))                            acc++;
        if (held.has('Rescheduled') || held.has('On-Hold'))  rh++;
        if (held.has('Pending') || held.has('Scheduled'))    pend++;
      }
    } else {
      acc  = recs.filter(r => r.status === 'Delivered').length;
      rh   = recs.filter(r => r.status === 'Rescheduled' || r.status === 'On-Hold').length;
      pend = recs.filter(r => r.status === 'Pending' || r.status === 'Scheduled').length;
    }

    map.set(d, { acc, rh, pend, dep, arr, vehicles, lastRemark: lastRec?.remarks ?? '' });
  }
  return map;
}

// ─── Excel Sheet 1 ───────────────────────────────────────────────────────────
// Layout: 12 columns (A–L)
//   Performance section: cols A–E (5 cols)
//   Departure section:   cols A–F (6 cols, side-by-side with Arrival)
//   Arrival section:     cols G–L (6 cols, same rows as Departure)
//   Area coverage:       cols A–C detail + G–K summary + K–L total

async function buildSheet1(
  ws: any,
  deliveries: DeliveryRecord[],
  assigned: DeliveryRecord[],
  drivers: string[],
  stats: Map<string, DriverStats>,
  month: string, year: number,
  byName: string, byRole: string,
) {
  const TOTAL_COLS = 12;

  // Column widths
  ws.getColumn(1).width = 24;  // A: driver / area names
  ws.getColumn(2).width = 15;  // B
  ws.getColumn(3).width = 15;  // C
  ws.getColumn(4).width = 15;  // D
  ws.getColumn(5).width = 15;  // E
  ws.getColumn(6).width = 12;  // F: dep total
  ws.getColumn(7).width = 24;  // G: arrival driver names
  ws.getColumn(8).width = 15;  // H
  ws.getColumn(9).width = 15;  // I
  ws.getColumn(10).width = 15; // J
  ws.getColumn(11).width = 15; // K
  ws.getColumn(12).width = 12; // L: arr total

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  let r = 1;

  // ── Logo row (row 1, full width A–L) ────────────────────────────────────────
  ws.mergeCells(1, 1, 1, TOTAL_COLS);
  ws.getRow(1).height = 54;

  // ── Title block (rows 2–4, full width A–L) ──────────────────────────────────
  for (let rr = 2; rr <= 4; rr++) {
    ws.mergeCells(rr, 1, rr, TOTAL_COLS);
    const cell = ws.getRow(rr).getCell(1);
    cell.fill = fillSolid(NAVY);
    cell.border = bdr('FF1F3864');
    ws.getRow(rr).height = rr === 2 ? 24 : 14;
  }

  const titleCell = ws.getRow(2).getCell(1);
  titleCell.value = `DELIVERY REPORT ${year}`;
  titleCell.font = { bold: true, size: 16, color: { argb: GOLD } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  const subCell = ws.getRow(3).getCell(1);
  subCell.value = 'Microgenesis Industrial and Commercial Products Corp.';
  subCell.font = { bold: true, size: 10, color: { argb: WHITE } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };

  const metaCell = ws.getRow(4).getCell(1);
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  metaCell.value = `Generated by: ${byName} (${byRole})  ·  ${dateStr}`;
  metaCell.font = { italic: true, size: 9, color: { argb: 'FFCCCCCC' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  r = 5;

  // ── Logo image — centered over row 1, above the title block ────────────────
  const logo = await loadLogoBase64();
  if (logo) {
    const imgId = ws.workbook.addImage({ base64: logo.split(',')[1], extension: 'png' });
    ws.addImage(imgId, {
      tl: { col: (TOTAL_COLS / 2) - 1.5, row: 0.08 },
      br: { col: (TOTAL_COLS / 2) + 1.5, row: 0.92 },
    } as any);
  }

  // ── Performance section (cols A–E only) ─────────────────────────────────────

  // Month label row (A4:E4)
  ws.mergeCells(r, 1, r, 5);
  const moCell = ws.getRow(r).getCell(1);
  moCell.value = `${month}.${year}`;
  moCell.fill = fillSolid(WHITE);
  moCell.font = { bold: true, size: 11, color: { argb: NAVY } };
  moCell.alignment = { vertical: 'middle', horizontal: 'center' };
  moCell.border = bdr();
  ws.getRow(r).height = 16;
  r++;

  // "Deliveries [year]" subheader (A5:E5)
  ws.mergeCells(r, 1, r, 5);
  const dlvCell = ws.getRow(r).getCell(1);
  dlvCell.value = `Deliveries ${year}`;
  dlvCell.fill = fillSolid(NAVY);
  dlvCell.font = { bold: true, italic: true, size: 10, color: { argb: GOLD } };
  dlvCell.alignment = { vertical: 'middle', horizontal: 'center' };
  dlvCell.border = bdr(NAVY);
  ws.getRow(r).height = 16;
  r++;

  // TARGETS row
  ws.getRow(r).height = 16;
  const targVals = ['TARGETS', 0.98, 0.01, 0.01, 'Total # of Deliveries per Driver'];
  targVals.forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, {
      bg: LTGOLD, bold: true, italic: true, color: DARKER,
      h: i === 0 ? 'left' : 'center',
      fmt: (i >= 1 && i <= 3) ? '0%' : undefined,
    });
  });
  r++;

  // Column headers
  ws.getRow(r).height = 18;
  ["Driver's Name", 'Accomplished', 'Resched / Hold', 'Pending', 'Total # of Deliveries'].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  r++;

  // Driver rows
  drivers.forEach((d, idx) => {
    const s = stats.get(d)!;
    const total = s.acc + s.rh + s.pend;
    ws.getRow(r).height = 16;
    [d, s.acc, s.rh, s.pend, total].forEach((v, i) => {
      const c = ws.getRow(r).getCell(i + 1);
      c.value = v;
      sc(c, {
        bg: i === 0 ? GOLD : (idx % 2 === 1 ? EVEN : WHITE),
        bold: i === 0,
        color: DARKER,
        h: i === 0 ? 'left' : 'center',
      });
    });
    r++;
  });

  // TOTALS row
  const totAcc  = [...stats.values()].reduce((n, s) => n + s.acc, 0);
  const totRH   = [...stats.values()].reduce((n, s) => n + s.rh, 0);
  const totPend = [...stats.values()].reduce((n, s) => n + s.pend, 0);
  const grand   = totAcc + totRH + totPend;
  ws.getRow(r).height = 16;
  ['Total', totAcc, totRH, totPend, grand].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  r++;

  // Percentage row
  ws.getRow(r).height = 16;
  ['Percentage', pct(totAcc, grand), pct(totRH, grand), pct(totPend, grand), 1].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: DARKER, bold: true, color: GOLD, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0.00%' : undefined, bdrColor: DARKER });
  });
  r++;

  // Blank spacer
  ws.getRow(r).height = 8;
  r++;

  // ── DEPARTURE (A–F) + ARRIVAL (G–L) SIDE BY SIDE ────────────────────────────

  const DEP_SLOTS = ['8:00am – 8:30am', '8:30am – 9:00am', '9:00am – 9:30am', '9:30am and above'];
  const ARR_SLOTS = ['6:00pm – 6:30pm', '6:30pm – 7:00pm', '7:00pm – 7:30pm', '7:30pm and above'];
  const TIME_TARGETS = [0.50, 0.85, 0.95, 1.00];

  // Section label row: DEPARTURE merged A–F, ARRIVAL merged G–L
  ws.mergeCells(r, 1, r, 6);
  const depLbl = ws.getRow(r).getCell(1);
  depLbl.value = 'DEPARTURE';
  depLbl.fill = fillSolid(NAVY);
  depLbl.font = { bold: true, italic: true, size: 12, color: { argb: GOLD } };
  depLbl.alignment = { vertical: 'middle', horizontal: 'center' };
  depLbl.border = bdr(NAVY);

  ws.mergeCells(r, 7, r, 12);
  const arrLbl = ws.getRow(r).getCell(7);
  arrLbl.value = 'ARRIVAL';
  arrLbl.fill = fillSolid(NAVY);
  arrLbl.font = { bold: true, italic: true, size: 12, color: { argb: GOLD } };
  arrLbl.alignment = { vertical: 'middle', horizontal: 'center' };
  arrLbl.border = bdr(NAVY);
  ws.getRow(r).height = 20;
  r++;

  // Targets row (both sides)
  ws.getRow(r).height = 16;
  ['Targets', ...TIME_TARGETS, null].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    if (v !== null) {
      c.value = v;
      sc(c, { bg: LTGOLD, bold: true, italic: true, color: DARKER, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0%' : undefined });
    } else {
      c.border = bdr();
    }
  });
  ['Targets', ...TIME_TARGETS, null].forEach((v, i) => {
    const c = ws.getRow(r).getCell(7 + i);
    if (v !== null) {
      c.value = v;
      sc(c, { bg: LTGOLD, bold: true, italic: true, color: DARKER, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0%' : undefined });
    } else {
      c.border = bdr();
    }
  });
  r++;

  // Column headers (both sides)
  ws.getRow(r).height = 18;
  ["Driver's Name", ...DEP_SLOTS, 'Total'].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  ["Driver's Name", ...ARR_SLOTS, 'Total'].forEach((v, i) => {
    const c = ws.getRow(r).getCell(7 + i);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  r++;

  // Driver rows (both sides on same row)
  drivers.forEach((d, idx) => {
    const s = stats.get(d)!;
    const depTotal = s.dep.reduce((a, b) => a + b, 0);
    const arrTotal = s.arr.reduce((a, b) => a + b, 0);
    ws.getRow(r).height = 16;

    [d, ...s.dep, depTotal].forEach((v, i) => {
      const c = ws.getRow(r).getCell(i + 1);
      c.value = v;
      sc(c, { bg: i === 0 ? GOLD : (idx % 2 === 1 ? EVEN : WHITE), bold: i === 0, color: DARKER, h: i === 0 ? 'left' : 'center' });
    });
    [d, ...s.arr, arrTotal].forEach((v, i) => {
      const c = ws.getRow(r).getCell(7 + i);
      c.value = v;
      sc(c, { bg: i === 0 ? GOLD : (idx % 2 === 1 ? EVEN : WHITE), bold: i === 0, color: DARKER, h: i === 0 ? 'left' : 'center' });
    });
    r++;
  });

  // Totals row (both sides)
  const depTot  = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.dep[i], 0));
  const arrTot  = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.arr[i], 0));
  const depGrand = depTot.reduce((a, b) => a + b, 0);
  const arrGrand = arrTot.reduce((a, b) => a + b, 0);
  ws.getRow(r).height = 16;
  ['TOTAL', ...depTot, depGrand].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  ['TOTAL', ...arrTot, arrGrand].forEach((v, i) => {
    const c = ws.getRow(r).getCell(7 + i);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  r++;

  // Cumulative Total Number row (both sides)
  const depCuml = depTot.map((_, i) => depTot.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const arrCuml = arrTot.map((_, i) => arrTot.slice(0, i + 1).reduce((a, b) => a + b, 0));
  ws.getRow(r).height = 16;
  ['Total Number', ...depCuml, depGrand].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: 'FFDDEBF7', bold: true, color: DARKER, h: i === 0 ? 'left' : 'center' });
  });
  ['Total Number', ...arrCuml, arrGrand].forEach((v, i) => {
    const c = ws.getRow(r).getCell(7 + i);
    c.value = v;
    sc(c, { bg: 'FFDDEBF7', bold: true, color: DARKER, h: i === 0 ? 'left' : 'center' });
  });
  r++;

  // Percentage row (both sides)
  ws.getRow(r).height = 16;
  ['Percentage', ...depTot.map(t => pct(t, depGrand)), 1].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: DARKER, bold: true, color: GOLD, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0.00%' : undefined, bdrColor: DARKER });
  });
  ['Percentage', ...arrTot.map(t => pct(t, arrGrand)), 1].forEach((v, i) => {
    const c = ws.getRow(r).getCell(7 + i);
    c.value = v;
    sc(c, { bg: DARKER, bold: true, color: GOLD, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0.00%' : undefined, bdrColor: DARKER });
  });
  r++;

  // Blank spacer
  ws.getRow(r).height = 8;
  r++;

  // ── Area Coverage section ────────────────────────────────────────────────────
  // Left  (A–C): area group detail tables
  // Right (G–I): area summary
  // Right (K–L): TOTAL AREA COVERED box

  const totalDeliveries = deliveries.length;

  // Section label row: "DELIVERY MONTH YEAR" on both sides + TOTAL AREA COVERED
  ws.mergeCells(r, 1, r, 3);
  const areaLblL = ws.getRow(r).getCell(1);
  areaLblL.value = `DELIVERY ${month} ${year}`;
  areaLblL.fill = fillSolid(NAVY);
  areaLblL.font = { bold: true, size: 10, color: { argb: GOLD } };
  areaLblL.alignment = { vertical: 'middle', horizontal: 'center' };
  areaLblL.border = bdr(NAVY);

  ws.mergeCells(r, 7, r, 9);
  const areaLblR = ws.getRow(r).getCell(7);
  areaLblR.value = `DELIVERY ${month} ${year}`;
  areaLblR.fill = fillSolid(NAVY);
  areaLblR.font = { bold: true, size: 10, color: { argb: GOLD } };
  areaLblR.alignment = { vertical: 'middle', horizontal: 'center' };
  areaLblR.border = bdr(NAVY);

  ws.mergeCells(r, 11, r, 12);
  const tacHdr = ws.getRow(r).getCell(11);
  tacHdr.value = 'TOTAL AREA COVERED';
  tacHdr.fill = fillSolid(NAVY);
  tacHdr.font = { bold: true, size: 10, color: { argb: GOLD } };
  tacHdr.alignment = { vertical: 'middle', horizontal: 'center' };
  tacHdr.border = bdr(NAVY);
  ws.getRow(r).height = 18;
  r++;

  // Right-side summary column headers (G–I)
  const summaryStartRow = r;
  ['Areas', 'QTY.', '% per Area'].forEach((v, i) => {
    const c = ws.getRow(r).getCell(7 + i);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });

  // Build summary data and detail tables per group
  const groupSummary: { label: string; num: number; total: number }[] = [];
  let groupIdx = 0;

  for (const group of AREA_GROUPS) {
    groupIdx++;
    const allGroupAreas = group.areas;
    const groupTotal = allGroupAreas.reduce((n, a) => n + deliveries.filter(d => d.area === a).length, 0);
    if (groupTotal === 0) continue;

    groupSummary.push({ label: `Area ${groupIdx}`, num: groupIdx, total: groupTotal });

    // Group header row: "AREAS (N)" | "Client Per Area" | "% per Area"
    ws.getRow(r).height = 16;
    const grpHdr = ws.getRow(r).getCell(1);
    grpHdr.value = `AREAS (${groupIdx})`;
    sc(grpHdr, { bg: NAVY, bold: true, color: GOLD, h: 'left', bdrColor: NAVY });
    const cpHdr = ws.getRow(r).getCell(2);
    cpHdr.value = 'Client Per Area';
    sc(cpHdr, { bg: NAVY, bold: true, color: WHITE, h: 'center', bdrColor: NAVY });
    const ppHdr = ws.getRow(r).getCell(3);
    ppHdr.value = '% per Area';
    sc(ppHdr, { bg: NAVY, bold: true, color: WHITE, h: 'center', bdrColor: NAVY });
    r++;

    // Area detail rows (show all areas in group, even zero-count)
    for (const area of allGroupAreas) {
      const cnt = deliveries.filter(d => d.area === area).length;
      ws.getRow(r).height = 15;

      const nameCell = ws.getRow(r).getCell(1);
      nameCell.value = area;
      sc(nameCell, { bg: WHITE, color: DARKER, h: 'left' });

      const cntCell = ws.getRow(r).getCell(2);
      cntCell.value = cnt;
      sc(cntCell, { bg: WHITE, color: DARKER, bold: true, h: 'center' });

      const pctCell = ws.getRow(r).getCell(3);
      pctCell.value = groupTotal > 0 ? Math.round((cnt / groupTotal) * 10000) / 100 : 0;
      sc(pctCell, { bg: WHITE, color: DARKER, h: 'center', fmt: '0.00' });
      r++;
    }

    // Group total row
    ws.getRow(r).height = 16;
    const totLbl = ws.getRow(r).getCell(1);
    totLbl.value = 'Total';
    sc(totLbl, { bg: GOLD, bold: true, color: DARKER, h: 'left' });
    const totCnt = ws.getRow(r).getCell(2);
    totCnt.value = groupTotal;
    sc(totCnt, { bg: GOLD, bold: true, color: DARKER, h: 'center' });
    const totPctC = ws.getRow(r).getCell(3);
    totPctC.value = 100.00;
    sc(totPctC, { bg: GOLD, bold: true, color: DARKER, h: 'center', fmt: '0.00' });
    r++;

    // Blank separator
    ws.getRow(r).height = 4;
    r++;
  }

  // Right-side summary data rows (G–I), starting one row below the header
  let sr = summaryStartRow + 1;
  for (const gs of groupSummary) {
    ws.getRow(sr).height = 15;
    const lbl = ws.getRow(sr).getCell(7);
    lbl.value = gs.label;
    sc(lbl, { bg: LTGOLD, bold: true, color: DARKER, h: 'left' });
    const qty = ws.getRow(sr).getCell(8);
    qty.value = gs.total;
    sc(qty, { bg: WHITE, bold: true, color: DARKER, h: 'center' });
    const pp = ws.getRow(sr).getCell(9);
    pp.value = totalDeliveries > 0 ? Math.round((gs.total / totalDeliveries) * 10000) / 100 : 0;
    sc(pp, { bg: WHITE, color: DARKER, h: 'center', fmt: '0.00' });
    sr++;
  }

  // Summary total row
  const allAreaCount = AREA_GROUPS.flatMap(g => g.areas).reduce((n, a) => n + deliveries.filter(d => d.area === a).length, 0);
  ws.getRow(sr).height = 16;
  const stLbl = ws.getRow(sr).getCell(7);
  stLbl.value = 'Total';
  sc(stLbl, { bg: NAVY, bold: true, color: GOLD, h: 'left', bdrColor: NAVY });
  const stQty = ws.getRow(sr).getCell(8);
  stQty.value = allAreaCount;
  sc(stQty, { bg: NAVY, bold: true, color: WHITE, h: 'center', bdrColor: NAVY });
  const stPp = ws.getRow(sr).getCell(9);
  stPp.value = 100.00;
  sc(stPp, { bg: NAVY, bold: true, color: WHITE, h: 'center', fmt: '0.00', bdrColor: NAVY });

  // TOTAL AREA COVERED box (K–L): month name + total number
  const tacMonthRow = summaryStartRow + 1;
  ws.mergeCells(tacMonthRow, 11, tacMonthRow, 12);
  const tacMonth = ws.getRow(tacMonthRow).getCell(11);
  tacMonth.value = month;
  tacMonth.fill = fillSolid(GOLD);
  tacMonth.font = { bold: true, size: 16, color: { argb: NAVY } };
  tacMonth.alignment = { vertical: 'middle', horizontal: 'center' };
  tacMonth.border = bdr(NAVY);

  const tacNumRow = tacMonthRow + 1;
  ws.mergeCells(tacNumRow, 11, tacNumRow + 1, 12);
  const tacNum = ws.getRow(tacNumRow).getCell(11);
  tacNum.value = allAreaCount;
  tacNum.fill = fillSolid(WHITE);
  tacNum.font = { bold: true, size: 22, color: { argb: NAVY } };
  tacNum.alignment = { vertical: 'middle', horizontal: 'center' };
  tacNum.border = bdr(NAVY);
}

// ─── Excel Sheet 2: Summary ──────────────────────────────────────────────────

function buildSheet2(
  ws: any,
  deliveries: DeliveryRecord[],
  assigned: DeliveryRecord[],
  drivers: string[],
  stats: Map<string, DriverStats>,
  month: string, year: number,
  byName: string, byRole: string,
) {
  const MAIN_C  = 15;
  const VEH_START = 17;

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 6 }];
  ws.getColumn(1).width  = 26;
  for (let c = 2; c <= 5; c++)  ws.getColumn(c).width = 13;
  for (let c = 6; c <= 10; c++) ws.getColumn(c).width = 14;
  for (let c = 11; c <= 15; c++) ws.getColumn(c).width = 14;
  ws.getColumn(16).width = 4;
  ws.getColumn(17).width = 22;
  for (let c = 18; c <= 21; c++) ws.getColumn(c).width = 13;

  let r = 1;

  // Title block (3 rows)
  for (let rr = 1; rr <= 3; rr++) {
    ws.mergeCells(rr, 1, rr, MAIN_C);
    ws.getRow(rr).getCell(1).fill = fillSolid(NAVY);
    ws.getRow(rr).getCell(1).border = bdr(NAVY);
    ws.getRow(rr).height = rr === 1 ? 24 : 14;
  }
  const t1 = ws.getRow(1).getCell(1);
  t1.value = `DELIVERY REPORT ${month} SUMMARY`;
  t1.font = { bold: true, size: 14, color: { argb: GOLD } };
  t1.alignment = { vertical: 'middle', horizontal: 'center' };

  const t2 = ws.getRow(2).getCell(1);
  t2.value = 'Microgenesis Industrial and Commercial Products Corp.';
  t2.font = { bold: true, size: 10, color: { argb: WHITE } };
  t2.alignment = { vertical: 'middle', horizontal: 'center' };

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const t3 = ws.getRow(3).getCell(1);
  t3.value = `Generated by: ${byName} (${byRole})  ·  ${dateStr}`;
  t3.font = { italic: true, size: 9, color: { argb: 'FFCCCCCC' } };
  t3.alignment = { vertical: 'middle', horizontal: 'center' };
  r = 4;

  // Group header row (section spans)
  ws.getRow(r).height = 18;
  const grpSpans = [
    { label: "Driver's Name",       start: 1,  end: 1,  bg: NAVY,    color: WHITE },
    { label: `Deliveries ${year}`,   start: 2,  end: 5,  bg: 'FF2E5496', color: WHITE },
    { label: 'Departure',            start: 6,  end: 10, bg: 'FF1F4E79', color: WHITE },
    { label: 'Arrival',              start: 11, end: 15, bg: 'FF833C00', color: WHITE },
  ];
  for (const g of grpSpans) {
    if (g.start < g.end) ws.mergeCells(r, g.start, r, g.end);
    const cell = ws.getRow(r).getCell(g.start);
    cell.value = g.label;
    cell.fill = fillSolid(g.bg);
    cell.font = { bold: true, size: 10, color: { argb: g.color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = bdr(g.bg);
  }
  // Vehicle section group
  ws.mergeCells(r, VEH_START, r, VEH_START + 4);
  const vGrp = ws.getRow(r).getCell(VEH_START);
  vGrp.value = 'Vehicle Plate Breakdown';
  vGrp.fill = fillSolid('FF4D4D4D');
  vGrp.font = { bold: true, size: 10, color: { argb: WHITE } };
  vGrp.alignment = { vertical: 'middle', horizontal: 'center' };
  vGrp.border = bdr('FF4D4D4D');
  r++;

  // Targets row
  ws.getRow(r).height = 16;
  const tgtNameCell = ws.getRow(r).getCell(1);
  tgtNameCell.value = 'Targets';
  sc(tgtNameCell, { bg: GOLD, bold: true, color: DARKER, h: 'left' });
  ['98%', '1%', '1%', ''].forEach((v, i) => {
    const c = ws.getRow(r).getCell(2 + i);
    c.value = v;
    sc(c, { bg: GOLD, bold: true, color: DARKER, h: 'center' });
  });
  ['50%', '85%', '95%', '100%', ''].forEach((v, i) => {
    const c = ws.getRow(r).getCell(6 + i);
    c.value = v;
    sc(c, { bg: GOLD, bold: true, color: DARKER, h: 'center' });
  });
  ['50%', '85%', '95%', '100%', ''].forEach((v, i) => {
    const c = ws.getRow(r).getCell(11 + i);
    c.value = v;
    sc(c, { bg: GOLD, bold: true, color: DARKER, h: 'center' });
  });
  r++;

  // Column sub-headers
  const DEP_SLOTS = ['8:00–8:30', '8:30–9:00', '9:00–9:30', '9:30+', 'Total'];
  const ARR_SLOTS = ['6:00–6:30pm', '6:30–7:00pm', '7:00–7:30pm', '7:30pm+', 'Total'];
  ws.getRow(r).height = 18;

  ["Driver's Name", 'Accomplished', 'Resched/Hold', 'Pending', 'Total', ...DEP_SLOTS, ...ARR_SLOTS].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  ['Vehicle', 'Accomplished', 'Resched/Hold', 'Pending', 'Total'].forEach((v, i) => {
    const c = ws.getRow(r).getCell(VEH_START + i);
    c.value = v;
    sc(c, { bg: 'FF4D4D4D', bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: 'FF4D4D4D' });
  });
  r++;

  // Driver data rows
  drivers.forEach((d, idx) => {
    const s = stats.get(d)!;
    const perfTotal = s.acc + s.rh + s.pend;
    const depTotal  = s.dep.reduce((a, b) => a + b, 0);
    const arrTotal  = s.arr.reduce((a, b) => a + b, 0);
    ws.getRow(r).height = 16;
    [d, s.acc, s.rh, s.pend, perfTotal, ...s.dep, depTotal, ...s.arr, arrTotal].forEach((v, i) => {
      const c = ws.getRow(r).getCell(i + 1);
      c.value = v;
      sc(c, {
        bg: i === 0 ? GOLD : (idx % 2 === 1 ? EVEN : WHITE),
        bold: i === 0, color: DARKER,
        h: i === 0 ? 'left' : 'center',
      });
    });
    r++;
  });

  // Total + Percentage rows
  const totAcc  = [...stats.values()].reduce((n, s) => n + s.acc, 0);
  const totRH   = [...stats.values()].reduce((n, s) => n + s.rh, 0);
  const totPend = [...stats.values()].reduce((n, s) => n + s.pend, 0);
  const grand   = totAcc + totRH + totPend;
  const depTot  = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.dep[i], 0));
  const arrTot  = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.arr[i], 0));
  const depGrand = depTot.reduce((a, b) => a + b, 0);
  const arrGrand = arrTot.reduce((a, b) => a + b, 0);

  ws.getRow(r).height = 16;
  ['Total', totAcc, totRH, totPend, grand, ...depTot, depGrand, ...arrTot, arrGrand].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  r++;

  ws.getRow(r).height = 16;
  const pctVals = [
    'Percentage',
    pct(totAcc, grand), pct(totRH, grand), pct(totPend, grand), 1,
    ...depTot.map(t => pct(t, depGrand)), 1,
    ...arrTot.map(t => pct(t, arrGrand)), 1,
  ];
  pctVals.forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = v;
    sc(c, { bg: DARKER, bold: true, color: GOLD, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0.00%' : undefined, bdrColor: DARKER });
  });
  r++;

  // Vehicle breakdown (right side, starting after targets + col headers)
  const allVehicles = [...new Set(assigned.map(rec => rec.vehicle?.trim()).filter(Boolean) as string[])].sort();
  let vr = 7; // data starts at row 7 (3 title + 1 group hdr + 1 targets + 1 col hdr)
  for (const v of allVehicles) {
    const recs = assigned.filter(rec => rec.vehicle?.trim() === v);
    const vAccN = recs.filter(rec => rec.status === 'Delivered').length;
    const vRHN  = recs.filter(rec => rec.status === 'Rescheduled' || rec.status === 'On-Hold').length;
    const vPendN = recs.filter(rec => rec.status === 'Pending' || rec.status === 'Scheduled').length;
    const vTotal = vAccN + vRHN + vPendN;
    ws.getRow(vr).height = 15;
    [v, vAccN, vRHN, vPendN, vTotal].forEach((val, i) => {
      const c = ws.getRow(vr).getCell(VEH_START + i);
      c.value = val;
      sc(c, { bg: WHITE, color: DARKER, bold: i === 0, h: i === 0 ? 'left' : 'center' });
    });
    vr++;
  }
  // Vehicle Total row
  const vTotAcc  = assigned.filter(rec => rec.status === 'Delivered').length;
  const vTotRH   = assigned.filter(rec => rec.status === 'Rescheduled' || rec.status === 'On-Hold').length;
  const vTotPend = assigned.filter(rec => rec.status === 'Pending' || rec.status === 'Scheduled').length;
  const vGrandTot = vTotAcc + vTotRH + vTotPend;
  ws.getRow(vr).height = 16;
  ['Total', vTotAcc, vTotRH, vTotPend, vGrandTot].forEach((val, i) => {
    const c = ws.getRow(vr).getCell(VEH_START + i);
    c.value = val;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  vr++;
  // Vehicle Percentage row
  ws.getRow(vr).height = 16;
  ['Percentage', pct(vTotAcc, vGrandTot), pct(vTotRH, vGrandTot), pct(vTotPend, vGrandTot), 1].forEach((val, i) => {
    const c = ws.getRow(vr).getCell(VEH_START + i);
    c.value = val;
    sc(c, { bg: DARKER, bold: true, color: GOLD, h: i === 0 ? 'left' : 'center', fmt: i >= 1 ? '0.00%' : undefined, bdrColor: DARKER });
  });
  vr++;

  // ── Right-side area summary (below vehicle breakdown) ──
  vr++;
  ws.mergeCells(vr, VEH_START, vr, VEH_START + 4);
  const areaSumHdr = ws.getRow(vr).getCell(VEH_START);
  areaSumHdr.value = `${month} SUMMARY`;
  areaSumHdr.fill = fillSolid(NAVY);
  areaSumHdr.font = { bold: true, size: 10, color: { argb: GOLD } };
  areaSumHdr.alignment = { vertical: 'middle', horizontal: 'center' };
  areaSumHdr.border = bdr(NAVY);
  ws.getRow(vr).height = 18;
  vr++;

  // Area summary column headers
  ['Areas', 'QTY.', '% per Area'].forEach((val, i) => {
    const c = ws.getRow(vr).getCell(VEH_START + i);
    c.value = val;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  // TOTAL AREA COVERED header in last 2 cols
  ws.mergeCells(vr, VEH_START + 3, vr, VEH_START + 4);
  const tacSumHdr = ws.getRow(vr).getCell(VEH_START + 3);
  tacSumHdr.value = 'TOTAL AREA COVERED';
  sc(tacSumHdr, { bg: NAVY, bold: true, color: GOLD, h: 'center', bdrColor: NAVY });
  vr++;

  // Area summary data rows
  const totalDel = deliveries.length;
  let areaGroupIdx = 0;
  const tacMonthVr = vr;
  for (const group of AREA_GROUPS) {
    areaGroupIdx++;
    const gTotal = group.areas.reduce((n, a) => n + deliveries.filter(d => d.area === a).length, 0);
    if (gTotal === 0) continue;
    ws.getRow(vr).height = 15;
    const aLbl = ws.getRow(vr).getCell(VEH_START);
    aLbl.value = `Area ${areaGroupIdx}`;
    sc(aLbl, { bg: LTGOLD, bold: true, color: DARKER, h: 'left' });
    const aQty = ws.getRow(vr).getCell(VEH_START + 1);
    aQty.value = gTotal;
    sc(aQty, { bg: WHITE, bold: true, color: DARKER, h: 'center' });
    const aPct = ws.getRow(vr).getCell(VEH_START + 2);
    aPct.value = totalDel > 0 ? Math.round((gTotal / totalDel) * 10000) / 100 : 0;
    sc(aPct, { bg: WHITE, color: DARKER, h: 'center', fmt: '0.00' });
    vr++;
  }
  // Area summary total row
  const allAreaSum = AREA_GROUPS.flatMap(g => g.areas).reduce((n, a) => n + deliveries.filter(d => d.area === a).length, 0);
  ws.getRow(vr).height = 16;
  const asTotLbl = ws.getRow(vr).getCell(VEH_START);
  asTotLbl.value = 'Total';
  sc(asTotLbl, { bg: NAVY, bold: true, color: GOLD, h: 'left', bdrColor: NAVY });
  const asTotQty = ws.getRow(vr).getCell(VEH_START + 1);
  asTotQty.value = allAreaSum;
  sc(asTotQty, { bg: NAVY, bold: true, color: WHITE, h: 'center', bdrColor: NAVY });
  const asTotPct = ws.getRow(vr).getCell(VEH_START + 2);
  asTotPct.value = 100.00;
  sc(asTotPct, { bg: NAVY, bold: true, color: WHITE, h: 'center', fmt: '0.00', bdrColor: NAVY });

  // TOTAL AREA COVERED box (month + number)
  ws.mergeCells(tacMonthVr, VEH_START + 3, tacMonthVr, VEH_START + 4);
  const tacMon = ws.getRow(tacMonthVr).getCell(VEH_START + 3);
  tacMon.value = month;
  tacMon.fill = fillSolid(GOLD);
  tacMon.font = { bold: true, size: 14, color: { argb: NAVY } };
  tacMon.alignment = { vertical: 'middle', horizontal: 'center' };
  tacMon.border = bdr(NAVY);
  ws.mergeCells(tacMonthVr + 1, VEH_START + 3, tacMonthVr + 2, VEH_START + 4);
  const tacNumS = ws.getRow(tacMonthVr + 1).getCell(VEH_START + 3);
  tacNumS.value = allAreaSum;
  tacNumS.fill = fillSolid(WHITE);
  tacNumS.font = { bold: true, size: 20, color: { argb: NAVY } };
  tacNumS.alignment = { vertical: 'middle', horizontal: 'center' };
  tacNumS.border = bdr(NAVY);

  // Driver remarks below main table
  r += 2;
  ws.getRow(r).height = 16;
  ["Driver's Name", 'Remarks', null, null, null].forEach((v, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    if (v !== null) c.value = v;
    sc(c, { bg: NAVY, bold: true, color: WHITE, h: i === 0 ? 'left' : 'center', bdrColor: NAVY });
  });
  ws.mergeCells(r, 2, r, 5);
  r++;

  drivers.forEach((d, idx) => {
    const s = stats.get(d)!;
    ws.getRow(r).height = 20;
    const nameCell = ws.getRow(r).getCell(1);
    nameCell.value = d;
    sc(nameCell, { bg: GOLD, color: DARKER, bold: true, h: 'left' });
    ws.mergeCells(r, 2, r, 5);
    const rmkCell = ws.getRow(r).getCell(2);
    rmkCell.value = s.lastRemark || '—';
    sc(rmkCell, { bg: idx % 2 === 1 ? EVEN : WHITE, color: DARKER, h: 'left', wrap: true, italic: !s.lastRemark });
    r++;
  });
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

async function exportPDF(
  deliveries: DeliveryRecord[],
  drivers: string[],
  stats: Map<string, DriverStats>,
  month: string, year: number,
  byName: string, byRole: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const NAVY_RGB: [number, number, number]   = [31, 56, 100];
  const DARKER_RGB: [number, number, number] = [13, 27, 42];
  const GOLD_RGB: [number, number, number]   = [255, 192, 0];
  const LTGOLD_RGB: [number, number, number] = [255, 242, 204];
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const MARGIN = 10;
  const centerX = pageW / 2;
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const assigned = deliveries.filter(r => r.driver?.trim());
  const pctStr = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(2)}%` : '0.00%';

  // ── Logo ────────────────────────────────────────────────────────────────────
  const logo = await loadLogoBase64();
  if (logo) doc.addImage(logo, 'PNG', centerX - 22, 4, 44, 15);

  // ── Title below logo ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY_RGB);
  doc.text(`DELIVERY REPORT — ${month} ${year}`, centerX, logo ? 23 : 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(`Microgenesis Industrial and Commercial Products Corp.`, centerX, logo ? 28 : 17, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated by: ${byName} (${byRole})  ·  ${dateStr}`, centerX, logo ? 32 : 21, { align: 'center' });

  // ── Header separator ────────────────────────────────────────────────────────
  const sepY = logo ? 35 : 24;
  doc.setDrawColor(...NAVY_RGB);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, sepY, pageW - MARGIN, sepY);

  let y = sepY + 4;

  // ── Shared table styles ─────────────────────────────────────────────────────
  const headStyles = {
    fillColor: NAVY_RGB as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 7,
    halign: 'center' as const,
    valign: 'middle' as const,
    minCellHeight: 9,
  };
  const tableStyles = {
    fontSize: 7.5,
    cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
    lineColor: [226, 232, 240] as [number, number, number],
    lineWidth: 0.2,
    overflow: 'linebreak' as const,
  };
  const bodyStyles = { textColor: [30, 41, 59] as [number, number, number], valign: 'middle' as const, minCellHeight: 7 };
  const altRowStyles = { fillColor: [248, 250, 252] as [number, number, number] };
  const usableW = pageW - MARGIN * 2;

  function sectionBar(label: string, startY: number): number {
    doc.setFillColor(...NAVY_RGB);
    doc.rect(MARGIN, startY, usableW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(label, MARGIN + 2, startY + 4.8);
    return startY + 9;
  }

  function pageCallback(data: any) {
    const total   = (doc as any).internal.getNumberOfPages();
    const current = data.pageNumber;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Microgenesis Business Systems — Confidential', centerX, pageH - 4, { align: 'center' });
    doc.text(`Page ${current} of ${total}`, pageW - MARGIN, pageH - 4, { align: 'right' });
    if (current > 1) {
      doc.setDrawColor(...NAVY_RGB);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, 8, pageW - MARGIN, 8);
    }
  }

  // ── Section 1: Delivery Performance ─────────────────────────────────────────
  y = sectionBar('DELIVERY PERFORMANCE', y);

  const perfRows = drivers.map(d => {
    const s = stats.get(d)!;
    const total = s.acc + s.rh + s.pend;
    return [d, s.acc, s.rh, s.pend, total];
  });
  const totAcc  = [...stats.values()].reduce((n, s) => n + s.acc, 0);
  const totRH   = [...stats.values()].reduce((n, s) => n + s.rh, 0);
  const totPend = [...stats.values()].reduce((n, s) => n + s.pend, 0);
  const grand   = totAcc + totRH + totPend;
  perfRows.push(['TOTALS', totAcc, totRH, totPend, grand] as any);
  perfRows.push(['PERCENTAGE', pctStr(totAcc, grand), pctStr(totRH, grand), pctStr(totPend, grand), '100.00%'] as any);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Driver's Name", 'Accomplished', 'Resched / Hold', 'Pending', 'Total Deliveries']],
    body: perfRows,
    headStyles,
    styles: tableStyles,
    bodyStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: { 0: { halign: 'left' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === perfRows.length - 2) {
        data.cell.styles.fillColor = NAVY_RGB;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.row.index === perfRows.length - 1) {
        data.cell.styles.fillColor = DARKER_RGB;
        data.cell.styles.textColor = GOLD_RGB;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: pageCallback,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Section 2: Departure Time ───────────────────────────────────────────────
  if (y > 165) { doc.addPage(); y = 14; }
  y = sectionBar('DEPARTURE TIME BREAKDOWN', y);

  const DEP_SLOTS = ['8:00–8:30am', '8:30–9:00am', '9:00–9:30am', '9:30am+'];
  const depRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, ...s.dep, s.dep.reduce((a, b) => a + b, 0)];
  });
  const depTot = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.dep[i], 0));
  const depGrand = depTot.reduce((a, b) => a + b, 0);
  depRows.push(['TOTALS', ...depTot, depGrand] as any);
  depRows.push(['PERCENTAGE', ...depTot.map(t => pctStr(t, depGrand)), '100.00%'] as any);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Driver's Name", ...DEP_SLOTS, 'Total']],
    body: depRows,
    headStyles,
    styles: tableStyles,
    bodyStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: { 0: { halign: 'left' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === depRows.length - 2) {
        data.cell.styles.fillColor = NAVY_RGB;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.row.index === depRows.length - 1) {
        data.cell.styles.fillColor = DARKER_RGB;
        data.cell.styles.textColor = GOLD_RGB;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: pageCallback,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Section 3: Arrival Time ─────────────────────────────────────────────────
  if (y > 165) { doc.addPage(); y = 14; }
  y = sectionBar('ARRIVAL TIME BREAKDOWN', y);

  const ARR_SLOTS = ['6:00–6:30pm', '6:30–7:00pm', '7:00–7:30pm', '7:30pm+'];
  const arrRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, ...s.arr, s.arr.reduce((a, b) => a + b, 0)];
  });
  const arrTot = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.arr[i], 0));
  const arrGrand = arrTot.reduce((a, b) => a + b, 0);
  arrRows.push(['TOTALS', ...arrTot, arrGrand] as any);
  arrRows.push(['PERCENTAGE', ...arrTot.map(t => pctStr(t, arrGrand)), '100.00%'] as any);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Driver's Name", ...ARR_SLOTS, 'Total']],
    body: arrRows,
    headStyles,
    styles: tableStyles,
    bodyStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: { 0: { halign: 'left' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === arrRows.length - 2) {
        data.cell.styles.fillColor = NAVY_RGB;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.row.index === arrRows.length - 1) {
        data.cell.styles.fillColor = DARKER_RGB;
        data.cell.styles.textColor = GOLD_RGB;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: pageCallback,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Section 4: Area Coverage ────────────────────────────────────────────────
  if (y > 165) { doc.addPage(); y = 14; }
  y = sectionBar('AREA COVERAGE', y);

  const areaRows: (string | number)[][] = [];
  let totalAreaCount = 0;
  for (const group of AREA_GROUPS) {
    const groupAreas = group.areas.filter(a => deliveries.some(d => d.area === a));
    const groupTotal = groupAreas.reduce((n, a) => n + deliveries.filter(d => d.area === a).length, 0);
    if (groupTotal === 0) continue;
    for (const area of groupAreas) {
      const cnt = deliveries.filter(d => d.area === area).length;
      if (cnt === 0) continue;
      areaRows.push([group.label, area, cnt, pctStr(cnt, groupTotal)]);
      totalAreaCount += cnt;
    }
    areaRows.push([`${group.label} — Subtotal`, '', groupTotal, '100.00%']);
  }
  const grandRowIdx = areaRows.length;
  areaRows.push(['TOTAL AREA COVERED', '', totalAreaCount, '100.00%']);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Area Group', 'Area', 'Deliveries', '% of Group']],
    body: areaRows,
    headStyles,
    styles: tableStyles,
    bodyStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      if (data.row.index === grandRowIdx) {
        data.cell.styles.fillColor = NAVY_RGB;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      } else if (String(data.row.raw[0]).includes('Subtotal')) {
        data.cell.styles.fillColor = LTGOLD_RGB;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: pageCallback,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Section 5: Vehicle Plate Breakdown ──────────────────────────────────────
  if (y > 165) { doc.addPage(); y = 14; }
  y = sectionBar('VEHICLE PLATE BREAKDOWN', y);

  const allVehicles = [...new Set(assigned.map(rec => rec.vehicle?.trim()).filter(Boolean) as string[])].sort();
  const vehRows: (string | number)[][] = allVehicles.map(v => {
    const recs = assigned.filter(rec => rec.vehicle?.trim() === v);
    const acc  = recs.filter(rec => rec.status === 'Delivered').length;
    const rh   = recs.filter(rec => rec.status === 'Rescheduled' || rec.status === 'On-Hold').length;
    const pend = recs.filter(rec => rec.status === 'Pending' || rec.status === 'Scheduled').length;
    return [v, acc, rh, pend, acc + rh + pend];
  });
  const vTotAcc  = vehRows.reduce((n, row) => n + (row[1] as number), 0);
  const vTotRH   = vehRows.reduce((n, row) => n + (row[2] as number), 0);
  const vTotPend = vehRows.reduce((n, row) => n + (row[3] as number), 0);
  const vGrand   = vTotAcc + vTotRH + vTotPend;
  vehRows.push(['TOTALS', vTotAcc, vTotRH, vTotPend, vGrand]);
  vehRows.push(['PERCENTAGE', pctStr(vTotAcc, vGrand), pctStr(vTotRH, vGrand), pctStr(vTotPend, vGrand), '100.00%']);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Vehicle Plate', 'Accomplished', 'Resched / Hold', 'Pending', 'Total']],
    body: vehRows,
    headStyles,
    styles: tableStyles,
    bodyStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: { 0: { halign: 'left' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === vehRows.length - 2) {
        data.cell.styles.fillColor = NAVY_RGB;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.row.index === vehRows.length - 1) {
        data.cell.styles.fillColor = DARKER_RGB;
        data.cell.styles.textColor = GOLD_RGB;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: pageCallback,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Section 6: Driver Remarks ───────────────────────────────────────────────
  if (y > 165) { doc.addPage(); y = 14; }
  y = sectionBar('DRIVER REMARKS', y);

  const remarkRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, s.lastRemark || '—'];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Driver's Name", 'Last Remark']],
    body: remarkRows,
    headStyles,
    styles: tableStyles,
    bodyStyles,
    alternateRowStyles: altRowStyles,
    columnStyles: { 0: { halign: 'left', cellWidth: 50 }, 1: { halign: 'left' } },
    didDrawPage: pageCallback,
  });

  doc.save(`Microgenesis_Driver_Report_${month}_${year}.pdf`);
}

// ─── DOCX Export ──────────────────────────────────────────────────────────────

async function exportDOCX(
  deliveries: DeliveryRecord[],
  drivers: string[],
  stats: Map<string, DriverStats>,
  month: string, year: number,
  byName: string, byRole: string,
): Promise<void> {
  const assigned = deliveries.filter(r => r.driver?.trim());
  const pctStr = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(2)}%` : '0.00%';
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, ImageRun,
    AlignmentType, WidthType, PageOrientation, VerticalAlign,
  } = await import('docx');

  const CONTENT_W = 15398;
  const navyFill = '1F3864';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const nb   = { style: 'none'   as const, size: 0, color: 'FFFFFF' };
  const thin = { style: 'single' as const, size: 4, color: 'E2E8F0' };
  const noBorders   = { top: nb,   bottom: nb,   left: nb,   right: nb };
  const thinBorders = { top: thin, bottom: thin, left: thin, right: thin };

  // Logo as Uint8Array for DOCX image embedding
  const logoDataUrl = await loadLogoBase64();
  let logoBytes: Uint8Array | null = null;
  if (logoDataUrl) {
    const b64 = logoDataUrl.split(',')[1];
    const bin = atob(b64);
    logoBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) logoBytes[i] = bin.charCodeAt(i);
  }

  const gap = () => new Paragraph({ children: [], spacing: { before: 80, after: 80 } });

  const colorBar = (text: string, fill: string, color: string, bold = false, size = 18) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill }, borders: noBorders,
        width: { size: CONTENT_W, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text, bold, color, size })] })],
      })] })],
    });

  // ── Header table (logo centered, title + subtitle below) ──────────────────
  const leftW   = Math.round(CONTENT_W * 0.15);
  const rightW  = Math.round(CONTENT_W * 0.15);
  const centerW = CONTENT_W - leftW - rightW;

  const hdrTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    borders: { top: nb, bottom: nb, left: nb, right: nb },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, width: { size: leftW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        new Paragraph({ children: [] }),
      ] }),
      new TableCell({ borders: noBorders, width: { size: centerW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        ...(logoBytes ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 44 }, type: 'png' })] })] : []),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `DELIVERY REPORT — ${month} ${year}`, bold: true, size: 26, color: navyFill })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Microgenesis Industrial and Commercial Products Corp.', size: 18, color: '1E293B' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Generated by: ${byName} (${byRole})  ·  ${dateStr}`, size: 16, italics: true, color: '64748B' })] }),
      ] }),
      new TableCell({ borders: noBorders, width: { size: rightW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        new Paragraph({ children: [] }),
      ] }),
    ] })],
  });

  // ── Table builder ─────────────────────────────────────────────────────────
  // `highlight` maps a data-row index to a fill/text-color override (used for TOTALS/PERCENTAGE/subtotal rows)
  function buildTable(
    headers: string[],
    rows: (string | number)[][],
    highlight?: Record<number, { fill: string; color: string }>,
  ): InstanceType<typeof Table> {
    const colW = Math.floor(CONTENT_W / headers.length);
    const lastW = CONTENT_W - colW * (headers.length - 1);

    const hdrRow = new TableRow({
      tableHeader: true,
      children: headers.map((h, i) =>
        new TableCell({
          shading: { fill: navyFill },
          borders: thinBorders,
          width: { size: i === headers.length - 1 ? lastW : colW, type: WidthType.DXA },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 17 })],
          })],
        }),
      ),
    });

    const dataRows = rows.map((row, idx) => {
      const hl = highlight?.[idx];
      return new TableRow({
        children: row.map((v, i) =>
          new TableCell({
            shading: hl ? { fill: hl.fill } : (idx % 2 === 1 ? { fill: 'F8F9FA' } : undefined),
            borders: thinBorders,
            width: { size: i === row.length - 1 ? lastW : colW, type: WidthType.DXA },
            children: [new Paragraph({
              alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
              children: [new TextRun({ text: String(v), size: 17, bold: i === 0 || !!hl, color: hl?.color })],
            })],
          }),
        ),
      });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [hdrRow, ...dataRows],
    });
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const NAVY_HL   = { fill: navyFill, color: 'FFFFFF' };
  const DARKER_HL = { fill: '0D1B2A', color: 'FFC000' };
  const GOLD_HL   = { fill: 'FFF2CC', color: '1F3864' };

  const perfHeaders = ["Driver's Name", 'Accomplished', 'Resched / Hold', 'Pending', 'Total'];
  const perfRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, s.acc, s.rh, s.pend, s.acc + s.rh + s.pend];
  });
  const tA = [...stats.values()].reduce((n, s) => n + s.acc, 0);
  const tR = [...stats.values()].reduce((n, s) => n + s.rh, 0);
  const tP = [...stats.values()].reduce((n, s) => n + s.pend, 0);
  const perfGrand = tA + tR + tP;
  perfRows.push(['TOTALS', tA, tR, tP, perfGrand]);
  perfRows.push(['PERCENTAGE', pctStr(tA, perfGrand), pctStr(tR, perfGrand), pctStr(tP, perfGrand), '100.00%']);
  const perfHighlight = { [perfRows.length - 2]: NAVY_HL, [perfRows.length - 1]: DARKER_HL };

  const depHeaders = ["Driver's Name", '8:00–8:30am', '8:30–9:00am', '9:00–9:30am', '9:30am+', 'Total'];
  const depRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, ...s.dep, s.dep.reduce((a, b) => a + b, 0)];
  });
  const depTot = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.dep[i], 0));
  const depGrand = depTot.reduce((a, b) => a + b, 0);
  depRows.push(['TOTALS', ...depTot, depGrand]);
  depRows.push(['PERCENTAGE', ...depTot.map(t => pctStr(t, depGrand)), '100.00%']);
  const depHighlight = { [depRows.length - 2]: NAVY_HL, [depRows.length - 1]: DARKER_HL };

  const arrHeaders = ["Driver's Name", '6:00–6:30pm', '6:30–7:00pm', '7:00–7:30pm', '7:30pm+', 'Total'];
  const arrRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, ...s.arr, s.arr.reduce((a, b) => a + b, 0)];
  });
  const arrTot = [0, 1, 2, 3].map(i => [...stats.values()].reduce((n, s) => n + s.arr[i], 0));
  const arrGrand = arrTot.reduce((a, b) => a + b, 0);
  arrRows.push(['TOTALS', ...arrTot, arrGrand]);
  arrRows.push(['PERCENTAGE', ...arrTot.map(t => pctStr(t, arrGrand)), '100.00%']);
  const arrHighlight = { [arrRows.length - 2]: NAVY_HL, [arrRows.length - 1]: DARKER_HL };

  // Area coverage
  const areaHeaders = ['Area Group', 'Area', 'Deliveries', '% of Group'];
  const areaRows: (string | number)[][] = [];
  const areaHighlight: Record<number, { fill: string; color: string }> = {};
  let totalAreaCount = 0;
  for (const group of AREA_GROUPS) {
    const groupAreas = group.areas.filter(a => deliveries.some(d => d.area === a));
    const groupTotal = groupAreas.reduce((n, a) => n + deliveries.filter(d => d.area === a).length, 0);
    if (groupTotal === 0) continue;
    for (const area of groupAreas) {
      const cnt = deliveries.filter(d => d.area === area).length;
      if (cnt === 0) continue;
      areaRows.push([group.label, area, cnt, pctStr(cnt, groupTotal)]);
      totalAreaCount += cnt;
    }
    areaRows.push([`${group.label} — Subtotal`, '', groupTotal, '100.00%']);
    areaHighlight[areaRows.length - 1] = GOLD_HL;
  }
  areaRows.push(['TOTAL AREA COVERED', '', totalAreaCount, '100.00%']);
  areaHighlight[areaRows.length - 1] = NAVY_HL;

  // Vehicle plate breakdown
  const vehHeaders = ['Vehicle Plate', 'Accomplished', 'Resched / Hold', 'Pending', 'Total'];
  const allVehicles = [...new Set(assigned.map(rec => rec.vehicle?.trim()).filter(Boolean) as string[])].sort();
  const vehRows: (string | number)[][] = allVehicles.map(v => {
    const recs = assigned.filter(rec => rec.vehicle?.trim() === v);
    const acc  = recs.filter(rec => rec.status === 'Delivered').length;
    const rh   = recs.filter(rec => rec.status === 'Rescheduled' || rec.status === 'On-Hold').length;
    const pend = recs.filter(rec => rec.status === 'Pending' || rec.status === 'Scheduled').length;
    return [v, acc, rh, pend, acc + rh + pend];
  });
  const vTotAcc  = vehRows.reduce((n, row) => n + (row[1] as number), 0);
  const vTotRH   = vehRows.reduce((n, row) => n + (row[2] as number), 0);
  const vTotPend = vehRows.reduce((n, row) => n + (row[3] as number), 0);
  const vGrand   = vTotAcc + vTotRH + vTotPend;
  vehRows.push(['TOTALS', vTotAcc, vTotRH, vTotPend, vGrand]);
  vehRows.push(['PERCENTAGE', pctStr(vTotAcc, vGrand), pctStr(vTotRH, vGrand), pctStr(vTotPend, vGrand), '100.00%']);
  const vehHighlight = { [vehRows.length - 2]: NAVY_HL, [vehRows.length - 1]: DARKER_HL };

  // Driver remarks
  const remarkHeaders = ["Driver's Name", 'Last Remark'];
  const remarkRows = drivers.map(d => {
    const s = stats.get(d)!;
    return [d, s.lastRemark || '—'];
  });

  // ── Build document ────────────────────────────────────────────────────────
  const doc = new Document({
    creator: 'Microgenesis Business Systems',
    title: `Driver Report ${month} ${year}`,
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: 16838, height: 11906 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        hdrTable,
        gap(),

        colorBar('SECTION 1 — DELIVERY PERFORMANCE', navyFill, 'FFFFFF', true),
        gap(),
        buildTable(perfHeaders, perfRows, perfHighlight),
        gap(),

        colorBar('SECTION 2 — DEPARTURE TIME BREAKDOWN', navyFill, 'FFFFFF', true),
        gap(),
        buildTable(depHeaders, depRows, depHighlight),
        gap(),

        colorBar('SECTION 3 — ARRIVAL TIME BREAKDOWN', navyFill, 'FFFFFF', true),
        gap(),
        buildTable(arrHeaders, arrRows, arrHighlight),
        gap(),

        colorBar('SECTION 4 — AREA COVERAGE', navyFill, 'FFFFFF', true),
        gap(),
        buildTable(areaHeaders, areaRows, areaHighlight),
        gap(),

        colorBar('SECTION 5 — VEHICLE PLATE BREAKDOWN', navyFill, 'FFFFFF', true),
        gap(),
        buildTable(vehHeaders, vehRows, vehHighlight),
        gap(),

        colorBar('SECTION 6 — DRIVER REMARKS', navyFill, 'FFFFFF', true),
        gap(),
        buildTable(remarkHeaders, remarkRows),
        gap(),

        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'Microgenesis Business Systems — Confidential', italics: true, size: 16, color: '64748B' })],
          spacing: { before: 120 },
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Microgenesis_Driver_Report_${month}_${year}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(
  deliveries: DeliveryRecord[],
  drivers: string[],
  stats: Map<string, DriverStats>,
  month: string, year: number,
  byName: string, byRole: string,
): void {
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const pctFmt = (n: number, t: number) => t > 0 ? `${(n / t * 100).toFixed(1)}%` : '0%';
  const rows: string[][] = [
    ['Microgenesis Business Systems'],
    [`Monthly Driver Report — ${month} ${year}`],
    [`Generated by: ${byName} (${byRole}) on ${dateStr}`],
    [],
    ['=== PERFORMANCE SUMMARY ==='],
    ["Driver's Name", 'Accomplished', 'Resched / Hold', 'Pending', 'Total Deliveries'],
  ];

  for (const d of drivers) {
    const s = stats.get(d)!;
    rows.push([d, String(s.acc), String(s.rh), String(s.pend), String(s.acc + s.rh + s.pend)]);
  }

  const totAcc  = [...stats.values()].reduce((n, s) => n + s.acc, 0);
  const totRH   = [...stats.values()].reduce((n, s) => n + s.rh, 0);
  const totPend = [...stats.values()].reduce((n, s) => n + s.pend, 0);
  rows.push(['TOTALS', String(totAcc), String(totRH), String(totPend), String(totAcc + totRH + totPend)]);

  // Percentage row
  const totAll = totAcc + totRH + totPend;
  rows.push(['PERCENTAGE', pctFmt(totAcc, totAll), pctFmt(totRH, totAll), pctFmt(totPend, totAll), '100%']);

  // Departure time breakdown
  const DEP_LABELS = ['8:00-8:30 AM', '8:30-9:00 AM', '9:00-9:30 AM', 'After 9:30 AM'];
  rows.push([], ['=== DEPARTURE TIME BREAKDOWN ==='], ["Driver's Name", ...DEP_LABELS, 'Total']);
  for (const d of drivers) {
    const s = stats.get(d)!;
    const total = s.dep.reduce((a, b) => a + b, 0);
    rows.push([d, ...s.dep.map(String), String(total)]);
  }

  // Arrival time breakdown
  const ARR_LABELS = ['6:00-6:30 PM', '6:30-7:00 PM', '7:00-7:30 PM', 'After 7:30 PM'];
  rows.push([], ['=== ARRIVAL TIME BREAKDOWN ==='], ["Driver's Name", ...ARR_LABELS, 'Total']);
  for (const d of drivers) {
    const s = stats.get(d)!;
    const total = s.arr.reduce((a, b) => a + b, 0);
    rows.push([d, ...s.arr.map(String), String(total)]);
  }

  // Area coverage
  rows.push([], ['=== AREA COVERAGE ==='], ['Area Group', 'Driver', 'Deliveries']);
  const assigned = deliveries.filter(r => r.driver?.trim());
  for (const g of AREA_GROUPS) {
    const areaSet = new Set(g.areas.map(a => a.toLowerCase()));
    for (const d of drivers) {
      const driverRecs = assigned.filter(r => r.driver!.trim() === d && areaSet.has((r.area ?? '').toLowerCase()));
      if (driverRecs.length > 0) rows.push([g.label, d, String(driverRecs.length)]);
    }
  }

  // Vehicle breakdown
  rows.push([], ['=== VEHICLE PLATE BREAKDOWN ==='], ['Driver', 'Vehicle Plates']);
  for (const d of drivers) {
    const s = stats.get(d)!;
    rows.push([d, [...s.vehicles].join(', ') || '(none)']);
  }

  // Driver remarks
  rows.push([], ['=== DRIVER REMARKS ==='], ['Driver', 'Latest Remark']);
  for (const d of drivers) {
    const s = stats.get(d)!;
    if (s.lastRemark) rows.push([d, s.lastRemark]);
  }

  const csv = rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `Microgenesis_Driver_Report_${month}_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function downloadDriverReport(
  records: DeliveryRecord[],
  month: number,
  year: number,
  format: 'excel' | 'pdf' | 'docx' | 'csv',
  generatedByName: string,
  generatedByRole: string,
  auditSets?: Map<string, Set<string>>,
): Promise<void> {
  const mo = monthName(month);

  const deliveries = records.filter(r => {
    if (!r.delivery_date) return false;
    const d = new Date(r.delivery_date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  const assigned = deliveries.filter(r => r.driver?.trim());
  const drivers  = [...new Set(assigned.map(r => r.driver!.trim()))].sort();
  const stats    = buildDriverStats(drivers, assigned, auditSets);

  if (format === 'csv') {
    exportCSV(deliveries, drivers, stats, mo, year, generatedByName, generatedByRole);
    return;
  }

  if (format === 'pdf') {
    await exportPDF(deliveries, drivers, stats, mo, year, generatedByName, generatedByRole);
    return;
  }

  if (format === 'docx') {
    await exportDOCX(deliveries, drivers, stats, mo, year, generatedByName, generatedByRole);
    return;
  }

  // Excel
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = generatedByName;
  wb.created = new Date();

  await buildSheet1(wb.addWorksheet('Monthly Report'), deliveries, assigned, drivers, stats, mo, year, generatedByName, generatedByRole);
  buildSheet2(wb.addWorksheet('Summary'),        deliveries, assigned, drivers, stats, mo, year, generatedByName, generatedByRole);

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Microgenesis_Driver_Report_${mo}_${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
