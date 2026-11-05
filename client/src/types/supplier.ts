/**
 * Supplier and Procurement module types
 */

import { AuditFields } from './common';

export interface SupplierCategory {
  id: string;
  name: string;
  is_active: boolean;
  version: number;
}
export interface CreateSupplierInput {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  category_ids: string[];
}

export interface Supplier extends AuditFields {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
  categories: SupplierCategory[];
  version: number;
}

export interface ApiSupplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
  categories: SupplierCategory[];
  version: number;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
