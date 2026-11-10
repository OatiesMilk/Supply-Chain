import { ApiSku, ApiCompany, ApiCustomer, ApiSupplier, ApiDriver, ApiUser } from './api';
import { initialProducts, initialInventory, initialCustomers, initialSuppliers } from './data';

export const DEV_ADMIN_USER: ApiUser = {
  id: 'usr-admin',
  name: 'System Admin',
  email: 'admin@microgenesis.com',
  role: 'ADMIN',
  effectiveScreens: [], resources: [], permissionVersion: 'mock',
  permissions: [
    { screen: 'Dashboard', granted: true },
    { screen: 'Deliveries', granted: true },
    { screen: 'RMA', granted: true },
    { screen: 'Sales Orders', granted: true },
    { screen: 'Procurement Pick-up', granted: true },
    { screen: 'Accounting Collection', granted: true },
    { screen: 'Inventory', granted: true },
    { screen: 'Driver Board', granted: true },
    { screen: 'Delivery Calendar', granted: true },
    { screen: 'Transaction Center', granted: true },
    { screen: 'Customers', granted: true },
    { screen: 'Suppliers', granted: true },
    { screen: 'Driver Management', granted: true },
    { screen: 'Account Managers', granted: true },
    { screen: 'Statistical Report', granted: true },
    { screen: 'Admin Panel', granted: true },
    { screen: 'Data Sampler', granted: true },
  ],
};

export const DEV_USERS: Record<string, ApiUser> = {
  'sales@microgenesis.com': {
    id: 'usr-maria',
    name: 'Maria Reyes',
    email: 'sales@microgenesis.com',
    role: 'SALES_COORDINATOR',
    permissions: [], effectiveScreens: [], resources: [], permissionVersion: 'mock',
  },
  'logistics@microgenesis.com': {
    id: 'usr-juan',
    name: 'Juan Santos',
    email: 'logistics@microgenesis.com',
    role: 'LOGISTICS',
    permissions: [], effectiveScreens: [], resources: [], permissionVersion: 'mock',
  },
  'tass@microgenesis.com': {
    id: 'usr-ana',
    name: 'Ana Cruz',
    email: 'tass@microgenesis.com',
    role: 'TASS',
    permissions: [], effectiveScreens: [], resources: [], permissionVersion: 'mock',
  },
  'admin@microgenesis.com': DEV_ADMIN_USER,
};

export function getMockSkus(): ApiSku[] {
  return initialProducts.map(p => {
    const inv = initialInventory.find(i => i.product_id === p.id);
    return {
      id: p.id,
      sku_code: p.sku_code,
      name: p.name,
      category: p.category,
      unit_cost: p.unit_cost,
      unit_price: p.unit_price,
      reorder_point: p.reorder_point,
      description: p.description,
      created_by: p.created_by,
      modified_by: p.modified_by,
      created_at: p.created_at,
      updated_at: p.modified_at,
      inventory: inv
        ? {
            warehouse_location: inv.warehouse_location,
            on_hand_qty: inv.on_hand_qty,
            allocated_qty: inv.allocated_qty,
            atp: inv.on_hand_qty - inv.allocated_qty,
          }
        : null,
      recent_transactions: [],
    };
  });
}

export function getMockCompanies(): ApiCompany[] {
  return initialCustomers.map(c => ({
    id: c.id,
    name: c.name,
    sap_number: `SAP-${c.id.replace('CST-', '')}`,
    address: c.address,
    contact_person: c.contact_person,
    is_active: true,
    version: 1,
    default_account_manager: null,
    created_at: c.created_at,
    updated_at: c.created_at,
  }));
}

export function getMockDrivers(): ApiDriver[] {
  return [];
}
