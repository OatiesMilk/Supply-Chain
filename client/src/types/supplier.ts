/**
 * Supplier and Procurement module types
 */

import { AuditFields } from './common';

export interface Supplier extends AuditFields {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: 'Hardware' | 'Consumables' | 'Electronics' | 'Packaging' | 'Services';
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
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
