import { CREATE_RECORD_LABEL } from '@/utils/navigationLabels';
import { manilaToday, submissionErrors } from '@/utils/recordLifecycle';
import React, { useId, useRef, useState } from 'react';
import { Plus, X, Check, FileText, UploadCloud, Wand2 } from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, DeliveryStatus, OutputActionConfig, OutputActionTrigger } from '@/types';
import { AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, ACCOUNT_MANAGERS } from '@/data';
import { runOutputActions } from '@/outputActions';
import { api, ApiCompany } from '@/api';
import OutputActionsPanel from '@/features/deliveries/OutputActionsPanel';
import ComboboxField from '@/components/ComboboxField';
import { POD_ATTACHMENT_ACCEPT, getPodAttachmentRejection } from '@/utils/attachmentValidation';
import { selectDemoLocation } from '@/utils/demoLocations';
import { notify } from '@/utils/notify';
import { Button, IconButton, Field, Input, Select, Textarea, Card } from '@/components/ui';
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
  'RMA': 'SAP-RMA',
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
  const deliveryDateId = useId();
  const [form, setForm] = useState<RecordFormState>(() => buildEmptyForm(category));
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stagedAttachments, setStagedAttachments] = useState<StagedRecordAttachment[]>([]);
  const [createdRecordInfo, setCreatedRecordInfo] = useState<{ id: string; referenceLabel: string; lines: string[]; isDraft: boolean } | null>(null);
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
    setForm({
      company_name: company.name,
      company_id: company.id,
      address: location.address,
      priority: afPick(PRIORITIES),
      reference: `${AF_REF_PREFIX[cat] ?? 'SAP'}-${afRandInt(10000, 99999)}`,
      remarks: afPick(AF_REMARKS[cat] ?? ['']),
      status: 'Scheduled',
      vehicle: afPick(VEHICLES),
      area: location.area,
      account_manager: afPick(ACCOUNT_MANAGERS),
      delivery_date: deliveryDate,
      category: cat,
      item_type: afPick(ITEM_TYPES),
      is_draft: 'No',
      item_description: afPick(AF_ITEMS[cat] ?? ['(sample item)']),
      line_items: [{ sku: afPick(AF_ITEMS[cat] ?? ['Sample SKU']), quantity: afRandInt(1, 10) }],
      attachments: [],
    });
    setFormErrors({});
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    const errors = submissionErrors(form, isDraft);

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      requestAnimationFrame(() => {
        const firstInvalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        firstInvalid?.focus();
        firstInvalid?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    setFormErrors({});

    let outputActionLog: any[] = [];
    let bannerLines: string[] = [];

    setSaving(true);
    let createdRecord: DeliveryRecord;
    let createdInfo: { id: string; referenceLabel: string; lines: string[]; isDraft: boolean };
    try {
      if (!isDraft && outputActionConfigs) {
        const creationOutput = await runOutputActions('Record Created', outputActionConfigs['Record Created'], { amName: form.account_manager });
        outputActionLog = creationOutput.newEntries;
        bannerLines = creationOutput.banners.length > 0
          ? creationOutput.banners
          : creationOutput.newEntries.map((entry: any) => entry.message);
      }

      createdRecord = await onSubmit({
        ...form,
        driver: '',
        driver_assistants: [],
        category: form.category,
        priority: form.priority as DeliveryRecord['priority'],
        status: isDraft ? 'Draft' : 'Scheduled',
        item_type: form.item_type as DeliveryRecord['item_type'],
        is_draft: isDraft ? 'Yes' : 'No',
        attachments: [],
        output_actions_log: outputActionLog,
      });
      createdInfo = {
        id: createdRecord.id,
        referenceLabel: form.reference || form.company_name,
        lines: bannerLines,
        isDraft,
      };
      setCreatedRecordInfo(createdInfo);

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
      <Card className="border-amber-200 p-5 sm:p-7 space-y-4 print:hidden" role="status">
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
        <Button type="button" onClick={handleRetryAttachments} loading={saving}>
          {saving ? 'Uploading…' : 'Retry incomplete uploads'}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7 space-y-6 print:hidden">
      <div className="border-b border-slate-100 pb-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#0078C1]" />
            {categoryLocked ? `Create ${cat} Record` : CREATE_RECORD_LABEL}
          </h3>
          <p className="text-sm text-slate-600">Submit requires a company, SAP reference, and delivery date. Save as Draft requires a company.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          <Button type="button" variant="secondary" onClick={handleAutoFill}>
            <Wand2 aria-hidden="true" className="w-4 h-4" /> Auto Fill
          </Button>
          <IconButton label="Close create record form" onClick={onCancel}>
            <X aria-hidden="true" className="w-5 h-5" />
          </IconButton>
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* ── REQUIRED FIELDS ─────────────────────────────────────── */}

          {/* Order Type — only shown when categoryLocked=false */}
          {!categoryLocked && (
            <Field id="record-create-category" label="Order Type" required className="md:col-span-2">
              {control => <Select {...control} value={cat} onChange={e => handleCategoryChange(e.target.value as DeliveryCategory)}>
                {(availableCategories ?? []).map(c => <option key={c} value={c}>{c}</option>)}
              </Select>}
            </Field>
          )}

          {/* Company Name * */}
          <ComboboxField
            id="record-create-company"
            label="Company Name"
            required
            options={companies.map(c => c.name)}
            value={form.company_name}
            onChange={handleCompanySelect}
            placeholder="Type to search or scroll to browse..."
            error={formErrors.company_name}
          />

          {/* Priority * */}
          <Field id="record-create-priority" label="Priority" required>
            {control => <Select {...control} value={form.priority} onChange={e => updateField('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>}
          </Field>

          <Field id="record-create-reference" label="Reference (SAP Number)" required={form.is_draft !== 'Yes'} description="Required to submit; optional for drafts." error={formErrors.reference} className="md:col-span-2">
            {control => <Input {...control} type="text" value={form.reference} onChange={e => updateField('reference', e.target.value)} placeholder="e.g., SAP-88231" />}
          </Field>

          {/* ── OPTIONAL FIELDS ─────────────────────────────────────── */}

          {/* Area */}
          <ComboboxField
            id="record-create-area"
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
          <Field id="record-create-address" label="Address" description="Optional street, building, floor, or additional location detail." className="md:col-span-2">
            {control => <Input {...control} type="text" value={form.address} onChange={e => updateField('address', e.target.value)} placeholder="Street, building, floor, or additional location detail (optional)" />}
          </Field>

          {/* Account Manager */}
          <ComboboxField
            id="record-create-account-manager"
            label="Account Manager"
            optional
            options={ACCOUNT_MANAGERS as unknown as string[]}
            value={form.account_manager}
            onChange={v => updateField('account_manager', v)}
            placeholder="Type to search or scroll to browse..."
          />

          {/* Delivery Date */}
          <Field id={deliveryDateId} label="Delivery Date" description="Required to submit; optional for drafts." error={formErrors.delivery_date}>
            {control => <Input {...control} type="date" value={form.delivery_date} onChange={e => updateField('delivery_date', e.target.value)} />}
          </Field>

          <Field id="record-create-item-type" label="Item Type" description="Optional.">
            {control => <Select {...control} value={form.item_type} onChange={e => updateField('item_type', e.target.value)}>
              {ITEM_TYPES.map(it => <option key={it} value={it}>{it}</option>)}
            </Select>}
          </Field>

          <Field id="record-create-remarks" label="Remarks" description="Optional special instructions or notes." className="md:col-span-2">
            {control => <Textarea {...control} value={form.remarks} onChange={e => updateField('remarks', e.target.value)} rows={3} placeholder="Special instructions or notes..." />}
          </Field>

          {/* Line Items */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex justify-between items-center mb-1.5">
              <h4 className="font-semibold text-slate-700">Line Items <span className="font-normal text-slate-500">(optional)</span></h4>
              <Button type="button" variant="ghost" onClick={() => updateField('line_items', [...(form.line_items || []), { sku: '', quantity: 1 }])}>
                <Plus aria-hidden="true" className="w-4 h-4" /> Add Item
              </Button>
            </div>
            {(form.line_items || []).map((item, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2 mb-2">
                <Field id={`record-create-item-${index}-sku`} label={`Item ${index + 1} SKU or description`} className="min-w-0 flex-1">
                {control => <Input {...control}
                  type="text"
                  placeholder="SKU or Description"
                  value={item.sku}
                  onChange={(e) => {
                    const newItems = [...(form.line_items || [])];
                    newItems[index].sku = e.target.value;
                    updateField('line_items', newItems);
                  }}
                />}
                </Field>
                <Field id={`record-create-item-${index}-quantity`} label={`Item ${index + 1} quantity`} className="w-24">
                {control => <Input {...control}
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const newItems = [...(form.line_items || [])];
                    newItems[index].quantity = parseInt(e.target.value) || 1;
                    updateField('line_items', newItems);
                  }}
                />}
                </Field>
                <IconButton label={`Remove item ${index + 1}`}
                  type="button"
                  onClick={() => {
                    const newItems = (form.line_items || []).filter((_, i) => i !== index);
                    updateField('line_items', newItems);
                  }}
                  className="shrink-0"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
            {(!form.line_items || form.line_items.length === 0) && (
              <p className="text-[11px] text-slate-400 italic">No line items added. Use the description box above if preferred.</p>
            )}
          </div>

          {/* Document Attachments */}
          <Field id="record-create-attachments" label="Document Attachments" description="Optional. PDF, JPG/JPEG, PNG, DOC or DOCX up to 10 MB each." className="md:col-span-2">
            {control => <div className="space-y-2">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 flex flex-col items-center justify-center gap-2 bg-slate-50/50">
              <UploadCloud aria-hidden="true" className="w-8 h-8 text-slate-500" />
              <Input {...control} type="file" onChange={handleFileSelect} accept={POD_ATTACHMENT_ACCEPT} multiple
                className="block max-w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:font-semibold file:text-blue-800" />
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
            </div>}
          </Field>
        </div>

        {/* IPO configurable output actions — only when outputActionConfigs is provided */}
        {outputActionConfigs && onUpdateOutputActionConfig && (
          <OutputActionsPanel
            trigger="Record Created"
            config={outputActionConfigs['Record Created']}
            onChange={patch => onUpdateOutputActionConfig('Record Created', patch)}
          />
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="secondary" value="draft" disabled={saving}>Save as Draft</Button>
          <Button type="submit" value="submit" loading={saving}>
            <Check aria-hidden="true" className="w-4 h-4" /> {saving ? "Saving…" : "Submit"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
