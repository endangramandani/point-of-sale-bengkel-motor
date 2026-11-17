import { store, hasRole } from '../state.js';
import { api, setToken } from '../api.js';
import { esc, msIcon, showToast, confirmDialog, openModal, isAndroidWebView } from '../utils.js';

export const SIDEBAR_GROUPS = [
  {
    title: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Beranda', icon: 'home', roles: ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'KASIR', 'MEKANIK', 'PELANGGAN'] },
    ],
  },
  {
    title: 'TRANSAKSI',
    items: [
      { id: 'pos', label: 'Kasir / POS', icon: 'point_of_sale', roles: ['KASIR'] },
      { id: 'riwayat-transaksi', label: 'Riwayat Transaksi', icon: 'receipt_long', roles: ['OWNER', 'ADMIN', 'KASIR', 'PELANGGAN'] },
      { id: 'tutup-kas', label: 'Tutup Kas', icon: 'lock_clock', roles: ['OWNER', 'ADMIN', 'KASIR'] },
    ],
  },
  {
    title: 'SERVIS',
    items: [
      { id: 'penerimaan', label: 'Penerimaan Kendaraan', icon: 'assignment_add', roles: ['ADMIN'] },
      { id: 'work-order', label: 'Work Order', icon: 'build', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'daftar-servis', label: 'Daftar Servis', icon: 'engineering', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'riwayat-servis', label: 'Riwayat Servis', icon: 'history', roles: ['OWNER', 'ADMIN', 'MEKANIK', 'PELANGGAN'] },
      { id: 'garansi', label: 'Garansi Servis', icon: 'verified_user', roles: ['OWNER', 'ADMIN', 'PELANGGAN'] },
    ],
  },
  {
    title: 'MASTER DATA',
    items: [
      { id: 'layanan', label: 'Katalog Layanan & Durasi', icon: 'home_repair_service', roles: ['OWNER', 'ADMIN', 'PELANGGAN'] },
      { id: 'pelanggan', label: 'Data Pelanggan', icon: 'groups', roles: ['OWNER', 'ADMIN', 'KASIR'] },
      { id: 'kendaraan', label: 'Data Motor / Kendaraan', icon: 'two_wheeler', roles: ['OWNER', 'ADMIN', 'PELANGGAN'] },
      { id: 'mekanik', label: 'Mekanik & Teknisi', icon: 'badge', roles: ['OWNER', 'ADMIN'] },
      { id: 'referral-mekanik', label: 'Kode Referral Mekanik', icon: 'share', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { id: 'sparepart', label: 'Stok Sparepart', icon: 'inventory_2', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'bahan', label: 'Bahan Operasional', icon: 'oil_barrel', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'stok-mutasi', label: 'Mutasi Stok', icon: 'swap_vert', roles: ['OWNER', 'ADMIN'] },
      { id: 'penggunaan-sparepart', label: 'Pemakaian Sparepart', icon: 'construction', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'pemakaian-bahan', label: 'Pemakaian Bahan', icon: 'cleaning_services', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'stok-opname', label: 'Stok Opname', icon: 'fact_check', roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    title: 'PENGADAAN',
    items: [
      { id: 'supplier', label: 'Supplier', icon: 'local_shipping', roles: ['OWNER', 'ADMIN'] },
      { id: 'pembelian', label: 'Pembelian Barang', icon: 'add_shopping_cart', roles: ['OWNER', 'ADMIN'] },
      { id: 'riwayat-pembelian', label: 'Riwayat Pembelian', icon: 'inventory', roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    title: 'KEUANGAN',
    items: [
      { id: 'utang', label: 'Utang Supplier', icon: 'request_quote', roles: ['OWNER', 'ADMIN'] },
      { id: 'piutang', label: 'Piutang Pelanggan', icon: 'account_balance_wallet', roles: ['OWNER', 'ADMIN', 'KASIR', 'PELANGGAN'] },
      { id: 'pengeluaran', label: 'Biaya Pengeluaran', icon: 'payments', roles: ['OWNER', 'ADMIN'] },
      { id: 'pendapatan', label: 'Laporan Pendapatan', icon: 'trending_up', roles: ['OWNER'] },
      { id: 'komisi', label: 'Komisi Mekanik', icon: 'workspace_premium', roles: ['OWNER', 'MEKANIK'] },
    ],
  },
  {
    title: 'OPERASIONAL',
    items: [
      { id: 'reservasi', label: 'Booking Servis', icon: 'event_available', roles: ['OWNER', 'ADMIN', 'PELANGGAN'] },
      { id: 'antrean', label: 'Antrean Bengkel', icon: 'format_list_numbered', roles: ['OWNER', 'ADMIN', 'KASIR', 'MEKANIK', 'PELANGGAN'] },
      { id: 'jadwal', label: 'Jadwal Shift', icon: 'calendar_month', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
      { id: 'absensi', label: 'Presensi Mekanik', icon: 'fingerprint', roles: ['OWNER', 'ADMIN', 'MEKANIK'] },
    ],
  },
  {
    title: 'LAPORAN',
    items: [
      { id: 'laporan-penjualan', label: 'Laporan Penjualan', icon: 'bar_chart', roles: ['OWNER', 'ADMIN'] },
      { id: 'laporan-servis', label: 'Laporan Servis', icon: 'analytics', roles: ['OWNER', 'ADMIN'] },
      { id: 'laporan-inventory', label: 'Laporan Inventory', icon: 'summarize', roles: ['OWNER', 'ADMIN'] },
      { id: 'laporan-pembelian', label: 'Laporan Pembelian', icon: 'receipt', roles: ['OWNER', 'ADMIN'] },
      { id: 'laporan-utang-piutang', label: 'Laporan Utang & Piutang', icon: 'balance', roles: ['OWNER'] },
      { id: 'laporan-laba-rugi', label: 'Laporan Laba Rugi', icon: 'pie_chart', roles: ['OWNER'] },
      { id: 'laporan-mekanik', label: 'Performa Mekanik', icon: 'leaderboard', roles: ['OWNER'] },
    ],
  },
  {
    title: 'SISTEM',
    items: [
      { id: 'akun', label: 'Profil Saya', icon: 'manage_accounts', roles: ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'KASIR', 'MEKANIK', 'PELANGGAN'] },
      { id: 'pengguna', label: 'Kelola Akun & Role', icon: 'admin_panel_settings', roles: ['SUPER_ADMIN'] },
      { id: 'notifikasi', label: 'Notifikasi & Log', icon: 'notifications', roles: ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'KASIR', 'MEKANIK', 'PELANGGAN'] },
      { id: 'pengaturan', label: 'Konfigurasi Sistem', icon: 'settings', roles: ['SUPER_ADMIN'] },
      { id: 'backup', label: 'Backup & Pemulihan', icon: 'cloud_download', roles: ['SUPER_ADMIN'] },
    ],
  },
];

const ROOT_TABS = new Set(['dashboard', 'work-order', 'pos', 'sparepart', 'akun', 'antrean', 'layanan', 'komisi', 'pengguna']);

export function getRouteLabel(routeId) {
  if (routeId === 'akun') return { group: 'SISTEM', label: 'Profil Saya' };
  if (routeId === 'referral-mekanik') return { group: 'MASTER DATA', label: 'Kode Referral Mekanik' };
  for (const grp of SIDEBAR_GROUPS) {
    const found = grp.items.find((i) => i.id === routeId);
    if (found) return { group: grp.title, label: found.label };
  }
  return { group: 'OVERVIEW', label: 'Beranda' };
}

export function getItemBadgeCount(id) {
  if (!store.data) return '';
  if (id === 'work-order') {
    const active = store.data.Work_Orders?.filter((w) => !['Selesai', 'Sudah diserahkan', 'Dibatalkan'].includes(w.status)).length || 0;
    return active > 0 ? String(active) : '';
  }
  if (id === 'antrean') {
    const q = (store.data.Queue_Records || store.data.Queues || []).filter((x) => !['Selesai', 'Dibatalkan'].includes(x.status)).length;
    return q > 0 ? String(q) : '';
  }
  if (id === 'notifikasi') {
    const n = store.data.Notifications?.filter((x) => !x.dibaca).length || 0;
    return n > 0 ? String(n) : '';
  }
  return '';
}

function getBottomNavTabs(roleCode) {
  if (roleCode === 'SUPER_ADMIN') {
    return [
      { id: 'dashboard', label: 'Sistem', icon: 'shield' },
      { id: 'pengguna', label: 'Pengguna', icon: 'manage_accounts' },
      { id: 'notifikasi', label: 'Audit Log', icon: 'receipt_long' },
      { id: 'backup', label: 'Backup', icon: 'cloud_download' },
      { id: 'akun', label: 'Akun', icon: 'person' },
    ];
  }
  if (roleCode === 'OWNER') {
    return [
      { id: 'dashboard', label: 'Bisnis', icon: 'trending_up' },
      { id: 'layanan', label: 'Layanan', icon: 'home_repair_service' },
      { id: 'komisi', label: 'Komisi', icon: 'workspace_premium' },
      { id: 'laporan-penjualan', label: 'Laporan', icon: 'pie_chart' },
      { id: 'akun', label: 'Akun', icon: 'person' },
    ];
  }
  if (roleCode === 'ADMIN') {
    return [
      { id: 'dashboard', label: 'Beranda', icon: 'home' },
      { id: 'work-order', label: 'Servis', icon: 'build' },
      { id: 'antrean', label: 'Antrean', icon: 'format_list_numbered' },
      { id: 'sparepart', label: 'Stok', icon: 'inventory_2' },
      { id: 'akun', label: 'Akun', icon: 'person' },
    ];
  }
  if (roleCode === 'KASIR') {
    return [
      { id: 'dashboard', label: 'Beranda', icon: 'home' },
      { id: 'pos', label: 'Kasir / POS', icon: 'point_of_sale' },
      { id: 'riwayat-transaksi', label: 'Transaksi', icon: 'receipt_long' },
      { id: 'antrean', label: 'Antrean', icon: 'format_list_numbered' },
      { id: 'akun', label: 'Akun', icon: 'person' },
    ];
  }
  if (roleCode === 'MEKANIK') {
    return [
      { id: 'dashboard', label: 'Beranda', icon: 'home' },
      { id: 'work-order', label: 'Pekerjaan', icon: 'build' },
      { id: 'referral-mekanik', label: 'Referral QR', icon: 'qr_code' },
      { id: 'komisi', label: 'Komisi Saya', icon: 'workspace_premium' },
      { id: 'akun', label: 'Akun', icon: 'person' },
    ];
  }
  // Default PELANGGAN
  return [
    { id: 'dashboard', label: 'Beranda', icon: 'home' },
    { id: 'antrean', label: 'Pantau Servis', icon: 'track_changes' },
    { id: 'reservasi', label: 'Booking', icon: 'event_available' },
    { id: 'layanan', label: 'Layanan', icon: 'home_repair_service' },
    { id: 'akun', label: 'Akun', icon: 'person' },
  ];
}

function updateOfflineBanner() {
  const offBanner = document.getElementById('offline-banner');
  if (offBanner) {
    offBanner.classList.toggle('visible', !navigator.onLine);
  }
}

function mountOfflineBanner() {
  updateOfflineBanner();
  window.removeEventListener('online', updateOfflineBanner);
  window.removeEventListener('offline', updateOfflineBanner);
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
}

export function renderLoginScreen(root, onSuccess) {
  root.innerHTML = `
    <div class="login-shell">
      <div class="login-visual">
        <img class="login-visual-bg" src="/src/assets/images/bengkel_workshop_hero_1794865373548.jpg" alt="Bengkel Sepeda Motor" />
        <div class="login-visual-scrim"></div>
        <div class="login-visual-content">
          <div class="brand-lockup">
            <img class="brand-logo-img" src="/src/assets/images/bengkel_logo_emblem_1794865371761.jpg" alt="Logo BENGKEL MOTOR" />
            <span class="brand-name">BENGKEL MOTOR</span>
          </div>
        </div>
        <div class="login-visual-content">
          <h1 class="login-headline">Point of Sale &amp; Manajemen Bengkel Motor</h1>
          <p class="login-sub">Pengalaman aplikasi mobile modern untuk kasir POS, penerimaan servis, Work Order mekanik, stok sparepart, hingga laporan laba rugi.</p>
        </div>
      </div>

      <div class="login-form-panel">
        <div class="login-card">
          <div class="login-mobile-banner">
            <div class="brand-lockup">
              <img class="brand-logo-img" src="/src/assets/images/bengkel_logo_emblem_1794865371761.jpg" alt="Logo BENGKEL MOTOR" />
              <div>
                <div class="brand-name">BENGKEL MOTOR</div>
                <div style="font-size:12px; color:#CBD5E1;">Workshop &amp; POS System</div>
              </div>
            </div>
          </div>

          <h2 class="login-title">Masuk Akun</h2>
          <p class="login-desc">Silakan masuk menggunakan akun karyawan, kasir, mekanik, atau pelanggan.</p>

          <form id="login-form">
            <div class="form-group">
              <label class="form-label" for="login-username">Username atau Email</label>
              <input class="form-control" id="login-username" name="username" type="text" placeholder="Contoh: superadmin / kasir" required autocomplete="username" />
            </div>
            <div class="form-group">
              <label class="form-label" for="login-password">Kata Sandi</label>
              <input class="form-control" id="login-password" name="password" type="password" placeholder="Masukkan kata sandi" required autocomplete="current-password" />
            </div>
            <div id="login-error" style="color: var(--state-red); font-size: 13px; margin-bottom: 12px; display: none;"></div>
            <button class="btn btn-primary btn-lg" type="submit" id="login-submit-btn" style="width: 100%;">
              ${msIcon('login', 'ms-sm')}
              <span>Masuk Sekarang</span>
            </button>
          </form>

          <div class="demo-accounts-box">
            <div class="demo-accounts-label">Pilih Cepat Akun Uji Coba (Password: <span class="mono">bengkel123</span>)</div>
            <div class="demo-role-grid">
              <button type="button" class="demo-role-btn" data-demo-user="superadmin">Super Admin</button>
              <button type="button" class="demo-role-btn" data-demo-user="owner">Owner</button>
              <button type="button" class="demo-role-btn" data-demo-user="admin">Admin</button>
              <button type="button" class="demo-role-btn" data-demo-user="kasir">Kasir</button>
              <button type="button" class="demo-role-btn" data-demo-user="mekanik">Mekanik</button>
              <button type="button" class="demo-role-btn" data-demo-user="pelanggan">Pelanggan</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  mountOfflineBanner();

  document.querySelectorAll('[data-demo-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('login-username').value = btn.dataset.demoUser;
      document.getElementById('login-password').value = 'bengkel123';
    });
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    errEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = `${msIcon('hourglass_top', 'ms-sm')}<span>Memproses...</span>`;

    try {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const res = await api.login(username, password);
      setToken(res.token);
      showToast(`Selamat datang, ${res.user.nama}`, 'success');
      await onSuccess();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${msIcon('login', 'ms-sm')}<span>Masuk Sekarang</span>`;
    }
  });
}

