import React, { useRef, useState } from 'react';
import { Plus, X, Check, FileText, UploadCloud, Wand2 } from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, DeliveryStatus, OutputActionConfig, OutputActionTrigger } from '../types';
import { AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, ACCOUNT_MANAGERS } from '../data';
import { runOutputActions } from '../outputActions';
import { ApiCompany } from '../api';
import OutputActionsPanel from './OutputActionsPanel';
import ComboboxField from './ComboboxField';

// ── Sample-data tables (moved here from DeliveryRecordsView) ──────────────────

export const AF_ITEMS: Record<string, string[]> = {
  'Deliveries': [
    '5x Premium 10" POS Tablet (UTK-TAB10)',
    '10x Compact 8" POS Tablet (UTK-TAB08)',
    '3x 80mm Thermal Printer + Cash Drawer Set',
    '20x Thermal Paper Rolls (UTK-ACC-ROLL)',
    '5x Omni-directional 2D Scanner (UTK-SCN-2D)',
    '2x Premium Tablet + 2x Rotating Stand + 2x NFC Reader',
    '4x Contactless NFC Card Reader + 4x Bluetooth Keyboard',
  ],
  'RMA': [
    '1x UTK-TAB10 defective unit pull-out — screen unresponsive',
    '2x UTK-PRN-TH80 returned for warranty repair',
    '1x UTK-DRW-MED cash drawer return — latch broken',
    '3x UTK-SCN-HND replacement swap on-site',
    '1x UTK-TAB08 screen unresponsive — pull-out',
    '2x UTK-STD-ROT defective stand — exchange unit',
  ],
  'Procurement Pick-up': [
    'Pick-up 50x UTK-TAB10 from supplier warehouse',
    'Pick-up 100x UTK-STD-ROT metal stands from depot',
    'Pick-up 20x UTK-DRW-HVY cash drawers',
    'Pick-up 50x boxes of 80mm thermal paper rolls',
    'Pick-up 30x UTK-PRN-TH80 from manufacturer',
    'Pick-up 15x UTK-LTE-RTR from freight depot',
  ],
  'Sales Orders': [
    'B2B order — 5x Compact Tablet + 5x Mobile Printer',
    'POS bundle: 3x Tablet, 3x Printer, 6x Paper Rolls',
    '10x UTK-RFID-TAG cashier key fobs',
    '2x LTE Backup Router deployment',
    '5x VFD Customer Display + 5x Rotating Stand',
    '8x Handheld Wireless Scanner (UTK-SCN-HND)',
  ],
};

export const AF_REMARKS: Record<string, string[]> = {
  'Deliveries': [
    'Coordinate with PIC upon arrival.',
    'Deliver to receiving dock B. Call site manager 30 mins prior.',
    'Deliver to commissary bay 3.',
    'Ground-floor unloading. Forklift available on-site.',
    'Building access via Tower 1 lobby. Notify receptionist.',
    '',
  ],
  'RMA': [
    'Collect all units with original packaging if available.',
    'Serial numbers to be documented on-site.',
    'Coordinate with IT department before pickup.',
    '',
  ],
  'Procurement Pick-up': [
    'Request for BOT and packing list from supplier.',
    'Inspect units before loading.',
    'Coordinate with warehouse coordinator Rm. 4.',
    '',
  ],
  'Sales Orders': [
    'Complete order before dispatch.',
    'Notify client 1 day before delivery.',
    '',
  ],
};

export const AF_REF_PREFIX: Record<string, string> = {
  'Deliveries': 'SAP',
  'RMA': 'SAP-RMA',
  'Procurement Pick-up': 'SAP-PU',
  'Sales Orders': 'SAP-SO',
};

const afPick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const afRandInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const afFutureDate = (minDays = 1, maxDays = 14) => {
  const d = new Date();
  d.setDate(d.getDate() + afRandInt(minDays, maxDays));
  return d.toISOString().split('T')[0];
};

// ── Form state ────────────────────────────────────────────────────────────────

interface RecordFormState {
  company_name: string;
  company_id: string;
  priority: string;
  reference: string;
  remarks: string;
  status: string;
  vehicle: string;
  area: string;
  account_manager: string;
  delivery_date: string;
  category: DeliveryCategory;
  item_type: string;
  is_draft: string;
  date_time: string;
  item_description: string;
  address: string;
  attachments: string[];
}

