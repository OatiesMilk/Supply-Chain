const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc']);

export const POD_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,application/pdf,image/jpeg,image/png,application/msword';

export function validatePodAttachments(files: readonly Pick<File, 'name' | 'size'>[]): string | null {
  const oversized = files.find(file => file.size > MAX_ATTACHMENT_SIZE);
  if (oversized) {
    const sizeMb = (oversized.size / (1024 * 1024)).toFixed(1);
    return `${oversized.name} is ${sizeMb} MB — maximum is 10 MB.`;
  }

  const unsupported = files.find(file => {
    const extensionStart = file.name.lastIndexOf('.');
    const extension = extensionStart > 0 ? file.name.slice(extensionStart).toLowerCase() : '';
    return !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension);
  });
  if (unsupported) {
    return `${unsupported.name} — file type not allowed. Use JPG, PNG, PDF or DOC.`;
  }

  return null;
}