export function renderShell(root, onNavigate, onBack, onRefresh, onLogout) {
  const roleCode = store.roleCode;
  const user = store.user;
  const unreadCount = store.data?.Notifications?.filter((n) => !n.dibaca).length || 0;
  const routeInfo = getRouteLabel(store.currentRoute);
  const showBackBtn = !ROOT_TABS.has(store.currentRoute) && store.routeHistory.length > 1;
  const bottomTabs = getBottomNavTabs(roleCode);

  const navHtml = SIDEBAR_GROUPS.map((grp) => {
    const visibleItems = grp.items.filter((item) => roleCode === 'SUPER_ADMIN' || item.roles.includes(roleCode));
    if (visibleItems.length === 0) return '';
    return `
      <div class="nav-group">
        <div class="nav-group-title">${esc(grp.title)}</div>
        ${visibleItems
          .map((item) => {
            const count = getItemBadgeCount(item.id);
            return `
              <button type="button" class="nav-item ${store.currentRoute === item.id ? 'active' : ''}" data-nav="${item.id}">
                <span class="nav-item-left">
                  ${msIcon(item.icon, 'ms-sm')}
                  <span class="nav-item-label">${esc(item.label)}</span>
                </span>
                ${count ? `<span class="nav-count">${esc(count)}</span>` : ''}
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  }).join('');

  const initials = (user?.nama || 'BM')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  root.innerHTML = `
    <div class="offline-banner" id="offline-banner">Koneksi internet terputus. Pastikan jaringan aktif untuk sinkronisasi data.</div>

    <div class="app-shell">
      <aside class="sidebar" id="app-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <img src="/src/assets/images/bengkel_logo_emblem_1794865371761.jpg" alt="BENGKEL MOTOR" />
            <span class="sidebar-brand-title">BENGKEL MOTOR</span>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Navigasi Utama">
          ${navHtml}
        </nav>
      </aside>

      <div class="main-wrapper ${store.currentRoute === 'pos' ? 'pos-page-active' : ''}">
        <header class="top-app-bar">
          <div class="top-bar-left">
            ${
              showBackBtn
                ? `<button type="button" class="btn-icon" id="android-back-btn" aria-label="Kembali">${msIcon('arrow_back')}</button>`
                : `<img class="top-bar-logo" src="/src/assets/images/bengkel_logo_emblem_1794865371761.jpg" alt="BENGKEL MOTOR" />`
            }
            <div style="min-width:0;">
              <div class="top-bar-title">${esc(routeInfo.label)}</div>
            </div>
          </div>

          <div class="top-bar-right">
            <button type="button" class="btn-icon" id="topbar-refresh-btn" title="Muat Ulang Data" aria-label="Refresh">
              ${msIcon('refresh')}
            </button>
            <button type="button" class="btn-icon" id="topbar-notif-btn" title="Notifikasi" aria-label="Notifikasi">
              ${msIcon('notifications')}
              ${unreadCount > 0 ? `<span class="notif-dot-count">${unreadCount}</span>` : ''}
            </button>
            <button type="button" class="avatar-btn" id="topbar-profile-btn" title="${esc(user?.nama)}" aria-label="Akun">
              ${esc(initials)}
            </button>
            <button type="button" class="btn-icon" id="topbar-more-btn" title="Semua Menu" aria-label="Menu Lainnya">
              ${msIcon('more_vert')}
            </button>
          </div>
        </header>

        <main class="main-content" id="view-container"></main>
      </div>

      <nav class="bottom-nav" aria-label="Navigasi Bawah Android">
        ${bottomTabs
          .map((t) => {
            const isActive = store.currentRoute === t.id;
            return `
              <button type="button" class="bottom-nav-btn ${isActive ? 'active' : ''}" data-nav="${t.id}">
                <span class="bottom-nav-pill">${msIcon(t.icon)}</span>
                <span class="bottom-nav-label">${esc(t.label)}</span>
              </button>
            `;
          })
          .join('')}
      </nav>
    </div>
  `;

  mountOfflineBanner();

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => onNavigate(btn.dataset.nav));
  });

  document.getElementById('android-back-btn')?.addEventListener('click', onBack);
  document.getElementById('topbar-refresh-btn').addEventListener('click', onRefresh);
  document.getElementById('topbar-notif-btn').addEventListener('click', () => onNavigate('notifikasi'));
  document.getElementById('topbar-profile-btn').addEventListener('click', () => onNavigate('akun'));
  document.getElementById('topbar-more-btn').addEventListener('click', () => {
    openAllMenusSheet(onNavigate, onLogout);
  });
}