const buildEmptyForm = (category: DeliveryCategory): RecordFormState => ({
  company_name: '',
  company_id: '',
  priority: '2 - Moderate',
  reference: '',
  remarks: '',
  status: 'Scheduled',
  vehicle: '(None)',
  area: '',
  address: '',
  account_manager: '',
  delivery_date: '',
  category,
  item_type: 'Small Item',
  is_draft: 'No',
  date_time: '',
  item_description: '',
  attachments: []
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RecordCreateFormProps {
  category: DeliveryCategory;
  categoryLocked: boolean;
  availableCategories?: DeliveryCategory[];
  onCategoryChange?: (cat: DeliveryCategory) => void;
  companies: ApiCompany[];
  onSubmit: (data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>) => void;
  onCancel: () => void;
  // Optional: output action integration — only provided by DeliveryRecordsView
  outputActionConfigs?: Record<OutputActionTrigger, OutputActionConfig>;
  onUpdateOutputActionConfig?: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
  onAfterSubmit?: (bannerData: { referenceLabel: string; lines: string[] }) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecordCreateForm({
  category,
  categoryLocked,
  availableCategories,
  onCategoryChange,
  companies,
  onSubmit,
  onCancel,
  outputActionConfigs,
  onUpdateOutputActionConfig,
  onAfterSubmit,
}: RecordCreateFormProps) {
  const [form, setForm] = useState<RecordFormState>(() => buildEmptyForm(category));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof RecordFormState>(key: K, value: RecordFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleCategoryChange = (cat: DeliveryCategory) => {
    setForm(prev => ({ ...buildEmptyForm(cat), company_name: prev.company_name, company_id: prev.company_id }));
    setFormErrors({});
    onCategoryChange?.(cat);
  };

  const handleAutoFill = () => {
    if (companies.length === 0) return;
    const cat = form.category;
    const company = afPick(companies);
    const deliveryDate = afFutureDate(1, 14);
    setForm({
      company_name: company.name,
      company_id: company.id,
      priority: afPick(PRIORITIES),
      reference: `${AF_REF_PREFIX[cat] ?? 'SAP'}-${afRandInt(10000, 99999)}`,
      remarks: afPick(AF_REMARKS[cat] ?? ['']),
      status: 'Scheduled',
      vehicle: afPick(VEHICLES),
      area: afPick(AREAS),
      account_manager: afPick(ACCOUNT_MANAGERS),
      delivery_date: deliveryDate,
      category: cat,
      item_type: afPick(ITEM_TYPES),
      is_draft: 'No',
      date_time: `${deliveryDate}T${String(afRandInt(7, 11)).padStart(2, '0')}:00`,
      item_description: afPick(AF_ITEMS[cat] ?? ['(sample item)']),
      attachments: [],
    });
    setFormErrors({});
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachmentNames(prev => [...prev, ...Array.from(e.target.files!).map((f: File) => f.name)]);
    }
  };

  const handleCompanySelect = (name: string) => {
    const company = companies.find(c => c.name === name);
    setForm(prev => ({ ...prev, company_name: name, company_id: company?.id || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.company_name.trim()) errors.company_name = 'Company Name is required';
    if (form.is_draft !== 'Yes' && !form.reference.trim()) {
      errors.reference = 'Reference (SAP number) is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    let outputActionLog: any[] = [];
    let bannerLines: string[] = [];

    if (outputActionConfigs) {
      const creationOutput = await runOutputActions('Record Created', outputActionConfigs['Record Created'], { amName: form.account_manager });
      outputActionLog = creationOutput.newEntries;
      bannerLines = creationOutput.banners.length > 0
        ? creationOutput.banners
        : creationOutput.newEntries.map((e: any) => e.message);
    }

    onSubmit({
      ...form,
      driver: '',
      driver_assistants: [],
      category: form.category,
      priority: form.priority as DeliveryRecord['priority'],
      status: form.status as DeliveryStatus,
      item_type: form.item_type as DeliveryRecord['item_type'],
      is_draft: form.is_draft as DeliveryRecord['is_draft'],
      attachments: attachmentNames,
      output_actions_log: outputActionLog
    });

    if (onAfterSubmit) {
      onAfterSubmit({ referenceLabel: form.reference || form.company_name, lines: bannerLines });
    }

    // Reset and close
    setForm(buildEmptyForm(form.category));
    setAttachmentNames([]);
    onCancel();
  };

  const cat = form.category;

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 sm:p-7 space-y-6 print:hidden">
      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#0078C1]" />
            {categoryLocked ? `Create New ${cat} Record` : 'Create New Record'}
          </h3>
          <p className="text-[11.5px] text-slate-500 font-medium">Fields marked with * are required.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoFill}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" /> Auto Fill
          </button>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* ── REQUIRED FIELDS ─────────────────────────────────────── */}

          {/* Order Type — only shown when categoryLocked=false */}
          {!categoryLocked && (
            <div className="space-y-1.5 md:col-span-2">
              <label className="font-bold text-slate-700">Order Type <span className="text-red-500">*</span></label>
              <select
                value={cat}
                onChange={e => handleCategoryChange(e.target.value as DeliveryCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {(availableCategories ?? []).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Company Name * */}
          <ComboboxField
            label="Company Name"
            required
            options={companies.map(c => c.name)}
            value={form.company_name}
            onChange={handleCompanySelect}
            placeholder="Type to search or scroll to browse..."
            error={formErrors.company_name}
          />

          {/* Priority * */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Priority <span className="text-red-500">*</span></label>
            <select value={form.priority} onChange={e => updateField('priority', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Reference * (not required when Draft) */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">
              Reference (SAP Number){form.is_draft !== 'Yes' && <span className="text-red-500"> *</span>}
            </label>
            <input type="text" value={form.reference} onChange={e => updateField('reference', e.target.value)}
              placeholder="e.g., SAP-88231"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-hidden ${formErrors.reference ? 'border-red-500' : 'border-slate-300'}`} />
            {formErrors.reference && <p className="text-red-500 text-[10px] font-semibold">{formErrors.reference}</p>}
          </div>

          {/* Draft — placed near top so it adjusts which other fields are required */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Draft</label>
            <select value={form.is_draft} onChange={e => updateField('is_draft', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              Mark as Draft to save an incomplete record — Logistics will complete the remaining details before dispatch.
            </p>
          </div>

          {/* ── OPTIONAL FIELDS ─────────────────────────────────────── */}

          {/* Area */}
          <ComboboxField
            label="Area"
            optional
            options={AREAS}
            optionGroups={AREA_HIERARCHY.flatMap(r =>
              r.subregions.map(s => ({ label: `${r.region} · ${s.name}`, options: s.areas }))
            )}
            value={form.area}
            onChange={v => updateField('area', v)}
            placeholder="Type to search or scroll to browse..."
          />

          {/* Address */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Address <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <input
              type="text"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder="Street, building, floor, or additional location detail (optional)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
            />
          </div>

          {/* Account Manager */}
          <ComboboxField
            label="Account Manager"
            optional
            options={ACCOUNT_MANAGERS as unknown as string[]}
            value={form.account_manager}
            onChange={v => updateField('account_manager', v)}
            placeholder="Type to search or scroll to browse..."
          />

          {/* Delivery Date */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Delivery Date <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <input type="date" value={form.delivery_date} onChange={e => updateField('delivery_date', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          {/* Item Type */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Item Type <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <select value={form.item_type} onChange={e => updateField('item_type', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {ITEM_TYPES.map(it => <option key={it} value={it}>{it}</option>)}
            </select>
          </div>

          {/* Date and Time */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Date and Time <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <input type="datetime-local" value={form.date_time} onChange={e => updateField('date_time', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          {/* Remarks */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Remarks <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <textarea value={form.remarks} onChange={e => updateField('remarks', e.target.value)} rows={3}
              placeholder="Special instructions or notes..." className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          {/* Item Description */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Item Description <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <textarea value={form.item_description} onChange={e => updateField('item_description', e.target.value)} rows={3}
              placeholder="Cargo details, quantities, or bundle breakdown..." className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          {/* Document Attachments */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Document Attachments <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all"
            >
              <UploadCloud className="w-8 h-8 text-slate-400" />
              <p className="font-bold text-slate-600">Click to upload (mock, no file is actually stored)</p>
              <p className="text-[10px] text-slate-400">PDF, JPG, PNG, DOC up to 10MB</p>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" />
            </div>
            {attachmentNames.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachmentNames.map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded px-2 py-1">
                    <FileText className="w-3.5 h-3.5 text-[#1F3864]" />
                    <span className="font-mono text-[10px] text-slate-700">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* IPO configurable output actions — only when outputActionConfigs is provided */}
        {outputActionConfigs && onUpdateOutputActionConfig && (
          <OutputActionsPanel
            trigger="Record Created"
            config={outputActionConfigs['Record Created']}
            onChange={patch => onUpdateOutputActionConfig('Record Created', patch)}
          />
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[11px] uppercase">
            Cancel
          </button>
          <button type="submit" className="px-6 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg transition-colors text-[11px] uppercase flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Save Record
          </button>
        </div>
      </form>
    </div>
  );
}
