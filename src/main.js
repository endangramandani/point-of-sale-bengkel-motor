import { api, getToken, setToken } from './api.js';
import { store, refreshAllData } from './state.js';
import { showToast } from './utils.js';
import { renderLoginScreen, renderShell, renderAccountSettings } from './views/navigation.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPos, renderTransactionHistory, renderCashClosing } from './views/pos.js';
import {
  renderVehicleIntake,
  renderWorkOrders,
  renderServiceHistory,
  renderWarranties,
} from './views/service.js';
import {
  renderServicesCatalog,
  renderCustomers,
  renderVehicles,
  renderEmployees,
} from './views/master.js';
import {
  renderSpareparts,
  renderMaterials,
  renderStockMovements,
  renderSparepartUsages,
  renderMaterialUsages,
  renderStockOpname,
} from './views/inventory.js';
import {
  renderSuppliers,
  renderPurchaseCreate,
  renderPurchaseHistory,
  renderPayables,
  renderReceivables,
  renderExpenses,
  renderRevenues,
  renderCommissions,
} from './views/procurement_finance.js';
import {
  renderAppointments,
  renderQueues,
  renderSchedules,
  renderAttendance,
  renderReports,
  renderUsers,
  renderNotifications,
  renderSettings,
  renderBackupAndDeliverables,
} from './views/operational_reports_system.js';

const appRoot = document.getElementById('app');
const ROOT_TABS = new Set(['dashboard', 'work-order', 'pos', 'sparepart', 'akun']);

function renderBootSkeleton() {
  appRoot.innerHTML = `
    <div style="padding:20px; max-width:720px; margin:24px auto; display:flex; flex-direction:column; gap:14px;">
      <div class="skeleton-card" style="height:120px;"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  `;
}

async function boot() {
  const token = getToken();
  if (!token) {
    renderLoginScreen(appRoot, initAuthenticatedWorkspace);
    return;
  }
  renderBootSkeleton();
  try {
    await initAuthenticatedWorkspace();
  } catch {
    setToken('');
    renderLoginScreen(appRoot, initAuthenticatedWorkspace);
  }
}

async function initAuthenticatedWorkspace() {
  await refreshAllData();
  store.routeHistory = [store.currentRoute || 'dashboard'];
  renderCurrentView();
}

function navigateTo(routeId) {
  if (!routeId) return;
  if (store.currentRoute === routeId) {
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  if (ROOT_TABS.has(routeId)) {
    store.routeHistory = [routeId];
  } else {
    store.routeHistory = [...(store.routeHistory || ['dashboard']), routeId];
  }
  store.currentRoute = routeId;
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function handleBack() {
  const hist = store.routeHistory || [];
  if (hist.length > 1) {
    hist.pop();
    store.currentRoute = hist[hist.length - 1] || 'dashboard';
  } else {
    store.currentRoute = 'dashboard';
    store.routeHistory = ['dashboard'];
  }
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function handleRefresh() {
  try {
    await refreshAllData();
    renderCurrentView();
    showToast('Data berhasil disinkronkan.', 'success');
  } catch (err) {
    showToast(err.message || 'Gagal memuat ulang data.', 'error');
  }
}

async function handleLogout() {
  try {
    await api.logout();
  } catch {
    // ignore logout error
  }
  setToken('');
  store.data = null;
  store.user = null;
  store.currentRoute = 'dashboard';
  store.routeHistory = ['dashboard'];
  showToast('Anda telah keluar dari sistem.', 'info');
  renderLoginScreen(appRoot, initAuthenticatedWorkspace);
}

function renderCurrentView() {
  renderShell(appRoot, navigateTo, handleBack, handleRefresh, handleLogout);
  const view = document.getElementById('view-container');
  if (!view) return;

  const r = store.currentRoute;
  switch (r) {
    case 'dashboard':
      renderDashboard(view, navigateTo);
      break;
    case 'akun':
      renderAccountSettings(view, navigateTo, handleLogout, handleRefresh);
      break;
    case 'pos':
      renderPos(view, navigateTo);
      break;
    case 'riwayat-transaksi':
      renderTransactionHistory(view);
      break;
    case 'tutup-kas':
      renderCashClosing(view);
      break;
    case 'penerimaan':
      renderVehicleIntake(view, navigateTo);
      break;
    case 'work-order':
      renderWorkOrders(view, navigateTo, 'work-order');
      break;
    case 'daftar-servis':
      renderWorkOrders(view, navigateTo, 'daftar-servis');
      break;
    case 'riwayat-servis':
      renderServiceHistory(view);
      break;
    case 'garansi':
      renderWarranties(view);
      break;
    case 'layanan':
      renderServicesCatalog(view, navigateTo);
      break;
    case 'pelanggan':
      renderCustomers(view);
      break;
    case 'kendaraan':
      renderVehicles(view);
      break;
    case 'mekanik':
      renderEmployees(view);
      break;
    case 'sparepart':
      renderSpareparts(view, navigateTo);
      break;
    case 'bahan':
      renderMaterials(view, navigateTo);
      break;
    case 'stok-mutasi':
      renderStockMovements(view, navigateTo);
      break;
    case 'penggunaan-sparepart':
      renderSparepartUsages(view);
      break;
    case 'pemakaian-bahan':
      renderMaterialUsages(view);
      break;
    case 'stok-opname':
      renderStockOpname(view);
      break;
    case 'supplier':
      renderSuppliers(view, navigateTo);
      break;
    case 'pembelian':
      renderPurchaseCreate(view, navigateTo);
      break;
    case 'riwayat-pembelian':
      renderPurchaseHistory(view, navigateTo);
      break;
    case 'utang':
      renderPayables(view, navigateTo);
      break;
    case 'piutang':
      renderReceivables(view, navigateTo);
      break;
    case 'pengeluaran':
      renderExpenses(view);
      break;
    case 'pendapatan':
      renderRevenues(view);
      break;
    case 'komisi':
      renderCommissions(view);
      break;
    case 'reservasi':
      renderAppointments(view, navigateTo);
      break;
    case 'antrean':
      renderQueues(view);
      break;
    case 'jadwal':
      renderSchedules(view);
      break;
    case 'absensi':
      renderAttendance(view);
      break;
    case 'laporan-penjualan':
    case 'laporan-servis':
    case 'laporan-inventory':
    case 'laporan-pembelian':
    case 'laporan-utang-piutang':
    case 'laporan-laba-rugi':
    case 'laporan-mekanik':
      renderReports(view, r);
      break;
    case 'pengguna':
      renderUsers(view);
      break;
    case 'notifikasi':
      renderNotifications(view);
      break;
    case 'pengaturan':
      renderSettings(view);
      break;
    case 'backup':
      renderBackupAndDeliverables(view);
      break;
    default:
      renderDashboard(view, navigateTo);
  }
}

boot();