function openAllMenusSheet(onNavigate, onLogout) {
  const roleCode = store.roleCode;
  const groupsHtml = SIDEBAR_GROUPS.map((grp) => {
    const items = grp.items.filter((i) => i.id !== 'akun' && (roleCode === 'SUPER_ADMIN' || i.roles.includes(roleCode)));
    if (!items.length) return '';
    return `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:8px; letter-spacing:0.05em;">${esc(grp.title)}</div>
        <div class="all-menu-grid">
          ${items
            .map(
              (it) => `
                <button type="button" class="qa-btn" data-sheet-nav="${it.id}">
                  <span class="qa-icon">${msIcon(it.icon, 'ms-sm')}</span>
                  <span class="qa-label">${esc(it.label)}</span>
                </button>
              `
            )
            .join('')}
        </div>
      </div>
    `;
  }).join('');

  openModal({
    title: 'Semua Menu BENGKEL MOTOR',
    wide: true,
    bodyHtml: `
      ${groupsHtml}
      <button type="button" class="btn btn-destructive" id="sheet-logout-btn" style="width:100%; margin-top:8px;">
        ${msIcon('logout', 'ms-sm')}<span>Keluar dari Akun</span>
      </button>
    `,
    onMount: ({ close }) => {
      document.querySelectorAll('[data-sheet-nav]').forEach((b) =>
        b.addEventListener('click', () => {
          close();
          onNavigate(b.dataset.sheetNav);
        })
      );
      document.getElementById('sheet-logout-btn').onclick = () => {
        close();
        confirmDialog({
          title: 'Keluar dari Aplikasi?',
          message: 'Sesi aktif Anda akan diakhiri. Pastikan seluruh transaksi sudah tersimpan.',
          confirmText: 'Ya, Keluar',
          destructive: true,
          onConfirm: onLogout,
        });
      };
    },
  });
}

