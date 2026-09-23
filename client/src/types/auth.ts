/**
 * Authentication and User Management types
 */

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  permissions: { screen: string; granted: boolean }[];
}

export interface ApiUserAdmin {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  is_active: boolean;
  microsoft_linked: boolean;
  created_at: string;
}

export interface ApiIntegrationStatus {
  azure_sso: { configured: boolean; tenant: string | null; redirect_uri: string | null };
  email: { method: 'graph' | 'smtp' | 'mock'; smtp_host: string | null; from: string | null };
  users: { total: number; active: number; microsoft_linked: number };
  app_url: string;
  node_env: string;
}

export interface ApiTestEmailResult {
  ok: boolean;
  method: 'graph' | 'smtp' | 'mock';
  error: string | null;
}
