const TOKEN_KEY = 'bengkel_motor_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/auth/login') {
      setToken('');
    }
    throw new Error(data.error || `Permintaan gagal (${res.status})`);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/api/auth/me'),
  bootstrap: () => apiRequest('/api/bootstrap'),
  dashboard: () => apiRequest('/api/dashboard'),
  upload: (dataUrl, fileName) =>
    apiRequest('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, fileName }),
    }),
  createServiceOrder: (payload) =>
    apiRequest('/api/service-orders', { method: 'POST', body: JSON.stringify(payload) }),
  updateWorkOrder: (id, payload) =>
    apiRequest(`/api/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  addWoDetail: (id, payload) =>
    apiRequest(`/api/work-orders/${id}/details`, { method: 'POST', body: JSON.stringify(payload) }),
  addWoPart: (id, payload) =>
    apiRequest(`/api/work-orders/${id}/parts`, { method: 'POST', body: JSON.stringify(payload) }),
  confirmWoPart: (woId, partId) =>
    apiRequest(`/api/work-orders/${woId}/parts/${partId}/confirm`, { method: 'POST' }),
  addWoMaterial: (id, payload) =>
    apiRequest(`/api/work-orders/${id}/materials`, { method: 'POST', body: JSON.stringify(payload) }),
  posCheckout: (payload) =>
    apiRequest('/api/pos/checkout', { method: 'POST', body: JSON.stringify(payload) }),
  confirmQris: (trxId, payload) =>
    apiRequest(`/api/transactions/${trxId}/confirm-qris`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  cancelTransaction: (trxId, alasan) =>
    apiRequest(`/api/transactions/${trxId}/cancel`, { method: 'POST', body: JSON.stringify({ alasan }) }),
  createCashClosing: (payload) =>
    apiRequest('/api/cash-closings', { method: 'POST', body: JSON.stringify(payload) }),
  createPurchase: (payload) =>
    apiRequest('/api/purchases', { method: 'POST', body: JSON.stringify(payload) }),
  receivePurchase: (id, receivedItems) =>
    apiRequest(`/api/purchases/${id}/receive`, { method: 'POST', body: JSON.stringify({ receivedItems }) }),
  payPayable: (id, payload) =>
    apiRequest(`/api/payables/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
  payReceivable: (id, payload) =>
    apiRequest(`/api/receivables/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
  stockOpname: (payload) =>
    apiRequest('/api/inventory/opname', { method: 'POST', body: JSON.stringify(payload) }),
  createRow: (table, payload) =>
    apiRequest(`/api/tables/${table}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateRow: (table, id, payload) =>
    apiRequest(`/api/tables/${table}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRow: (table, id) =>
    apiRequest(`/api/tables/${table}/${id}`, { method: 'DELETE' }),
  createUser: (payload) =>
    apiRequest('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    apiRequest(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  readNotification: (id) =>
    apiRequest(`/api/notifications/${id}/read`, { method: 'POST' }),
  saveSettings: (payload) =>
    apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  exportBackup: () => apiRequest('/api/backup/export'),
  resetDemo: () => apiRequest('/api/backup/reset-demo', { method: 'POST' }),
  getDeliverables: () => apiRequest('/api/deliverables'),
  // Fitur 1: Referral Mekanik
  validateReferral: (kode) =>
    apiRequest('/api/referrals/validate', { method: 'POST', body: JSON.stringify({ kode }) }),
  getMechanicReferrals: () => apiRequest('/api/referrals/mechanics'),
  toggleReferral: (id, isActive) =>
    apiRequest(`/api/referrals/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  // Fitur 2: Komisi Mekanik
  getCommissionSettings: () => apiRequest('/api/commissions/settings'),
  updateCommissionSettings: (payload) =>
    apiRequest('/api/commissions/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  verifyCommission: (id) =>
    apiRequest(`/api/commissions/${id}/verify`, { method: 'POST' }),
  payCommission: (id, payload) =>
    apiRequest(`/api/commissions/${id}/pay`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  batchPayCommissions: (payload) =>
    apiRequest('/api/commissions/batch-pay', { method: 'POST', body: JSON.stringify(payload) }),
  // Fitur 3: Antrean Servis
  getActiveQueueEstimates: () => apiRequest('/api/queues/active-estimates'),
  callQueue: (id) => apiRequest(`/api/queues/${id}/call`, { method: 'POST' }),
  startQueue: (id) => apiRequest(`/api/queues/${id}/start`, { method: 'POST' }),
  setQueuePriority: (id, priority) =>
    apiRequest(`/api/queues/${id}/priority`, { method: 'POST', body: JSON.stringify({ priority }) }),
  // Fitur 4: Estimasi Durasi & Timer Servis
  pauseWoTimer: (id, reason) =>
    apiRequest(`/api/work-orders/${id}/time-pause`, { method: 'POST', body: JSON.stringify({ reason }) }),
  resumeWoTimer: (id) =>
    apiRequest(`/api/work-orders/${id}/time-resume`, { method: 'POST' }),
  requestWoEstimationChange: (id, payload) =>
    apiRequest(`/api/work-orders/${id}/request-estimation-change`, { method: 'POST', body: JSON.stringify(payload) }),
  approveWoEstimationChange: (id, payload) =>
    apiRequest(`/api/work-orders/${id}/approve-estimation-change`, { method: 'POST', body: JSON.stringify(payload) }),
};
