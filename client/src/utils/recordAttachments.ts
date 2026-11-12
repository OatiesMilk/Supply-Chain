export type AttachmentUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface StagedRecordAttachment {
  id: string;
  file: File;
  status: AttachmentUploadStatus;
  error?: string;
}

export interface StoredRecordAttachment {
  name: string;
  mime_type: string;
  size: number;
}

export interface AttachmentUploadApi {
  getRecordAttachments: (recordId: string) => Promise<readonly StoredRecordAttachment[]>;
  uploadRecordAttachment: (recordId: string, file: File) => Promise<unknown>;
}

export interface AttachmentUploadCandidate {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: AttachmentUploadStatus;
}

export interface AttachmentUploadPlan {
  alreadyStoredIds: string[];
  pendingIds: string[];
}

function identity(name: string, mimeType: string, size: number): string {
  return JSON.stringify([name, mimeType, size]);
}

export function planRecordAttachmentUploads(
  staged: readonly AttachmentUploadCandidate[],
  stored: readonly StoredRecordAttachment[],
): AttachmentUploadPlan {
  const counts = new Map<string, number>();
  for (const attachment of stored) {
    const key = identity(attachment.name, attachment.mime_type, attachment.size);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const consume = (key: string) => {
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    if (count === 1) counts.delete(key);
    else counts.set(key, count - 1);
    return true;
  };

  const alreadyStoredIds: string[] = [];
  const pendingIds: string[] = [];

  // Successful uploads from earlier attempts account for their server copies.
  for (const candidate of staged) {
    const key = identity(candidate.name, candidate.mimeType, candidate.size);
    if (candidate.status === 'uploaded') {
      alreadyStoredIds.push(candidate.id);
      consume(key);
    }
  }

  // Reconcile interrupted requests against the server, including lost responses
  // where the server saved the bytes but the client did not receive confirmation.
  for (const candidate of staged) {
    if (candidate.status === 'uploaded') continue;
    const key = identity(candidate.name, candidate.mimeType, candidate.size);
    if (consume(key)) alreadyStoredIds.push(candidate.id);
    else pendingIds.push(candidate.id);
  }

  return { alreadyStoredIds, pendingIds };
}

export async function uploadPendingRecordAttachments(
  recordId: string,
  staged: readonly StagedRecordAttachment[],
  api: AttachmentUploadApi,
  onStatus: (id: string, status: AttachmentUploadStatus, error?: string) => void,
): Promise<boolean> {
  const candidates = staged.filter(attachment => attachment.status !== 'uploaded');
  if (candidates.length === 0) return true;

  let stored: readonly StoredRecordAttachment[];
  try {
    stored = await api.getRecordAttachments(recordId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not check saved attachments.';
    for (const candidate of candidates) onStatus(candidate.id, 'failed', message);
    return false;
  }

  const plan = planRecordAttachmentUploads(staged.map(({ id, file, status }) => ({
    id,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    status,
  })), stored);

  for (const id of plan.alreadyStoredIds) onStatus(id, 'uploaded');

  let failed = false;
  for (const id of plan.pendingIds) {
    const candidate = staged.find(attachment => attachment.id === id);
    if (!candidate) continue;
    onStatus(id, 'uploading');
    try {
      await api.uploadRecordAttachment(recordId, candidate.file);
      onStatus(id, 'uploaded');
    } catch (error) {
      failed = true;
      onStatus(id, 'failed', error instanceof Error ? error.message : 'Upload failed.');
    }
  }

  return !failed;
}
