const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 10;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc']);

export const POD_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,application/pdf,image/jpeg,image/png,application/msword';

export type AttachmentRejection = {
  fileName: string;
  reason: string;
};

export function getPodAttachmentRejection(files: readonly Pick<File, 'name' | 'size'>[]): AttachmentRejection | null {
  if (files.length > MAX_ATTACHMENT_COUNT) {
    return {
      fileName: `${files.length} files selected`,
      reason: `maximum is ${MAX_ATTACHMENT_COUNT} files at a time.`,
    };
  }

  const oversized = files.find(file => file.size > MAX_ATTACHMENT_SIZE);
  if (oversized) {
    const sizeMb = (oversized.size / (1024 * 1024)).toFixed(1);
    return { fileName: oversized.name, reason: `is ${sizeMb} MB — maximum is 10 MB.` };
  }

  const unsupported = files.find(file => {
    const extensionStart = file.name.lastIndexOf('.');
    const extension = extensionStart > 0 ? file.name.slice(extensionStart).toLowerCase() : '';
    return !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension);
  });
  if (unsupported) {
    return { fileName: unsupported.name, reason: 'file type not allowed. Use JPG, PNG, PDF or DOC.' };
  }

  return null;
}

export function validatePodAttachments(files: readonly Pick<File, 'name' | 'size'>[]): string | null {
  const rejection = getPodAttachmentRejection(files);
  if (!rejection) return null;
  const separator = rejection.reason.startsWith('is ') ? ' ' : ' — ';
  return `${rejection.fileName}${separator}${rejection.reason}`;
}
