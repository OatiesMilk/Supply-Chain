import { manilaToday, submissionErrors } from '@/utils/recordLifecycle';
import { usePermissions } from '@/hooks/usePermissions';
import React, { useId, useRef, useState } from 'react';
import { Plus, X, Check, FileText, UploadCloud, Wand2 } from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, DeliveryStatus, OutputActionConfig, OutputActionTrigger } from '@/types';
import { AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, RMA_ITEM_TYPES, ACCOUNT_MANAGERS } from '@/data';
import { RMA_CATEGORIES, autoFillRmaFields, type RmaCategory } from '@/utils/rma';
import { runOutputActions } from '@/outputActions';
import { exportRecordOutputPDF } from '@/utils/recordOutputPdf';
import { api, ApiCompany } from '@/api';
import OutputActionsPanel from '@/features/deliveries/OutputActionsPanel';
import ComboboxField from '@/components/ComboboxField';
import { POD_ATTACHMENT_ACCEPT, getPodAttachmentRejection } from '@/utils/attachmentValidation';
import { selectDemoLocation } from '@/utils/demoLocations';
import { notify } from '@/utils/notify';
import { uploadPendingRecordAttachments, type StagedRecordAttachment } from '@/utils/recordAttachments';

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
  'Procurement Pick-up': 'SAP-PU',
  'Sales Orders': 'SAP-SO',
};

