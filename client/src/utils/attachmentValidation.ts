const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc']);

export const POD_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,application/pdf,image/jpeg,image/png,application/msword';

export function validatePodAttachments(files: readonly Pick<File, 'name' | 'size'>[]): string | null {
  const oversized = files.find(file => file.size > MAX_ATTACHMENT_SIZE);
  if (oversized) return `${oversized.name} is too large. The maximum file size is 10 MB.`;

  const unsupported = files.find(file => {
    const extensionStart = file.name.lastIndexOf('.');
    const extension = extensionStart > 0 ? file.name.slice(extensionStart).toLowerCase() : '';
    return !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension);
  });
  if (unsupported) {
    return `${unsupported.name} is not supported. Allowed formats: PDF, JPG, PNG, and DOC.`;
  }

  return null;
}