export function renderAccountSettings(container, onNavigate, onLogout, onRefresh) {
  const user = store.user || {};
  const settings = store.data?.Settings || {};
  const unreadNotif = store.data?.Notifications?.filter((n) => !n.dibaca).length || 0;
  const isSuperAdmin = store.roleCode === 'SUPER_ADMIN';
  const canEditWorkshop = hasRole('SUPER_ADMIN', 'OWNER');
  const initials = (user?.nama || 'BM')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const lastLoginText = user?.lastLogin
    ? new Date(user.lastLogin).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sesi aktif saat ini';

  container.innerHTML = `
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="avatar-btn" style="width:60px; height:60px; font-size:20px; border-color:var(--accent-red); flex-shrink:0;">${esc(initials)}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:18px; font-weight:800;">${esc(user?.nama)}</div>
          <div style="font-size:13px; color:#CBD5E1;">@${esc(user?.username)} · ${esc(user?.roleName)}</div>
          <div style="font-size:12px; color:#94A3B8; margin-top:2px;">${esc(settings.namaBengkel || 'BENGKEL MOTOR')}</div>
        </div>
      </div>
    </div>

    <div class="m3-card" style="margin-bottom:14px;">
      <div class="m3-card-header">
        <h3 class="m3-card-title">Informasi Profil Akun</h3>
        ${
          isSuperAdmin
            ? `<button type="button" class="btn btn-outlined btn-sm" id="acc-edit-profile-btn">${msIcon('edit', 'ms-sm')}<span>Ubah Profil</span></button>`
            : `<span class="status-tag status-green">Aktif</span>`
        }
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:8px; border-bottom:1px solid #F1F5F9;">
          <span class="meta-line">Nama Lengkap</span>
          <strong style="text-align:right;">${esc(user?.nama || '-')}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:8px; border-bottom:1px solid #F1F5F9;">
          <span class="meta-line">Username</span>
          <span class="mono" style="font-weight:600;">@${esc(user?.username || '-')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:8px; border-bottom:1px solid #F1F5F9;">
          <span class="meta-line">Hak Akses (Role)</span>
          <span class="status-tag status-blue">${esc(user?.roleName || store.roleCode)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:8px; border-bottom:1px solid #F1F5F9;">
          <span class="meta-line">Email</span>
          <span class="mono" style="text-align:right;">${esc(user?.email || '-')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:8px; border-bottom:1px solid #F1F5F9;">
          <span class="meta-line">No. HP / WhatsApp</span>
          <span class="mono" style="text-align:right;">${esc(user?.noHp || '-')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <span class="meta-line">Login Terakhir</span>
          <span class="mono" style="font-size:12px; text-align:right;">${esc(lastLoginText)}</span>
        </div>
      </div>
      ${
        !isSuperAdmin
          ? `<div class="meta-line" style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--border-color);">Untuk perubahan hak akses atau reset kata sandi, silakan hubungi Super Admin bengkel.</div>`
          : ''
      }
    </div>

    <div class="m3-card" style="margin-bottom:14px;">
      <div class="m3-card-header">
        <h3 class="m3-card-title">Pengaturan Akun &amp; Preferensi</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <button type="button" class="entity-card" id="acc-notif-row" style="flex-direction:row; align-items:center; justify-content:space-between; cursor:pointer; width:100%; text-align:left; min-height:56px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="stat-icon-box blue">${msIcon('notifications', 'ms-sm')}</div>
            <div>
              <div style="font-weight:700; font-size:14px;">Notifikasi Akun</div>
              <div class="meta-line">${unreadNotif > 0 ? `${unreadNotif} notifikasi belum dibaca` : 'Semua notifikasi sudah dibaca'}</div>
            </div>
          </div>
          ${msIcon('chevron_right')}
        </button>

        ${
          canEditWorkshop
            ? `
              <button type="button" class="entity-card" id="acc-workshop-row" style="flex-direction:row; align-items:center; justify-content:space-between; cursor:pointer; width:100%; text-align:left; min-height:56px;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div class="stat-icon-box amber">${msIcon('storefront', 'ms-sm')}</div>
                  <div>
                    <div style="font-weight:700; font-size:14px;">Pengaturan Identitas Bengkel &amp; Struk</div>
                    <div class="meta-line">${esc(settings.namaBengkel || 'BENGKEL MOTOR')} · Pajak ${settings.pajakAktif ? `${settings.pajakPersen}%` : 'Nonaktif'}</div>
                  </div>
                </div>
                ${msIcon('chevron_right')}
              </button>
            `
            : ''
        }

        ${
          isSuperAdmin
            ? `
              <button type="button" class="entity-card" id="acc-rbac-row" style="flex-direction:row; align-items:center; justify-content:space-between; cursor:pointer; width:100%; text-align:left; min-height:56px;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div class="stat-icon-box green">${msIcon('admin_panel_settings', 'ms-sm')}</div>
                  <div>
                    <div style="font-weight:700; font-size:14px;">Manajemen Akun Pengguna &amp; RBAC</div>
                    <div class="meta-line">Tambah akun, ubah role, atau nonaktifkan akses</div>
                  </div>
                </div>
                ${msIcon('chevron_right')}
              </button>
            `
            : ''
        }

        <button type="button" class="entity-card" id="acc-sync-row" style="flex-direction:row; align-items:center; justify-content:space-between; cursor:pointer; width:100%; text-align:left; min-height:56px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="stat-icon-box">${msIcon('sync', 'ms-sm')}</div>
            <div>
              <div style="font-weight:700; font-size:14px;">Sinkronisasi Data Akun</div>
              <div class="meta-line">Perbarui sesi &amp; data terbaru dari server</div>
            </div>
          </div>
          ${msIcon('chevron_right')}
        </button>
      </div>
    </div>

    <div class="m3-card">
      <div class="m3-card-header">
        <h3 class="m3-card-title">Keamanan &amp; Sesi Perangkat</h3>
      </div>
      <div class="meta-line" style="margin-bottom:12px;">
        Perangkat: ${isAndroidWebView() ? 'Android App (WebView)' : 'Web Browser'} · Status: ${navigator.onLine ? 'Online' : 'Offline'}
      </div>
      <button type="button" class="btn btn-destructive btn-lg" id="acc-logout-btn" style="width:100%;">
        ${msIcon('logout', 'ms-sm')}<span>Keluar dari Akun</span>
      </button>
    </div>
  `;

  document.getElementById('acc-notif-row').onclick = () => onNavigate('notifikasi');
  document.getElementById('acc-workshop-row')?.addEventListener('click', () => onNavigate('pengaturan'));
  document.getElementById('acc-rbac-row')?.addEventListener('click', () => onNavigate('pengguna'));
  document.getElementById('acc-sync-row').onclick = () => {
    if (typeof onRefresh === 'function') onRefresh();
  };

  document.getElementById('acc-edit-profile-btn')?.addEventListener('click', () => {
    openModal({
      title: 'Ubah Profil & Kata Sandi Akun',
      bodyHtml: `
        <form id="acc-edit-form">
          <div class="form-group">
            <label class="form-label">Nama Lengkap *</label>
            <input class="form-control" id="ae-nama" value="${esc(user?.nama || '')}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" id="ae-email" type="email" value="${esc(user?.email || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">No. HP / WhatsApp</label>
            <input class="form-control mono" id="ae-hp" value="${esc(user?.noHp || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Kata Sandi Baru (Kosongkan jika tidak diubah)</label>
            <input class="form-control" id="ae-pass" type="password" minlength="6" placeholder="Minimal 6 karakter" />
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pengaturan Akun</button>
        </form>
      `,
      onMount: ({ close }) => {
        document.getElementById('acc-edit-form').onsubmit = async (e) => {
          e.preventDefault();
          const payload = {
            nama: document.getElementById('ae-nama').value.trim(),
            email: document.getElementById('ae-email').value.trim(),
            noHp: document.getElementById('ae-hp').value.trim(),
          };
          const newPass = document.getElementById('ae-pass').value;
          if (newPass) payload.password = newPass;
          try {
            await api.updateUser(user.id, payload);
            close();
            if (typeof onRefresh === 'function') await onRefresh();
            showToast('Pengaturan akun berhasil diperbarui.', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      },
    });
  });

  document.getElementById('acc-logout-btn').onclick = () => {
    confirmDialog({
      title: 'Keluar dari Akun?',
      message: 'Anda akan keluar dari sesi BENGKEL MOTOR pada perangkat ini.',
      confirmText: 'Ya, Keluar',
      destructive: true,
      onConfirm: onLogout,
    });
  };
}

export const renderAccountAndAllMenus = renderAccountSettings;

