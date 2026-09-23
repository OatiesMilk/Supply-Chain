import { useState, useEffect, useCallback } from 'react';
import {
  DeliveryRecord,
  Customer,
  Supplier,
  UserRole,
} from '@/types';
import {
  api,
  ApiUser,
  ApiCompany,
  ApiCustomer,
  ApiSupplier,
  ApiDriver,
  ApiDashboardStats,
  ApiSku,
} from '@/api';
import { loadState, saveState, clearPersistedState } from '@/utils/persistence';
import { setManagedDriverList } from '@/data';

function normalizeApiRecord(r: any): DeliveryRecord {
  return {
    ...r,
    customer_id: r.company_id,
    driver_assistants: Array.isArray(r.driver_assistants) ? r.driver_assistants : [],
    output_actions_log: r.output_actions_log ?? [],
    email_notification_sent: r.status === 'Delivered',
  };
}

export function useAppData(authUser: ApiUser | null, currentUser: { name: string; initials: string }, currentUserRole: UserRole) {
  const [deliveryRecords, setDeliveryRecords] = useState<DeliveryRecord[]>(() =>
    loadState<DeliveryRecord[]>('delivery_records', [])
  );
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>(() =>
    loadState<Customer[]>('customers', []) as unknown as ApiCustomer[]
  );
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>(() =>
    loadState<Supplier[]>('suppliers', []) as unknown as ApiSupplier[]
  );
  const [dashboardStats, setDashboardStats] = useState<ApiDashboardStats | null>(null);
  const [products, setProducts] = useState<ApiSku[]>([]);
  const [managedDrivers, setManagedDrivers] = useState<ApiDriver[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const refreshData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [records, companyList, customerList, supplierList, stats, skuList, driverList] = await Promise.all([
        api.getRecords(),
        api.getCompanies(),
        api.getCustomers(),
        api.getSuppliers(),
        api.getDashboardStats().catch(() => null),
        api.getSkus(),
        api.getDrivers(true).catch(() => []),
      ]);
      setDeliveryRecords(records.map(normalizeApiRecord));
      setCompanies(companyList);
      setCustomers(customerList);
      setSuppliers(supplierList);
      setDashboardStats(stats);
      setProducts(skuList);

      if (driverList && driverList.length > 0) {
        setManagedDrivers(driverList);
        setManagedDriverList(
          driverList.map(d => ({
            name: d.name,
            type: d.type,
            coverage_areas: d.coverage_areas,
            is_active: d.is_active,
          }))
        );
      }
    } catch {
      // Backend/database unavailable -> fallback to local data
      const storedRecords = loadState<DeliveryRecord[]>('delivery_records', []);
      const storedCustomers = loadState<Customer[]>('customers', []);
      const storedSuppliers = loadState<Supplier[]>('suppliers', []);
      const mockSkus: ApiSku[] = [];
      const mockCompanies: ApiCompany[] = [];
      const mockDrivers: ApiDriver[] = [
        {
          id: 'drv-1',
          name: 'Lando Navarro',
          type: 'DRIVER',
          coverage_areas: ['Makati', 'BGC', 'Taguig', 'Mandaluyong', 'San Juan', 'Pasig', 'Ortigas', 'Ortigas Corridor', 'Ortigas Center (Pasig)'],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        },
        {
          id: 'drv-2',
          name: 'Manny Santos',
          type: 'DRIVER',
          coverage_areas: ['Quezon City', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Bulacan', 'Cainta', 'Antipolo'],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        },
        {
          id: 'drv-3',
          name: 'Ronald de la Cruz',
          type: 'DRIVER',
          coverage_areas: ['Manila', 'Parañaque', 'Pasay', 'Las Piñas', 'Muntinlupa', 'Cavite', 'Laguna', 'Batangas'],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        },
        {
          id: 'drv-4',
          name: 'Jayson Reyes',
          type: 'ASSISTANT',
          coverage_areas: [],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        },
        {
          id: 'drv-5',
          name: 'Bong Alvarez',
          type: 'ASSISTANT',
          coverage_areas: [],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        },
        {
          id: 'drv-6',
          name: 'Ricky Mendoza',
          type: 'ASSISTANT',
          coverage_areas: [],
          is_active: true,
          created_by: 'system',
          created_at: new Date().toISOString(),
          modified_by: 'system',
          modified_at: new Date().toISOString(),
        },
      ];

      setDeliveryRecords(storedRecords);
      setCompanies(mockCompanies);
      setCustomers(storedCustomers as unknown as ApiCustomer[]);
      setSuppliers(storedSuppliers as unknown as ApiSupplier[]);
      setDashboardStats(null);
      setProducts(mockSkus);
      setManagedDrivers(mockDrivers);
      setManagedDriverList(
        mockDrivers.map(d => ({
          name: d.name,
          type: d.type,
          coverage_areas: d.coverage_areas,
          is_active: d.is_active,
        }))
      );
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (managedDrivers && managedDrivers.length > 0) {
      setManagedDriverList(
        managedDrivers.map(d => ({
          name: d.name,
          type: d.type,
          coverage_areas: d.coverage_areas,
          is_active: d.is_active,
        }))
      );
    }
  }, [managedDrivers]);

  useEffect(() => {
    if (authUser) refreshData();
  }, [authUser, refreshData]);

  // Polling every 60s
  useEffect(() => {
    if (!authUser) return;
    const id = setInterval(() => {
      refreshData();
    }, 60_000);
    return () => clearInterval(id);
  }, [authUser, refreshData]);

  const handleCreateCustomer = async (data: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  }) => {
    try {
      await api.createCustomer(data);
      await refreshData();
    } catch {
      const newCustomer: Customer = {
        id: `CST-${Math.floor(100 + Math.random() * 900)}`,
        name: data.name,
        contact_person: data.contact_person || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        created_by: currentUser.name,
        created_at: new Date().toISOString(),
        modified_by: currentUser.name,
        modified_at: new Date().toISOString(),
      };
      setCustomers(prev => {
        const next = [newCustomer as unknown as ApiCustomer, ...prev];
        saveState('customers', next);
        return next;
      });
      setCompanies(prev => [
        {
          id: newCustomer.id,
          name: newCustomer.name,
          sap_number: `SAP-${newCustomer.id.replace('CST-', '')}`,
          address: newCustomer.address,
          contact_person: newCustomer.contact_person,
          created_at: newCustomer.created_at,
        },
        ...prev,
      ]);
    }
  };

  const handleCreateSupplier = async (data: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    category?: string;
  }) => {
    try {
      await api.createSupplier(data);
      await refreshData();
    } catch {
      const newSupplier: Supplier = {
        id: `SUP-${Math.floor(100 + Math.random() * 900)}`,
        name: data.name,
        contact_person: data.contact_person || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        category: (data.category as any) || 'Hardware',
        created_by: currentUser.name,
        created_at: new Date().toISOString(),
        modified_by: currentUser.name,
        modified_at: new Date().toISOString(),
      };
      setSuppliers(prev => {
        const next = [newSupplier as unknown as ApiSupplier, ...prev];
        saveState('suppliers', next);
        return next;
      });
    }
  };

  const handleCreateDriver = async (data: {
    name: string;
    type: 'DRIVER' | 'ASSISTANT';
    coverage_areas?: string[];
  }) => {
    try {
      await api.createDriver(data);
      await refreshData();
    } catch {
      const newDriver: ApiDriver = {
        id: `drv-${Date.now()}`,
        name: data.name,
        type: data.type,
        coverage_areas: data.coverage_areas || [],
        is_active: true,
        created_by: currentUser.name || 'system',
        created_at: new Date().toISOString(),
        modified_by: currentUser.name || 'system',
        modified_at: new Date().toISOString(),
      };
      setManagedDrivers(prev => [newDriver, ...prev]);
    }
  };

  const handleUpdateDriver = async (
    id: string,
    data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>
  ) => {
    try {
      await api.updateDriver(id, data);
      await refreshData();
    } catch {
      setManagedDrivers(prev => prev.map(d => (d.id === id ? { ...d, ...(data as any) } : d)));
    }
  };

  const handleDeleteDriver = async (id: string) => {
    try {
      await api.deleteDriver(id);
      await refreshData();
    } catch {
      setManagedDrivers(prev => prev.filter(d => d.id !== id));
    }
  };

  const handleResetDemoData = async () => {
    if (
      !window.confirm(
        'Reset all Supply Chain Portal data back to the original demo seed data? This clears every change made on the server and cannot be undone.'
      )
    )
      return;
    setResetting(true);
    try {
      await api.resetSeed();
      await refreshData();
    } catch {
      clearPersistedState();
      saveState('delivery_records', []);
      saveState('customers', []);
      saveState('suppliers', []);
      await refreshData();
    } finally {
      setResetting(false);
    }
  };

  return {
    deliveryRecords,
    setDeliveryRecords,
    companies,
    customers,
    suppliers,
    dashboardStats,
    products,
    managedDrivers,
    dataLoading,
    dataError,
    resetting,
    refreshData,
    handleCreateCustomer,
    handleCreateSupplier,
    handleCreateDriver,
    handleUpdateDriver,
    handleDeleteDriver,
    handleResetDemoData,
  };
}
