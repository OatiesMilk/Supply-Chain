import { request } from './index';
export interface DashboardSelection {
  id?: string; module?: string; period?: string; from?: string; to?: string; metric?: string;
  status?: string; overdue?: boolean; day?: string; age?: string; missing?: boolean;
}
export interface DashboardRecord {
  id: string; reference: string; company: string; driver: string; assignment: string;
  category: string; status: string; scheduledDate: string; screen: string | null;
}
export interface DashboardOverview {
  role: string; today: string; updatedAt: string; modules: string[];
  cards: { metric: string; label: string; scope: string; count: number }[];
  status: { status: string; total: number; overdue: number }[];
  missingDates: number;
  daily: { day: string; due: number; completed: number }[];
  ages: { age: string; count: number }[];
  attention: (DashboardRecord & { reasons: string[]; waitingDays: number | null; ageBasis: string })[];
  administration: null | { activeUsers: number; auditEventsToday: number; recordsThisWeek: number; recentAudit: { id: string; action: string; reference: string; actor: string; timestamp: string }[] };
}
export function dashboardQueryString(selection: DashboardSelection, page?: number) {
  const query = new URLSearchParams();
  Object.entries(selection).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  if (page) query.set('page', String(page));
  return query.toString();
}
export const getDashboardOverview = (selection: DashboardSelection) => request<DashboardOverview>(`/dashboard/overview?${dashboardQueryString(selection)}`);
export const getDashboardRecords = (selection: DashboardSelection, page: number) => request<{ records: DashboardRecord[]; total: number; pageSize: number }>(`/dashboard/records?${dashboardQueryString(selection, page)}`);
export const getDashboardUsers = (page: number) => request<{ users: { id: string; name: string; role: string }[]; total: number; pageSize: number }>(`/dashboard/users?page=${page}`);
