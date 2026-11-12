import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

export const QA_ROOT = path.resolve(__dirname, '../..');
export const REPO_ROOT = path.dirname(QA_ROOT);
export const ROLE_CONFIG = {
  sales: ['sales@microgenesis.com', 'UAT_PASSWORD_SC'],
  logistics: ['logistics@microgenesis.com', 'UAT_PASSWORD_LOGISTICS'],
  tass: ['tass@microgenesis.com', 'UAT_PASSWORD_TASS'],
  admin: ['admin@microgenesis.com', 'UAT_PASSWORD_ADMIN'],
  driver: ['driver@microgenesis.com', 'UAT_PASSWORD_DRIVER'],
} as const;
export type RoleKey = keyof typeof ROLE_CONFIG;

export function localUrl(value: string, port: string, prefix: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== port ||
      url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== prefix) {
    throw new Error(`QA target must be http://localhost:${port}${prefix}`);
  }
  return url;
}
export function apiBase(): string {
  return localUrl(process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1', '4000', '/api/v1').href.replace(/\/$/, '');
}
export const WEB_BASE = 'http://localhost:3000';
export function credentials(role: RoleKey) {
  const [email, variable] = ROLE_CONFIG[role];
  const password = process.env[variable];
  if (!password) throw new Error(`Blocked: missing runtime variable ${variable}`);
  return { email, password };
}
export function roleForEmail(email: string): RoleKey {
  const role = (Object.keys(ROLE_CONFIG) as RoleKey[]).find(key => ROLE_CONFIG[key][0] === email);
  if (!role) throw new Error('Blocked: no configured QA role for this email');
  return role;
}
export function disposableDatabase(value: string): string {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/_(sandbox|test)$/.test(database)) {
    throw new Error('Blocked: writes require a local PostgreSQL database ending _sandbox or _test');
  }
  return database;
}
export function assertWriteTarget(): void {
  apiBase();
  // Validate the API's local configuration without printing any connection values.
  const file = path.join(REPO_ROOT, 'server/.env');
  const config = dotenv.parse(fs.readFileSync(file));
  if (!config.DATABASE_URL) throw new Error('Blocked: server/.env has no DATABASE_URL');
  const database = disposableDatabase(config.DATABASE_URL);
  if (process.env.DATABASE_URL && disposableDatabase(process.env.DATABASE_URL) !== database) {
    throw new Error('Blocked: inherited and server database configurations disagree');
  }
}
export function manilaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
export function uniqueRef(prefix = 'QA'): string {
  return `${prefix}-${randomUUID()}`;
}
export function runId(): string {
  const id = process.env.UAT_RUN_ID;
  if (!id || !/^RUN-\d{8}-[A-Za-z0-9-]+$/.test(id)) throw new Error('Blocked: use the QA runner to allocate UAT_RUN_ID');
  return id;
}
export function artifactDir(): string {
  const dir = path.join(QA_ROOT, 'artifacts', runId());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function redact(value: unknown): string {
  const scrub = (input: string): string => {
    let output = input;
    for (const [key, secret] of Object.entries(process.env)) {
      if (/PASSWORD|SECRET|TOKEN|DATABASE_URL|API_KEY/.test(key) && secret) output = output.split(secret).join('[redacted]');
    }
    output = output.replace(/https?:\/\/[^\s\"'<>]+/g, value => {
      try { const url = new URL(value); if (url.search || url.hash) return `${url.origin}${url.pathname}?[redacted]`; } catch {}
      return value;
    });
    return output.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
      .replace(/((?:password|cookie|token|secret|authorization)[\w-]*["']?\s*[:=]\s*)[^\r\n,}]+/gi, '$1[redacted]');
  };
  if (typeof value === 'string') return scrub(value);
  return JSON.stringify(value, (key, entry) => {
    if (/password|cookie|token|secret|authorization|database_url/i.test(key)) return '[redacted]';
    return typeof entry === 'string' ? scrub(entry) : entry;
  }, 2);
}
export function evidence(name: string, value: unknown): void {
  if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid evidence filename');
  fs.writeFileSync(path.join(artifactDir(), name), redact(value));
}