const afPick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const afRandInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const afFutureDate = (minDays = 1, maxDays = 14) => {
  const d = new Date();
  d.setDate(d.getDate() + afRandInt(minDays, maxDays));
  return manilaToday(d);
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
  rma_type: RmaCategory | '';
  rma_movement: DeliveryRecord['rma_movement'] | '';
  purchase_date: string;
  customer_contact_name: string;
  customer_contact_email: string;
  customer_contact_phone: string;
  item_description: string;
  line_items: { sku: string; quantity: number }[];
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
  rma_type: '',
  rma_movement: '',
  purchase_date: '',
  customer_contact_name: '',
  customer_contact_email: '',
  customer_contact_phone: '',
  item_description: '',
  line_items: [],
  attachments: []
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RecordCreateFormProps {
  category: DeliveryCategory;
  categoryLocked: boolean;
  availableCategories?: DeliveryCategory[];
  onCategoryChange?: (cat: DeliveryCategory) => void;
  companies: ApiCompany[];
  onSubmit: (data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>) => Promise<DeliveryRecord>;
  onCancel: () => void;
  // Optional: output action integration — only provided by DeliveryRecordsView
  outputActionConfigs?: Record<OutputActionTrigger, OutputActionConfig>;
  onUpdateOutputActionConfig?: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
  onAfterSubmit?: (bannerData: { recordId: string; referenceLabel: string; lines: string[] }) => void;
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
  const access = usePermissions();
  const deliveryDateId = useId();
  const [form, setForm] = useState<RecordFormState>(() => buildEmptyForm(category));
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stagedAttachments, setStagedAttachments] = useState<StagedRecordAttachment[]>([]);
  const [createdRecordInfo, setCreatedRecordInfo] = useState<{ id: string; referenceLabel: string; lines: string[]; isDraft: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const updateField = <K extends keyof RecordFormState>(key: K, value: RecordFormState[K]) => {
    setFormErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const handleCategoryChange = (cat: DeliveryCategory) => {
    setForm(prev => ({ ...buildEmptyForm(cat), company_name: prev.company_name, company_id: prev.company_id }));
    setFormErrors({});
    onCategoryChange?.(cat);
  };

  const handleAutoFill = () => {
    if (companies.length === 0) return;
    const cat = form.category;
    const company = afPick(companies);
    const location = selectDemoLocation();
    const deliveryDate = afFutureDate(1, 14);
    const rmaFields = cat === 'RMA' ? autoFillRmaFields(form.reference, afRandInt(0, RMA_CATEGORIES.length - 1)) : null;
    setForm({
      company_name: company.name,
      company_id: company.id,
      address: location.address,
      priority: afPick(PRIORITIES),
      reference: rmaFields ? rmaFields.reference : `${AF_REF_PREFIX[cat] ?? 'SAP'}-${afRandInt(10000, 99999)}`,
      remarks: afPick(AF_REMARKS[cat] ?? ['']),
      status: 'Scheduled',
      vehicle: afPick(VEHICLES),
      area: location.area,
      account_manager: afPick(ACCOUNT_MANAGERS),
      delivery_date: deliveryDate,
      category: cat,
      item_type: cat === 'RMA' ? afPick(RMA_ITEM_TYPES) : afPick(ITEM_TYPES),
      is_draft: 'No',
      rma_type: rmaFields?.rma_type ?? '',
      rma_movement: '',
      purchase_date: '',
      customer_contact_name: company.contact_person ?? '',
      customer_contact_email: '',
      customer_contact_phone: '',
      item_description: afPick(AF_ITEMS[cat] ?? ['(sample item)']),
      line_items: [{ sku: afPick(AF_ITEMS[cat] ?? ['Sample SKU']), quantity: afRandInt(1, 10) }],
      attachments: [],
    });
    setFormErrors({});
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!access.canRecord(form.category, 'POD')) return;
    const input = e.currentTarget;
    const selectedFiles = Array.from(input.files ?? []);
    input.value = '';
    if (selectedFiles.length === 0) return;

    const rejection = getPodAttachmentRejection([...stagedAttachments.map(attachment => attachment.file), ...selectedFiles]);
    if (rejection) {
      notify.fileRejected(rejection.fileName, rejection.reason);
      return;
    }

    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setStagedAttachments(prev => [
      ...prev,
      ...selectedFiles.map((file, index) => ({
        id: `${batchId}-${index}`,
        file,
        status: 'pending' as const,
      })),
    ]);
  };

  const handleCompanySelect = (name: string) => {
    setFormErrors(prev => { const n = { ...prev }; delete n.company_name; delete n.company_id; return n; });
    const company = companies.find(c => c.name === name);
    setForm(prev => ({ ...prev, company_name: name, company_id: company?.id || '' }));
  };

  const updateAttachmentStatus = (id: string, status: StagedRecordAttachment['status'], error?: string) => {
    setStagedAttachments(prev => prev.map(attachment => {
      if (attachment.id !== id) return attachment;
      const next = { ...attachment, status };
      if (error) next.error = error;
      else delete next.error;
      return next;
    }));
  };

  const uploadAttachments = (recordId: string, attachments = stagedAttachments) =>
    uploadPendingRecordAttachments(recordId, attachments, api, updateAttachmentStatus);

  const finishCreatedRecord = (info: NonNullable<typeof createdRecordInfo>) => {
    onAfterSubmit?.({ recordId: info.id, referenceLabel: info.referenceLabel, lines: info.lines });
    setForm(buildEmptyForm(form.category));
    setStagedAttachments([]);
    setCreatedRecordInfo(null);
    onCancel();
  };

  const handleRetryAttachments = async () => {
    if (!createdRecordInfo || saving) return;
    setSaving(true);
    try {
      const complete = await uploadAttachments(createdRecordInfo.id);
      if (!complete) {
        notify.error(`Record ${createdRecordInfo.id} is saved. Some attachments still need to be uploaded; retry them here.`);
        return;
      }
      notify.success('All record attachments uploaded');
      finishCreatedRecord(createdRecordInfo);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || createdRecordInfo) return;
    const isDraft = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "draft";
    if (!access.canRecord(form.category, 'CREATE') || !isDraft && !access.canRecord(form.category, 'SUBMIT')) return;
    const errors = submissionErrors({ ...form, rma_reference: form.category === 'RMA' ? form.reference : undefined }, isDraft);

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      requestAnimationFrame(() => {
        const firstInvalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        firstInvalid?.focus();
        firstInvalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }
    setFormErrors({});

    let bannerLines: string[] = [];

    setSaving(true);
    let createdRecord: DeliveryRecord;
    let createdInfo: { id: string; referenceLabel: string; lines: string[]; isDraft: boolean };
    try {
      createdRecord = await onSubmit({
        ...form,
        reference: form.category === 'RMA' ? '' : form.reference,
        rma_reference: form.category === 'RMA' ? form.reference.trim() || null : null,
        rma_type: form.category === 'RMA' && form.rma_type ? form.rma_type : null,
        rma_movement: form.category === 'RMA' && form.rma_movement ? form.rma_movement : null,
        driver: '',
        driver_assistants: [],
        category: form.category,
        priority: form.priority as DeliveryRecord['priority'],
        status: isDraft ? 'Draft' : 'Scheduled',
        item_type: form.item_type as DeliveryRecord['item_type'],
        is_draft: isDraft ? 'Yes' : 'No',
        attachments: [],
        output_actions_log: [],
      });
      // Retain the saved identity before any optional output can fail.
      createdInfo = {
        id: createdRecord.id,
        referenceLabel: form.reference || form.company_name,
        lines: bannerLines,
        isDraft,
      };
      setCreatedRecordInfo(createdInfo);
      if (!isDraft && outputActionConfigs) {
        try {
          const output = await runOutputActions('Record Created', outputActionConfigs['Record Created'], {
            amName: createdRecord.account_manager, recordId: createdRecord.id, category: createdRecord.category, api,
            exportPDF: () => exportRecordOutputPDF(createdRecord),
          });
          bannerLines = output.banners;
          if (output.email.failed || output.pdf === 'failed') notify.error(`Record ${createdRecord.id} is saved. ${output.banners.join(' ')}`);
        } catch (error) {
          bannerLines = [`Additional outputs could not finish: ${error instanceof Error ? error.message : 'Please check notification status.'}`];
          notify.error(`Record ${createdRecord.id} is saved. ${bannerLines[0]}`);
        }
        createdInfo = { ...createdInfo, lines: bannerLines };
        setCreatedRecordInfo(createdInfo);
      }

      const allUploaded = await uploadAttachments(createdRecord.id);
      if (!allUploaded) {
        notify.error(`Record ${createdRecord.id} was created. Some attachments still need to be uploaded; retry them below.`);
        return;
      }
      notify.success(isDraft ? 'Draft saved' : 'Record submitted');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not create the record. Please try again.');
      return;
    } finally {
      setSaving(false);
    }

    finishCreatedRecord(createdInfo);
  };

  const cat = form.category;

  if (createdRecordInfo) {
    return (
      <div className="bg-white border border-amber-200 shadow-sm rounded-xl p-5 sm:p-7 space-y-4 print:hidden" role="status">
        <div>
          <h3 className="text-base font-bold text-slate-900">Record created: {createdRecordInfo.referenceLabel}</h3>
          <p className="text-xs text-slate-600 mt-1">Record ID: <span className="font-mono font-bold">{createdRecordInfo.id}</span></p>
          <p className="text-xs text-amber-800 mt-2">The record is saved. Retry the remaining file uploads here; this will not create another record.</p>
        </div>
        <div className="space-y-2">
          {stagedAttachments.map(attachment => (
            <div key={attachment.id} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              <FileText className="w-4 h-4 text-[#1F3864] mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-slate-700 break-all">{attachment.file.name}</p>
                <p className={`text-[10px] font-semibold ${attachment.status === 'uploaded' ? 'text-emerald-700' : attachment.status === 'failed' ? 'text-red-600' : 'text-amber-700'}`}>
                  {attachment.status === 'uploaded' ? 'Uploaded' : attachment.status === 'uploading' ? 'Uploading…' : attachment.status === 'failed' ? `Upload failed: ${attachment.error ?? 'Please retry.'}` : 'Waiting to upload'}
                </p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={handleRetryAttachments} disabled={saving} className="px-5 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg disabled:opacity-50">
          {saving ? 'Uploading…' : 'Retry incomplete uploads'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 sm:p-7 space-y-6 print:hidden">
      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#0078C1]" />
            {categoryLocked ? `Create New ${cat} Record` : 'Create New Record'}
          </h3>
          <p className="text-[11.5px] text-slate-500 font-medium">{cat === 'RMA' ? 'Company Name, Priority, Area and Account Manager are required. Choose a movement method to submit; Logistics transport also needs a Delivery Date.' : 'Submit requires a company, reference and delivery date. Drafts may be incomplete.'}</p>
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

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 text-xs [&_label]:block">
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
            <select value={form.priority} onChange={e => updateField('priority', e.target.value)} aria-invalid={!!formErrors.priority} className={`w-full px-3 py-2 border rounded-lg bg-white ${formErrors.priority ? 'border-red-500' : 'border-slate-300'}`}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {formErrors.priority && <p className="text-red-500 text-[10px] font-semibold">{formErrors.priority}</p>}
          </div>

          {/* Reference * (not required when Draft) */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">
              {cat === 'RMA' ? 'Reference' : 'Reference (SAP Number)'}{cat !== 'RMA' && form.is_draft !== 'Yes' && <span className="text-red-500"> *</span>}{cat === 'RMA' && <span className="text-[10px] font-normal text-slate-400"> (optional)</span>}
            </label>
            <input type="text" value={form.reference} onChange={e => updateField('reference', e.target.value)}
              aria-invalid={!!formErrors.reference}
              placeholder={cat === 'RMA' ? 'Enter document reference (optional)' : 'e.g., SAP-88231'}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-hidden ${formErrors.reference ? 'border-red-500' : 'border-slate-300'}`} />
            {formErrors.reference && <p className="text-red-500 text-[10px] font-semibold">{formErrors.reference}</p>}
          </div>

          {cat === 'RMA' && <>
            <div className="space-y-1.5">
              <label htmlFor="create-rma-movement" className="font-bold text-slate-700">Movement method</label>
              <select id="create-rma-movement" value={form.rma_movement ?? ''} onChange={e => updateField('rma_movement', e.target.value as RecordFormState['rma_movement'])} aria-invalid={!!formErrors.rma_movement} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                <option value="">— Select before submitting —</option>
                <option value="LOGISTICS_TRANSPORT">Logistics transport</option>
                <option value="SUPPLIER_COLLECTION">Supplier collection</option>
                <option value="INTERNAL_NO_DRIVER">Internal / no driver</option>
              </select>
              {formErrors.rma_movement && <p role="alert" className="text-red-600 text-xs">{formErrors.rma_movement}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Category <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
              <select value={form.rma_type} onChange={e => updateField('rma_type', e.target.value as RecordFormState['rma_type'])} aria-invalid={!!formErrors.rma_type} className={`w-full px-3 py-2 border rounded-lg bg-white ${formErrors.rma_type ? 'border-red-500' : 'border-slate-300'}`}>
                <option value="">— Select —</option>
                {RMA_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              {formErrors.rma_type && <p className="text-red-500 text-[10px] font-semibold">{formErrors.rma_type}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Purchase Date <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
              <input type="date" value={form.purchase_date} onChange={e => updateField('purchase_date', e.target.value)} aria-invalid={!!formErrors.purchase_date} className={`w-full px-3 py-2 border rounded-lg ${formErrors.purchase_date ? 'border-red-500' : 'border-slate-300'}`} />
              {formErrors.purchase_date && <p className="text-red-500 text-[10px] font-semibold">{formErrors.purchase_date}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Customer Contact Name <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
              <input type="text" value={form.customer_contact_name} onChange={e => updateField('customer_contact_name', e.target.value)} aria-invalid={!!formErrors.customer_contact_name} className={`w-full px-3 py-2 border rounded-lg ${formErrors.customer_contact_name ? 'border-red-500' : 'border-slate-300'}`} />
              {formErrors.customer_contact_name && <p className="text-red-500 text-[10px] font-semibold">{formErrors.customer_contact_name}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Customer Contact Email <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
              <input type="email" value={form.customer_contact_email} onChange={e => updateField('customer_contact_email', e.target.value)} aria-invalid={!!formErrors.customer_contact_email} className={`w-full px-3 py-2 border rounded-lg ${formErrors.customer_contact_email ? 'border-red-500' : 'border-slate-300'}`} />
              {formErrors.customer_contact_email && <p className="text-red-500 text-[10px] font-semibold">{formErrors.customer_contact_email}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Customer Contact Phone <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
              <input type="tel" value={form.customer_contact_phone} onChange={e => updateField('customer_contact_phone', e.target.value)} aria-invalid={!!formErrors.customer_contact_email && !form.customer_contact_phone.trim()} className={`w-full px-3 py-2 border rounded-lg ${formErrors.customer_contact_email && !form.customer_contact_phone.trim() ? 'border-red-500' : 'border-slate-300'}`} />
            </div>
          </>}

          {/* ── OPTIONAL FIELDS ─────────────────────────────────────── */}

          {/* Area */}
          <ComboboxField
            label="Area"
            required={cat === 'RMA'}
            optional={cat !== 'RMA'}
            error={formErrors.area}
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
            required={cat === 'RMA'}
            optional={cat !== 'RMA'}
            error={formErrors.account_manager}
            options={ACCOUNT_MANAGERS as unknown as string[]}
            value={form.account_manager}
            onChange={v => updateField('account_manager', v)}
            placeholder="Type to search or scroll to browse..."
          />

          {/* Delivery Date */}
          <div className="space-y-1.5">
            <label htmlFor={deliveryDateId} className="font-bold text-slate-700">Delivery Date {(cat !== 'RMA' || form.rma_movement === 'LOGISTICS_TRANSPORT') && form.is_draft !== 'Yes' ? <span className="text-red-500">*</span> : <span className="text-[10px] font-normal text-slate-400">(optional)</span>}</label>
            <input id={deliveryDateId} type="date" value={form.delivery_date} onChange={e => updateField('delivery_date', e.target.value)}
              aria-invalid={!!formErrors.delivery_date}
              className={`w-full px-3 py-2 border rounded-lg ${formErrors.delivery_date ? 'border-red-500' : 'border-slate-300'}`} />
            {formErrors.delivery_date && <p className="text-red-500 text-[10px] font-semibold">{formErrors.delivery_date}</p>}
          </div>

          {/* Item Type */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Item Type <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <select value={form.item_type} onChange={e => updateField('item_type', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {(cat === 'RMA' ? RMA_ITEM_TYPES : ITEM_TYPES).map(it => <option key={it} value={it}>{it}</option>)}
            </select>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Remarks <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <textarea value={form.remarks} onChange={e => updateField('remarks', e.target.value)} rows={3}
              placeholder="Special instructions or notes..." className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          {/* Line Items */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex justify-between items-center mb-1.5">
              <label className="font-bold text-slate-700">Line Items <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
              <button
                type="button"
                onClick={() => updateField('line_items', [...(form.line_items || []), { sku: '', quantity: 1 }])}
                className="flex items-center gap-1 text-[11px] font-bold text-[#0078C1] hover:text-[#1F3864] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            {(form.line_items || []).map((item, index) => (
              <div key={index} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="SKU or Description"
                  value={item.sku}
                  onChange={(e) => {
                    const newItems = [...(form.line_items || [])];
                    newItems[index].sku = e.target.value;
                    updateField('line_items', newItems);
                  }}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const newItems = [...(form.line_items || [])];
                    newItems[index].quantity = parseInt(e.target.value) || 1;
                    updateField('line_items', newItems);
                  }}
                  className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newItems = (form.line_items || []).filter((_, i) => i !== index);
                    updateField('line_items', newItems);
                  }}
                  className="p-1 text-slate-400 hover:text-red-500 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {(!form.line_items || form.line_items.length === 0) && (
              <p className="text-[11px] text-slate-400 italic">No line items added. Use the description box above if preferred.</p>
            )}
          </div>

          {/* Document Attachments */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Document Attachments <span className="text-[10px] font-normal text-slate-400">(optional)</span></label>
            <div
              onClick={() => { if (access.canRecord(form.category, 'POD')) fileInputRef.current?.click(); }}
              className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all"
            >
              <UploadCloud className="w-8 h-8 text-slate-400" />
              <p className="font-bold text-slate-600">Click to select files</p>
              <p className="text-[10px] text-slate-400">PDF, JPG/JPEG, PNG, DOCX or XLSX — previewable without downloading, up to 10 MB each</p>
              <input type="file" disabled={!access.canRecord(form.category, 'POD')} ref={fileInputRef} onChange={handleFileSelect} accept={POD_ATTACHMENT_ACCEPT} multiple className="hidden" />
            </div>
            {stagedAttachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {stagedAttachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded px-2 py-1">
                    <FileText className="w-3.5 h-3.5 text-[#1F3864]" />
                    <span className="font-mono text-[10px] text-slate-700">{attachment.file.name}</span>
                    <span className="ml-auto text-[10px] text-slate-500">Ready to upload</span>
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
          <button type="submit" value="draft" disabled={saving || !access.canRecord(form.category, 'CREATE')} className="px-5 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-lg disabled:opacity-50">Save as Draft</button>
          <button type="submit" value="submit" disabled={saving || !access.canRecord(form.category, 'CREATE') || !access.canRecord(form.category, 'SUBMIT')} className="px-6 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg transition-colors text-[11px] uppercase flex items-center gap-1.5">
            <Check className="w-4 h-4" /> {saving ? "Saving…" : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
