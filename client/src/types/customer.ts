/**
 * Customer module types
 */

import { AuditFields } from './common';

export interface Customer extends AuditFields {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}

export interface ApiCompany {
  id: string;
  name: string;
  sap_number: string;
  address: string;
  contact_person: string;
  created_at: string;
}

export interface ApiCustomer extends Customer {}
