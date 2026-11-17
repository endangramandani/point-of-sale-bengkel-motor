import { api } from './api.js';

export const store = {
  user: null,
  roleCode: null,
  data: null,
  dashboard: null,
  currentRoute: 'dashboard',
  routeHistory: ['dashboard'],
  sidebarOpen: false,
  pageStates: {},
  posCart: [],
};

export function getCustomer(id) {
  return store.data?.Customers?.find((c) => c.id === id) || null;
}

export function getVehicle(id) {
  return store.data?.Vehicles?.find((v) => v.id === id) || null;
}

export function getEmployee(id) {
  return store.data?.Employees?.find((e) => e.id === id) || null;
}

export function getSparepart(id) {
  return store.data?.Spareparts?.find((s) => s.id === id) || null;
}

export function getMaterial(id) {
  return store.data?.Materials?.find((m) => m.id === id) || null;
}

export function getSupplier(id) {
  return store.data?.Suppliers?.find((s) => s.id === id) || null;
}

export function getServiceDurationSetting(srvId) {
  return store.data?.Service_Duration_Settings?.find((s) => s.serviceId === srvId) || null;
}

export function getMechanicReferral(employeeId) {
  return store.data?.Mechanic_Referrals?.find((r) => r.employeeId === employeeId) || null;
}

export function hasRole(...codes) {
  if (!store.roleCode) return false;
  return codes.includes(store.roleCode);
}

export async function refreshAllData() {
  const [boot, dash] = await Promise.all([api.bootstrap(), api.dashboard()]);
  store.data = boot;
  store.user = boot.user;
  store.roleCode = boot.roleCode;
  store.dashboard = dash;
}
