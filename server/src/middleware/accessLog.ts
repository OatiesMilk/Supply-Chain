import morgan from 'morgan';
import type { Request } from 'express';

export function safeAccessLogUrl(url: string, isProduction = process.env.NODE_ENV === 'production'): string {
  const pathname = url.split('?')[0];
  // Express routing accepts case variants and a trailing slash. Redact every
  // callback parameter, including provider errors, regardless of its name.
  return isProduction || /^\/api\/auth\/microsoft\/callback\/?$/i.test(pathname) ? pathname : url;
}

morgan.token('safe-url', req => safeAccessLogUrl((req as Request).originalUrl || req.url || '-'));
export const accessLog = morgan(process.env.NODE_ENV === 'production'
  ? ':method :safe-url :status :response-time ms'
  : ':method :safe-url :status :response-time ms - :res[content-length]');
