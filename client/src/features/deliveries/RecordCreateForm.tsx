import { manilaToday, submissionErrors } from '@/utils/recordLifecycle';
import { usePermissions } from '@/hooks/usePermissions';
import React, { useId, useRef, useState } from 'react';
import { Plus, X, Check, FileText, UploadCloud, Wand2 } from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, DeliveryStatus, OutputActionConfig, OutputActionTrigger, type RecordLineItem, type RmaContact } from '@/types';
import { AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, RMA_ITEM_TYPES } from '@/data';
import { accountManagerChoices, useAccountManagersQuery } from '@/api/queries/useAccountManagersQuery';
import { accountManagerAfterCompanyChange, accountManagerOptionGroups, activeCompanies, companyAccountManagers, companySapNumbers, isListedAccountManager,
  preferredAccountManagerFor } from '@/utils/accountDirectory';
import CompanySapQuickPick from '@/components/CompanySapQuickPick';
import { RECEIVING_SLIP_CATEGORY, RMA_CATEGORIES, TRANSFER_OUT_CATEGORY, autoFillRmaFields, formatRmaCategoryOption, isReturnToCustomerCategory, previewRmaReference, type RmaCategory } from '@/utils/rma';
import { RmaContactsEditor, cleanRmaContacts } from './RmaContactsEditor';
import { RmaStructuredItemsEditor, cleanRmaItems } from './RmaStructuredItemsEditor';
import { RMA_STATUS_TAG_PRESETS } from '@/utils/rmaItems';
import { runOutputActions } from '@/outputActions';
import { exportRecordOutputPDF } from '@/utils/recordOutputPdf';
import { api, ApiCompany } from '@/api';
import OutputActionsPanel from '@/features/deliveries/OutputActionsPanel';
import ComboboxField from '@/components/ComboboxField';
import { POD_ATTACHMENT_ACCEPT, getPodAttachmentRejection } from '@/utils/attachmentValidation';
import { selectDemoLocation } from '@/utils/demoLocations';
import { notify } from '@/utils/notify';
import { uploadPendingRecordAttachments, type StagedRecordAttachment } from '@/utils/recordAttachments';
import { recordLabel } from '../../utils/recordLabel';

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
  is_internal_transfer: boolean;
  purchase_date: string;
  customer_contact_name: string;
  customer_contact_email: string;
  customer_contact_phone: string;
  case_number: string;
  service_slip_no: string;
  client_remarks: string;
  internal_logistics_remarks: string;
  rma_contacts: RmaContact[];
  item_description: string;
  line_items: RecordLineItem[];
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
  is_internal_transfer: false,
  purchase_date: '',
  customer_contact_name: '',
  customer_contact_email: '',
  customer_contact_phone: '',
  case_number: '',
  service_slip_no: '',
  client_remarks: '',
  internal_logistics_remarks: '',
  rma_contacts: [],
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
  onAfterSubmit?: (bannerData: { recordId: string; recordNo: string; referenceLabel: string; lines: string[] }) => void;
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
  const accountManagers = useAccountManagersQuery();
  const amOptions = accountManagerChoices(accountManagers.data);
  const companyOptions = activeCompanies(companies);
  const [form, setForm] = useState<RecordFormState>(() => buildEmptyForm(category));
  const selectedCompany = form.company_id ? companies.find(c => c.id === form.company_id) : undefined;
  const selectedCompanyAms = companyAccountManagers(selectedCompany, accountManagers.data);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stagedAttachments, setStagedAttachments] = useState<StagedRecordAttachment[]>([]);
  const [createdRecordInfo, setCreatedRecordInfo] = useState<{ id: string; recordNo: string; referenceLabel: string; lines: string[]; isDraft: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const updateField = <K extends keyof RecordFormState>(key: K, value: RecordFormState[K]) => {
    setFormErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Category decides the slip prefix. Walk-in Receiving Slips default to Internal / no driver;
  // only Transfer Out Slips can be non-RMA internal transfers.
  const updateRmaCategory = (value: RecordFormState['rma_type']) => {
    setFormErrors(prev => { const n = { ...prev }; delete n.rma_type; delete n.is_internal_transfer; return n; });
    setForm(prev => ({
      ...prev,
      rma_type: value,
      // SS# only exists on Return to Customer Slips; switching away clears it.
      service_slip_no: isReturnToCustomerCategory(value) ? prev.service_slip_no : '',
      is_internal_transfer: value === TRANSFER_OUT_CATEGORY ? prev.is_internal_transfer : false,
      rma_movement: value === RECEIVING_SLIP_CATEGORY && !prev.rma_movement ? 'INTERNAL_NO_DRIVER' : prev.rma_movement,
    }));
  };
  const updateInternalTransfer = (checked: boolean) => {
    setFormErrors(prev => { const n = { ...prev }; delete n.is_internal_transfer; delete n.rma_movement; return n; });
    setForm(prev => ({ ...prev, is_internal_transfer: checked, rma_movement: checked && prev.rma_movement === 'SUPPLIER_COLLECTION' ? '' : prev.rma_movement }));
  };

  const handleCategoryChange = (cat: DeliveryCategory) => {
    setForm(prev => ({ ...buildEmptyForm(cat), company_name: prev.company_name, company_id: prev.company_id }));
    setFormErrors({});
    onCategoryChange?.(cat);
  };

  const handleAutoFill = () => {
    if (companyOptions.length === 0) return;
    const cat = form.category;
    const company = afPick(companyOptions);
    const location = selectDemoLocation();
    const deliveryDate = afFutureDate(1, 14);
    const rmaFields = cat === 'RMA' ? autoFillRmaFields(form.reference, afRandInt(0, RMA_CATEGORIES.length - 1)) : null;
    setForm({
      company_name: company.name,
      company_id: company.id,
      address: location.address,
      priority: afPick(PRIORITIES),
      reference: rmaFields ? rmaFields.reference : companySapNumbers(company)[0] ?? `${AF_REF_PREFIX[cat] ?? 'SAP'}-${afRandInt(10000, 99999)}`,
      remarks: afPick(AF_REMARKS[cat] ?? ['']),
      status: 'Scheduled',
      vehicle: afPick(VEHICLES),
      area: location.area,
      account_manager: preferredAccountManagerFor(company, accountManagers.data) || (amOptions.length ? afPick(amOptions) : ''),
      delivery_date: deliveryDate,
      category: cat,
      item_type: cat === 'RMA' ? afPick(RMA_ITEM_TYPES) : afPick(ITEM_TYPES),
      is_draft: 'No',
      rma_type: rmaFields?.rma_type ?? '',
      rma_movement: '', // Auto Fill leaves movement for the user to choose explicitly
      is_internal_transfer: false,
      purchase_date: '',
      customer_contact_name: company.contact_person ?? '',
      customer_contact_email: '',
      customer_contact_phone: '',
      case_number: cat === 'RMA' ? `CAS-${afRandInt(10000, 99999)}-${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')}` : '',
      service_slip_no: cat === 'RMA' && isReturnToCustomerCategory(rmaFields?.rma_type) ? `SS#${afRandInt(60000, 69999)}` : '',
      client_remarks: cat === 'RMA' ? `SAP#${afRandInt(12000000, 12999999)}` : '',
      internal_logistics_remarks: cat === 'RMA' ? afPick(['Call before going.', 'Note: with collection of Php2,000.00 cash. Please bring CR.', 'Coordinate with building admin for gate pass.']) : '',
      rma_contacts: cat === 'RMA' ? [{ name: company.contact_person || 'Store Contact', phone: `+63917${afRandInt(1000000, 9999999)}`, email: '' }] : [],
      item_description: afPick(AF_ITEMS[cat] ?? ['(sample item)']),
      line_items: cat === 'RMA'
        ? [{ sku: afPick(AF_ITEMS[cat] ?? ['Sample unit']), quantity: 1, unit_type: 'Unit', serial_number: `SN-${afRandInt(100000, 999999)}`,
            purchase_date: afFutureDate(-365, -30), sales_order_no: String(afRandInt(12000000, 12999999)), accessories: 'Power Adaptor',
            problem_description: 'No Display Upon Startup', status_tag: afPick(RMA_STATUS_TAG_PRESETS) }]
        : [{ sku: afPick(AF_ITEMS[cat] ?? ['Sample SKU']), quantity: afRandInt(1, 10) }],
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
    const company = companyOptions.find(c => c.name === name);
    setForm(prev => {
      // Fill the company's single AM unless the user already picked a different one.
      const account_manager = accountManagerAfterCompanyChange(prev.account_manager, companies.find(c => c.id === prev.company_id), company, accountManagers.data);
      return { ...prev, company_name: name, company_id: company?.id || '', account_manager };
    });
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
    onAfterSubmit?.({ recordId: info.id, recordNo: info.recordNo, referenceLabel: info.referenceLabel, lines: info.lines });
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
        notify.error(`Record ${createdRecordInfo.recordNo} is saved. Some attachments still need to be uploaded; retry them here.`);
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
    const isRmaForm = form.category === 'RMA';
    const rmaItems = isRmaForm ? cleanRmaItems(form.line_items) : form.line_items;
    const rmaContacts = isRmaForm ? cleanRmaContacts(form.rma_contacts) : [];
    const errors = submissionErrors({ ...form, line_items: rmaItems, rma_contacts: rmaContacts }, isDraft);
    if (accountManagers.isSuccess && form.account_manager.trim() && !isListedAccountManager(form.account_manager, accountManagers.data)) {
      errors.account_manager = 'Choose an Account Manager from the list.';
    }

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
    let createdInfo: { id: string; recordNo: string; referenceLabel: string; lines: string[]; isDraft: boolean };
    try {
      createdRecord = await onSubmit({
        ...form,
        reference: form.category === 'RMA' ? '' : form.reference,
        // The server allocates the RMA slip reference on save; it is never sent from the form.
        rma_reference: null,
        rma_type: form.category === 'RMA' && form.rma_type ? form.rma_type : null,
        rma_movement: form.category === 'RMA' && form.rma_movement ? form.rma_movement : null,
        is_internal_transfer: form.category === 'RMA' && form.rma_type === TRANSFER_OUT_CATEGORY && form.is_internal_transfer,
        driver: '',
        driver_assistants: [],
        category: form.category,
        priority: form.priority as DeliveryRecord['priority'],
        status: isDraft ? 'Draft' : 'Scheduled',
        item_type: form.item_type as DeliveryRecord['item_type'],
        is_draft: isDraft ? 'Yes' : 'No',
        attachments: [],
        output_actions_log: [],
        // RMA slip fields; the separated remarks never reuse the workflow remarks column.
        ...(isRmaForm ? {
          remarks: '',
          case_number: form.case_number.trim() || null,
          service_slip_no: isReturnToCustomerCategory(form.rma_type) ? form.service_slip_no.trim() || null : null,
          client_remarks: form.client_remarks.trim() || null,
          internal_logistics_remarks: form.internal_logistics_remarks.trim() || null,
          rma_contacts: rmaContacts,
          line_items: rmaItems,
        } : { case_number: undefined, service_slip_no: undefined, client_remarks: undefined, internal_logistics_remarks: undefined, rma_contacts: undefined }),
      });
      // Retain the saved identity before any optional output can fail.
      createdInfo = {
        id: createdRecord.id,
        recordNo: recordLabel(createdRecord),
        referenceLabel: (form.category === 'RMA' ? createdRecord.rma_reference : form.reference) || form.company_name,
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
          if (output.email.failed || output.pdf === 'failed') notify.error(`Record ${recordLabel(createdRecord)} is saved. ${output.banners.join(' ')}`);
        } catch (error) {
          bannerLines = [`Additional outputs could not finish: ${error instanceof Error ? error.message : 'Please check notification status.'}`];
          notify.error(`Record ${recordLabel(createdRecord)} is saved. ${bannerLines[0]}`);
        }
        createdInfo = { ...createdInfo, lines: bannerLines };
        setCreatedRecordInfo(createdInfo);
      }

      const allUploaded = await uploadAttachments(createdRecord.id);
      if (!allUploaded) {
        notify.error(`Record ${recordLabel(createdRecord)} was created. Some attachments still need to be uploaded; retry them below.`);
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
          <p className="text-xs text-slate-600 mt-1">Record No.: <span className="tabular-nums font-bold">{createdRecordInfo.recordNo}</span></p>
          <p className="text-xs text-amber-800 mt-2">The record is saved. Retry the remaining file uploads here; this will not create another record.</p>
        </div>
        <div className="space-y-2">
          {stagedAttachments.map(attachment => (
            <div key={attachment.id} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              <FileText className="w-4 h-4 text-brand-navy mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="tabular-nums text-xs text-slate-700 break-all">{attachment.file.name}</p>
                <p className={`text-xs font-semibold ${attachment.status === 'uploaded' ? 'text-emerald-700' : attachment.status === 'failed' ? 'text-red-600' : 'text-amber-700'}`}>
                  {attachment.status === 'uploaded' ? 'Uploaded' : attachment.status === 'uploading' ? 'Uploading…' : attachment.status === 'failed' ? `Upload failed: ${attachment.error ?? 'Please retry.'}` : 'Waiting to upload'}
                </p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={handleRetryAttachments} disabled={saving} className="px-5 py-2.5 bg-brand-blue hover:bg-brand-navy text-white font-bold rounded-lg disabled:opacity-50">
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
            <Plus className="w-5 h-5 text-brand-blue" />
            {categoryLocked ? `Create New ${cat} Record` : 'Create New Record'}
          </h3>
          <p className="text-xs text-slate-500 font-medium">{cat === 'RMA' ? 'Category, Company Name, Priority, Area and Account Manager are required; the slip reference is generated on save. Choose a movement method to submit; Logistics transport also needs a Delivery Date.' : 'Submit requires a company, reference and delivery date. Drafts may be incomplete.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoFill}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors cursor-pointer"
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
            options={companyOptions.map(c => c.name)}
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
            {formErrors.priority && <p className="text-red-500 text-xs font-semibold">{formErrors.priority}</p>}
          </div>

          {cat === 'RMA' && <>
            <div className="space-y-1.5">
              <label htmlFor="create-rma-type" className="font-bold text-slate-700">Category <span className="text-red-500">*</span></label>
              <select id="create-rma-type" value={form.rma_type} onChange={e => updateRmaCategory(e.target.value as RecordFormState['rma_type'])} aria-invalid={!!formErrors.rma_type} aria-required="true" className={`w-full px-3 py-2 border rounded-lg bg-white ${formErrors.rma_type ? 'border-red-500' : 'border-slate-300'}`}>
                <option value="">— Select a slip category —</option>
                {RMA_CATEGORIES.map(value => <option key={value} value={value}>{formatRmaCategoryOption(value)}</option>)}
              </select>
              {formErrors.rma_type && <p className="text-red-500 text-xs font-semibold">{formErrors.rma_type}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="create-rma-reference" className="font-bold text-slate-700">RMA Document Reference</label>
              <input id="create-rma-reference" type="text" readOnly aria-readonly="true" tabIndex={-1}
                value={form.rma_type ? `Auto-generated on save (${previewRmaReference(form.rma_type)})` : 'Select a category first — auto-generated on save'}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed" />
              <p className="text-xs text-slate-500">Numbered per category and Manila date when you Save or Save as Draft; it cannot be edited.</p>
            </div>
            {form.rma_type === TRANSFER_OUT_CATEGORY && (
              <div className="md:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <input id="create-rma-internal-transfer" type="checkbox" checked={form.is_internal_transfer} onChange={e => updateInternalTransfer(e.target.checked)} aria-invalid={!!formErrors.is_internal_transfer} className="mt-1" />
                <label htmlFor="create-rma-internal-transfer" className="text-sm text-slate-700">
                  <span className="font-bold">Non-RMA Internal Transfer</span>
                  <span className="block text-xs text-slate-600">For units moved for internal work (e.g. testing or configuration). Logistics still routes it and assigns a Driver, but it is left out of RMA KPIs and reports.</span>
                </label>
                {formErrors.is_internal_transfer && <p className="text-red-500 text-xs font-semibold">{formErrors.is_internal_transfer}</p>}
              </div>
            )}
          </>}

          {/* Reference * (not required when Draft) */}
          {cat !== 'RMA' && <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">
              Reference (SAP Number){form.is_draft !== 'Yes' && <span className="text-red-500"> *</span>}
            </label>
            <input type="text" value={form.reference} onChange={e => updateField('reference', e.target.value)}
              aria-invalid={!!formErrors.reference}
              placeholder="e.g., SAP-88231"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 ${formErrors.reference ? 'border-red-500' : 'border-slate-300'}`} />
            <CompanySapQuickPick sapNumbers={companySapNumbers(selectedCompany)} value={form.reference} onPick={sap => updateField('reference', sap)} />
            {formErrors.reference && <p className="text-red-500 text-xs font-semibold">{formErrors.reference}</p>}
          </div>}

          {cat === 'RMA' && <>
            <div className="space-y-1.5">
              <label htmlFor="create-rma-movement" className="font-bold text-slate-700">Movement method</label>
              <select id="create-rma-movement" value={form.rma_movement ?? ''} onChange={e => updateField('rma_movement', e.target.value as RecordFormState['rma_movement'])} aria-invalid={!!formErrors.rma_movement} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                <option value="">— Select before submitting —</option>
                <option value="LOGISTICS_TRANSPORT">Logistics transport</option>
                <option value="SUPPLIER_COLLECTION" disabled={form.is_internal_transfer}>Supplier collection</option>
                <option value="INTERNAL_NO_DRIVER">Internal / no driver</option>
              </select>
              {form.rma_type === RECEIVING_SLIP_CATEGORY && form.rma_movement === 'INTERNAL_NO_DRIVER' && <p className="text-xs text-slate-500">Walk-in Receiving Slips default to Internal / no driver; change it if Logistics should route this one.</p>}
              {formErrors.rma_movement && <p role="alert" className="text-red-600 text-xs">{formErrors.rma_movement}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Purchase Date <span className="text-xs font-normal text-slate-400">(optional)</span></label>
              <input type="date" value={form.purchase_date} onChange={e => updateField('purchase_date', e.target.value)} aria-invalid={!!formErrors.purchase_date} className={`w-full px-3 py-2 border rounded-lg ${formErrors.purchase_date ? 'border-red-500' : 'border-slate-300'}`} />
              {formErrors.purchase_date && <p className="text-red-500 text-xs font-semibold">{formErrors.purchase_date}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="create-rma-case-number" className="font-bold text-slate-700">Case Number <span className="text-xs font-normal text-slate-400">(optional)</span></label>
              <input id="create-rma-case-number" type="text" value={form.case_number} onChange={e => updateField('case_number', e.target.value)} maxLength={80}
                placeholder="e.g., CAS-31417-Y4Y6Z3" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            {isReturnToCustomerCategory(form.rma_type) && (
              <div className="space-y-1.5">
                <label htmlFor="create-rma-service-slip" className="font-bold text-slate-700">Service Slip (SS#) <span className="text-xs font-normal text-slate-400">(optional · RTC only)</span></label>
                <input id="create-rma-service-slip" type="text" value={form.service_slip_no} onChange={e => updateField('service_slip_no', e.target.value)} maxLength={60}
                  placeholder="e.g., SS#60142" aria-invalid={!!formErrors.service_slip_no}
                  className={`w-full px-3 py-2 border rounded-lg ${formErrors.service_slip_no ? 'border-red-500' : 'border-slate-300'}`} />
                {formErrors.service_slip_no && <p className="text-red-500 text-xs font-semibold">{formErrors.service_slip_no}</p>}
              </div>
            )}
            <RmaContactsEditor idPrefix="create-rma-contact" contacts={form.rma_contacts} onChange={contacts => updateField('rma_contacts', contacts)} error={formErrors.rma_contacts} />
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
            <label className="font-bold text-slate-700">Address <span className="text-xs font-normal text-slate-400">(optional)</span></label>
            <input
              type="text"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder="Street, building, floor, or additional location detail (optional)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
          </div>

          {/* Account Manager */}
          <ComboboxField
            label="Account Manager"
            required={cat === 'RMA'}
            optional={cat !== 'RMA'}
            error={formErrors.account_manager}
            options={amOptions}
            optionGroups={accountManagerOptionGroups(selectedCompany, amOptions, accountManagers.data)}
            value={form.account_manager}
            onChange={v => updateField('account_manager', v)}
            placeholder="Type to search or scroll to browse..."
          />
          {selectedCompany && selectedCompanyAms.length > 1 && (
            <p className="-mt-2 text-xs text-slate-500 md:col-span-2">
              Assigned Account Managers for {selectedCompany.name}: {selectedCompanyAms.join(', ')} — choose one or override.
            </p>
          )}

          {/* Delivery Date */}
          <div className="space-y-1.5">
            <label htmlFor={deliveryDateId} className="font-bold text-slate-700">Delivery Date {(cat !== 'RMA' || form.rma_movement === 'LOGISTICS_TRANSPORT') && form.is_draft !== 'Yes' ? <span className="text-red-500">*</span> : <span className="text-xs font-normal text-slate-400">(optional)</span>}</label>
            <input id={deliveryDateId} type="date" value={form.delivery_date} onChange={e => updateField('delivery_date', e.target.value)}
              aria-invalid={!!formErrors.delivery_date}
              className={`w-full px-3 py-2 border rounded-lg ${formErrors.delivery_date ? 'border-red-500' : 'border-slate-300'}`} />
            {formErrors.delivery_date && <p className="text-red-500 text-xs font-semibold">{formErrors.delivery_date}</p>}
          </div>

          {/* Item Type */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Item Type <span className="text-xs font-normal text-slate-400">(optional)</span></label>
            <select value={form.item_type} onChange={e => updateField('item_type', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {(cat === 'RMA' ? RMA_ITEM_TYPES : ITEM_TYPES).map(it => <option key={it} value={it}>{it}</option>)}
            </select>
          </div>

          {/* Remarks — RMA keeps client slip remarks and internal Logistics notes apart */}
          {cat === 'RMA' ? <>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="create-rma-client-remarks" className="font-bold text-slate-700 flex flex-wrap items-center gap-2">
                Client Slip Remarks <span className="text-xs font-normal text-slate-400">(optional)</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Printed on client slip</span>
              </label>
              <textarea id="create-rma-client-remarks" value={form.client_remarks} onChange={e => updateField('client_remarks', e.target.value)} rows={2} maxLength={2000}
                placeholder="e.g., SAP#12019325" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="create-rma-internal-logistics-remarks" className="font-bold text-slate-700 flex flex-wrap items-center gap-2">
                Internal Logistics Notes <span className="text-xs font-normal text-slate-400">(optional)</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Internal · Logistics only — never printed on client slips</span>
              </label>
              <textarea id="create-rma-internal-logistics-remarks" value={form.internal_logistics_remarks} onChange={e => updateField('internal_logistics_remarks', e.target.value)} rows={2} maxLength={2000}
                placeholder="e.g., Note: with collection of Php2,000.00 cash. Please bring CR." className="w-full px-3 py-2 border border-amber-300 bg-amber-50/40 rounded-lg" />
            </div>
          </> : (
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Remarks <span className="text-xs font-normal text-slate-400">(optional)</span></label>
            <textarea value={form.remarks} onChange={e => updateField('remarks', e.target.value)} rows={3}
              placeholder="Special instructions or notes..." className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          )}

          {/* Line Items */}
          {cat === 'RMA' ? (
            <RmaStructuredItemsEditor idPrefix="create-rma-item" items={form.line_items} onChange={items => updateField('line_items', items)} error={formErrors.line_items} />
          ) : (
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex justify-between items-center mb-1.5">
              <label className="font-bold text-slate-700">Line Items <span className="text-xs font-normal text-slate-400">(optional)</span></label>
              <button
                type="button"
                onClick={() => updateField('line_items', [...(form.line_items || []), { sku: '', quantity: 1 }])}
                className="flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-brand-navy cursor-pointer"
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
              <p className="text-xs text-slate-400 italic">No line items added. Use the description box above if preferred.</p>
            )}
          </div>
          )}

          {/* Document Attachments */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="font-bold text-slate-700">Document Attachments <span className="text-xs font-normal text-slate-400">(optional)</span></label>
            <div
              onClick={() => { if (access.canRecord(form.category, 'POD')) fileInputRef.current?.click(); }}
              className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all"
            >
              <UploadCloud className="w-8 h-8 text-slate-400" />
              <p className="font-bold text-slate-600">Click to select files</p>
              <p className="text-xs text-slate-400">PDF, JPG/JPEG, PNG, DOCX or XLSX — previewable without downloading, up to 10 MB each</p>
              <input type="file" disabled={!access.canRecord(form.category, 'POD')} ref={fileInputRef} onChange={handleFileSelect} accept={POD_ATTACHMENT_ACCEPT} multiple className="hidden" />
            </div>
            {stagedAttachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {stagedAttachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded px-2 py-1">
                    <FileText className="w-3.5 h-3.5 text-brand-navy" />
                    <span className="tabular-nums text-xs text-slate-700">{attachment.file.name}</span>
                    <span className="ml-auto text-xs text-slate-500">Ready to upload</span>
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
          <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-xs uppercase">
            Cancel
          </button>
          <button type="submit" value="draft" disabled={saving || !access.canRecord(form.category, 'CREATE')} className="px-5 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-lg disabled:opacity-50">Save as Draft</button>
          <button type="submit" value="submit" disabled={saving || !access.canRecord(form.category, 'CREATE') || !access.canRecord(form.category, 'SUBMIT')} className="px-6 py-2.5 bg-brand-blue hover:bg-brand-navy text-white font-bold rounded-lg transition-colors text-xs uppercase flex items-center gap-1.5">
            <Check className="w-4 h-4" /> {saving ? "Saving…" : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
