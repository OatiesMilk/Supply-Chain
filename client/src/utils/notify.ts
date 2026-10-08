import { toast } from 'sonner';

export const ERROR_TOAST_DURATION_MS = 7000;

type NotifyOptions = {
  description?: string;
};

export const notify = {
  success(message: string) {
    toast.success(message);
  },
  error(message: string, options: NotifyOptions = {}) {
    toast.error(message, { duration: ERROR_TOAST_DURATION_MS, description: options.description });
  },
  info(message: string) {
    toast.info(message);
  },
  fileRejected(fileName: string, reason: string) {
    toast.error(`${fileName} — ${reason}`, { duration: ERROR_TOAST_DURATION_MS });
  },
};
