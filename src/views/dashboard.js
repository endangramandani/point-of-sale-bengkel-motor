import Chart from 'chart.js/auto';
import { store, getCustomer, getVehicle, getEmployee, hasRole } from '../state.js';
import { esc, msIcon, formatRupiah, formatDateTime, statusClass } from '../utils.js';
import { SIDEBAR_GROUPS, getItemBadgeCount } from './navigation.js';

let revChartInstance = null;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat Pagi';
  if (h < 15) return 'Selamat Siang';
  if (h < 19) return 'Selamat Sore';
  return 'Selamat Malam';
}

let aksiCepatExpanded = false;

const PRIORITY_MODULE_IDS = [
  'penerimaan',
  'pos',
  'work-order',
  'sparepart',
  'bahan',
  'supplier',
  'pembelian',
  'utang',
  'piutang',
  'pelanggan',
  'kendaraan',
  'antrean',
  'reservasi',
  'layanan',
  'komisi',
  'laporan-penjualan',
];

function getRolePermittedModules(roleCode) {
  const map = new Map();
  const groups = [];
  for (const grp of SIDEBAR_GROUPS) {
    const items = grp.items.filter(
      (i) => i.id !== 'dashboard' && i.id !== 'akun' && (roleCode === 'SUPER_ADMIN' || i.roles.includes(roleCode))
    );
    if (items.length) {
      groups.push({ title: grp.title, items });
      for (const it of items) {
        map.set(it.id, it);
      }
    }
  }

  const ordered = [];
  for (const id of PRIORITY_MODULE_IDS) {
    if (map.has(id)) {
      ordered.push(map.get(id));
      map.delete(id);
    }
  }
  for (const it of map.values()) {
    ordered.push(it);
  }
  return { ordered, groups };
}

function renderModuleTileHtml(it, isAccent = false) {
  const badge = getItemBadgeCount(it.id);
  const label = it.id === 'penerimaan' ? '+ Servis Baru' : it.id === 'pos' ? 'Kasir / POS' : it.label;
  return `
    <button type="button" class="qa-btn ${isAccent ? 'accent' : ''}" data-qa="${it.id}" style="position:relative;">
      ${
        badge
          ? `<span class="mono" style="position:absolute; top:6px; right:6px; min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:var(--accent-red); color:#fff; font-size:10px; font-weight:700; display:inline-flex; align-items:center; justify-content:center;">${esc(badge)}</span>`
          : ''
      }
      <span class="qa-icon">${msIcon(it.icon, 'ms-sm')}</span>
      <span class="qa-label">${esc(label)}</span>
    </button>
  `;
}

function renderAksiCepatHtml(roleCode) {
  const { ordered, groups } = getRolePermittedModules(roleCode);
  const previewLimit = 7;
  const hasMore = ordered.length > previewLimit;
  const previewItems = hasMore ? ordered.slice(0, previewLimit) : ordered;
  const hiddenCount = Math.max(0, ordered.length - previewLimit);

  if (!aksiCepatExpanded) {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:14px; font-weight:700;">Aksi Cepat</div>
        ${
          hasMore
            ? `<button type="button" class="btn-text" id="qa-header-toggle" style="min-height:32px; font-size:12px;">Lainnya (${ordered.length})</button>`
            : ''
        }
      </div>
      <div class="quick-actions-grid">
        ${previewItems.map((it, idx) => renderModuleTileHtml(it, idx < 2)).join('')}
        ${
          hasMore
            ? `
              <button type="button" class="qa-btn" id="qa-more-btn" style="border-style:dashed; background:#F8FAFC;">
                <span class="qa-icon" style="background:var(--bg-charcoal); color:#FFFFFF;">${msIcon('apps', 'ms-sm')}</span>
                <span class="qa-label">Lainnya (+${hiddenCount})</span>
              </button>
            `
            : ''
        }
      </div>
    `;
  }

  return `
    <div class="m3-card" style="margin-bottom:16px;">
      <div class="m3-card-header">
        <div>
          <h3 class="m3-card-title">Aksi Cepat — Semua Modul (${ordered.length})</h3>
          <div class="meta-line">Pilih modul untuk langsung membuka halaman</div>
        </div>
        <button type="button" class="btn btn-outlined btn-sm" id="qa-less-btn">
          ${msIcon('expand_less', 'ms-sm')}<span>Lebih Sedikit</span>
        </button>
      </div>
      ${groups
        .map(
          (grp) => `
            <div style="margin-bottom:14px;">
              <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:8px; letter-spacing:0.05em;">${esc(grp.title)}</div>
              <div class="all-menu-grid">
                ${grp.items.map((it) => renderModuleTileHtml(it, it.id === 'penerimaan' || it.id === 'pos')).join('')}
              </div>
            </div>
          `
        )
        .join('')}
      <button type="button" class="btn btn-secondary btn-sm" id="qa-less-bottom-btn" style="width:100%;">
        ${msIcon('expand_less', 'ms-sm')}<span>Tutup Lainnya</span>
      </button>
    </div>
  `;
}

function bindAksiCepatEvents(container, onNavigate, rerenderFn) {
  container.querySelectorAll('[data-qa]').forEach((b) =>
    b.addEventListener('click', () => onNavigate(b.dataset.qa))
  );
  const expandFn = () => {
    aksiCepatExpanded = true;
    rerenderFn();
  };
  const collapseFn = () => {
    aksiCepatExpanded = false;
    rerenderFn();
  };
  document.getElementById('qa-more-btn')?.addEventListener('click', expandFn);
  document.getElementById('qa-header-toggle')?.addEventListener('click', expandFn);
  document.getElementById('qa-less-btn')?.addEventListener('click', collapseFn);
  document.getElementById('qa-less-bottom-btn')?.addEventListener('click', collapseFn);
}

export function renderDashboard(container, onNavigate) {
  const d = store.dashboard;
  const k = d?.kpis || {};
  const roleCode = store.roleCode;
  const settings = store.data?.Settings || {};
  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (roleCode === 'PELANGGAN') {
    renderCustomerDashboard(container, onNavigate, todayFormatted, settings);
    return;
  }

  if (roleCode === 'MEKANIK') {
    renderMechanicDashboard(container, onNavigate, todayFormatted, settings);
    return;
  }

  const recentWOs = d?.recentWorkOrders || [];
  const activityLogs = (store.data?.Activity_Logs || []).slice(0, 6);
  const lowStocks = d?.lowStockList || [];

  container.innerHTML = `
    <div class="greeting-banner">
      <div>
        <div class="greeting-hi">${getGreeting()}, ${esc(store.user.nama)}</div>
        <div class="greeting-meta">${esc(settings.namaBengkel || 'BENGKEL MOTOR')} · ${esc(todayFormatted)}</div>
      </div>
    </div>

    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-size:12px; color:#94A3B8; font-weight:600;">Pendapatan Hari Ini</div>
          <div class="mono" style="font-size:28px; font-weight:800; margin-top:4px; letter-spacing:-0.02em;">${formatRupiah(k.pendapatanHariIni)}</div>
          <div style="font-size:12px; color:#CBD5E1; margin-top:4px;">
            ${k.transaksiHariIni || 0} transaksi · Jasa ${formatRupiah(k.totalPendapatanJasa)} · Part ${formatRupiah(k.totalPenjualanSparepart)}
          </div>
        </div>
        ${
          hasRole('KASIR', 'ADMIN')
            ? `<button type="button" class="btn btn-primary" id="hero-pos-btn">${msIcon('point_of_sale', 'ms-sm')}<span>Buka Kasir</span></button>`
            : ''
        }
      </div>
    </div>

    <div class="kpi-android-grid">
      <div class="stat-tile">
        <div>
          <div class="stat-label">Kendaraan Masuk</div>
          <div class="stat-val tabular">${k.kendaraanMasukHariIni || 0}</div>
        </div>
        <div class="stat-icon-box blue">${msIcon('two_wheeler')}</div>
      </div>
      <div class="stat-tile">
        <div>
          <div class="stat-label">Servis Dikerjakan</div>
          <div class="stat-val tabular">${k.servisDikerjakan || 0}</div>
        </div>
        <div class="stat-icon-box amber">${msIcon('engineering')}</div>
      </div>
      <div class="stat-tile">
        <div>
          <div class="stat-label">Servis Selesai</div>
          <div class="stat-val tabular">${k.servisSelesai || 0}</div>
        </div>
        <div class="stat-icon-box green">${msIcon('check_circle')}</div>
      </div>
      <div class="stat-tile">
        <div>
          <div class="stat-label">Antrean &amp; Stok Menipis</div>
          <div class="stat-val tabular">${k.antreanServis || 0} / <span style="color:var(--state-red);">${k.stokHampirHabis || 0}</span></div>
        </div>
        <div class="stat-icon-box red">${msIcon('warning')}</div>
      </div>
    </div>

    ${renderAksiCepatHtml(roleCode)}

    <div class="grid-2" style="margin-bottom:14px;">
      <div class="m3-card">
        <div class="m3-card-header">
          <h3 class="m3-card-title">Grafik Pendapatan</h3>
          <div class="chip-scroller" style="margin-bottom:0;" id="chart-period-tabs">
            <button type="button" class="m3-chip active" data-period="harian">Harian</button>
            <button type="button" class="m3-chip" data-period="mingguan">Mingguan</button>
            <button type="button" class="m3-chip" data-period="bulanan">Bulanan</button>
            <button type="button" class="m3-chip" data-period="tahunan">Tahunan</button>
          </div>
        </div>
        <div class="chart-box">
          <canvas id="dash-revenue-chart"></canvas>
        </div>
      </div>

      <div class="m3-card">
        <div class="m3-card-header">
          <h3 class="m3-card-title">Daftar Servis Terbaru</h3>
          <button type="button" class="btn-text" data-goto="work-order">Semua WO</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            recentWOs.length === 0
              ? `<div class="empty-state">Belum ada servis masuk.</div>`
              : recentWOs
                  .slice(0, 5)
                  .map((w) => {
                    const cust = getCustomer(w.customerId);
                    const veh = getVehicle(w.vehicleId);
                    const mech = getEmployee(w.mechanicId);
                    return `
                      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; border:1px solid var(--border-color); border-radius:12px;">
                        <div style="min-width:0;">
                          <div style="font-weight:700; font-size:13px;">${esc(veh?.noPolisi || '-')} · ${esc(veh?.model || '')}</div>
                          <div class="meta-line mono">${esc(w.noWo)} · ${esc(cust?.nama || '-')} · ${esc(mech?.nama || 'Belum ditugaskan')}</div>
                        </div>
                        <span class="status-tag ${statusClass(w.status)}">${esc(w.status)}</span>
                      </div>
                    `;
                  })
                  .join('')
          }
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="m3-card">
        <div class="m3-card-header">
          <h3 class="m3-card-title">Stok Hampir Habis (${lowStocks.length})</h3>
          <button type="button" class="btn-text" data-goto="sparepart">Kelola Stok</button>
        </div>
        ${
          lowStocks.length === 0
            ? `<div class="meta-line">Seluruh stok sparepart dalam kondisi aman.</div>`
            : `<div style="display:flex; flex-direction:column; gap:8px;">
                ${lowStocks
                  .slice(0, 5)
                  .map(
                    (p) => `
                      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--state-red-bg); border-radius:10px;">
                        <div>
                          <div style="font-weight:600; font-size:13px;">${esc(p.nama)}</div>
                          <div class="meta-line mono">${esc(p.sku)} · Min ${p.stokMinimum}</div>
                        </div>
                        <span class="mono" style="font-weight:700; color:var(--state-red);">${p.stok} ${esc(p.satuan)}</span>
                      </div>
                    `
                  )
                  .join('')}
              </div>`
        }
      </div>

      <div class="m3-card">
        <div class="m3-card-header">
          <h3 class="m3-card-title">Aktivitas Terbaru</h3>
        </div>
        ${
          activityLogs.length === 0
            ? `<div class="meta-line">Belum ada log aktivitas tercatat pada peran ini.</div>`
            : `<div style="display:flex; flex-direction:column; gap:8px;">
                ${activityLogs
                  .map(
                    (a) => `
                      <div style="display:flex; gap:10px; align-items:flex-start; padding-bottom:8px; border-bottom:1px solid #F1F5F9;">
                        <div class="stat-icon-box" style="width:32px; height:32px; border-radius:8px;">${msIcon('history', 'ms-sm')}</div>
                        <div style="min-width:0;">
                          <div style="font-size:13px; font-weight:600;">${esc(a.detail)}</div>
                          <div class="meta-line">${esc(a.userName)} · ${formatDateTime(a.tanggal)}</div>
                        </div>
                      </div>
                    `
                  )
                  .join('')}
              </div>`
        }
      </div>
    </div>
  `;

  document.getElementById('hero-pos-btn')?.addEventListener('click', () => onNavigate('pos'));
  bindAksiCepatEvents(container, onNavigate, () => renderDashboard(container, onNavigate));
  container.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => onNavigate(b.dataset.goto))
  );

  renderDashboardChart('harian');
  document.querySelectorAll('#chart-period-tabs .m3-chip').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#chart-period-tabs .m3-chip').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderDashboardChart(tab.dataset.period);
    });
  });
}

function renderDashboardChart(period) {
  const charts = store.dashboard?.charts;
  if (!charts) return;
  const series = charts[period] || charts.harian;
  const canvas = document.getElementById('dash-revenue-chart');
  if (!canvas) return;
  if (revChartInstance) revChartInstance.destroy();
  revChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [
        { label: 'Jasa Servis', data: series.jasa, backgroundColor: '#111317', borderRadius: 6 },
        { label: 'Sparepart', data: series.sparepart, backgroundColor: '#DC2626', borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => 'Rp ' + Number(v).toLocaleString('id-ID') },
        },
      },
    },
  });
}

function renderMechanicDashboard(container, onNavigate, todayFormatted, settings) {
  const myWOs = store.data.Work_Orders || [];
  const myComs = store.data.Commissions || [];
  const activeCount = myWOs.filter((w) => !['Selesai', 'Sudah diserahkan', 'Dibatalkan'].includes(w.status)).length;
  const doneCount = myWOs.filter((w) => ['Selesai', 'Sudah diserahkan'].includes(w.status)).length;
  const totalKomisi = myComs.reduce((s, c) => s + Number(c.nominalKomisi || 0), 0);

  container.innerHTML = `
    <div class="greeting-banner">
      <div>
        <div class="greeting-hi">${getGreeting()}, ${esc(store.user.nama)}</div>
        <div class="greeting-meta">Mekanik · ${esc(settings.namaBengkel || 'BENGKEL MOTOR')} · ${esc(todayFormatted)}</div>
      </div>
    </div>

    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="font-size:12px; color:#94A3B8;">Total Komisi Diperoleh</div>
      <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(totalKomisi)}</div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button type="button" class="btn btn-primary btn-sm" id="mk-go-wo">${msIcon('build', 'ms-sm')}<span>Work Order Saya (${activeCount})</span></button>
        <button type="button" class="btn btn-secondary btn-sm" id="mk-go-com">${msIcon('workspace_premium', 'ms-sm')}<span>Komisi</span></button>
      </div>
    </div>

    <div class="kpi-android-grid">
      <div class="stat-tile"><div><div class="stat-label">WO Aktif</div><div class="stat-val">${activeCount}</div></div><div class="stat-icon-box amber">${msIcon('engineering')}</div></div>
      <div class="stat-tile"><div><div class="stat-label">WO Selesai</div><div class="stat-val">${doneCount}</div></div><div class="stat-icon-box green">${msIcon('check_circle')}</div></div>
    </div>

    ${renderAksiCepatHtml('MEKANIK')}

    <div class="m3-card">
      <div class="m3-card-header"><h3 class="m3-card-title">Tugas Work Order Anda</h3></div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${myWOs
          .map((w) => {
            const v = getVehicle(w.vehicleId);
            return `
              <div style="padding:12px; border:1px solid var(--border-color); border-radius:12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                  <div style="font-weight:700;">${esc(v?.noPolisi || '-')} · ${esc(v?.model || '')}</div>
                  <div class="meta-line mono">${esc(w.noWo)} · ${esc(w.keluhan)}</div>
                </div>
                <span class="status-tag ${statusClass(w.status)}">${esc(w.status)}</span>
              </div>
            `;
          })
          .join('') || '<div class="empty-state">Belum ada tugas WO.</div>'}
      </div>
    </div>
  `;
  document.getElementById('mk-go-wo').onclick = () => onNavigate('work-order');
  document.getElementById('mk-go-com').onclick = () => onNavigate('komisi');
  bindAksiCepatEvents(container, onNavigate, () =>
    renderMechanicDashboard(container, onNavigate, todayFormatted, settings)
  );
}

function renderCustomerDashboard(container, onNavigate, todayFormatted, settings) {
  const vehicles = store.data.Vehicles || [];
  const wos = store.data.Work_Orders || [];
  const bookings = store.data.Appointments || [];

  container.innerHTML = `
    <div class="greeting-banner">
      <div>
        <div class="greeting-hi">${getGreeting()}, ${esc(store.user.nama)}</div>
        <div class="greeting-meta">${esc(settings.namaBengkel || 'BENGKEL MOTOR')} · ${esc(todayFormatted)}</div>
      </div>
    </div>

    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="font-size:15px; font-weight:700;">Layanan Servis &amp; Booking Cepat</div>
      <div style="font-size:12px; color:#CBD5E1; margin:4px 0 12px;">Pantau progres servis motor Anda atau buat jadwal booking tanpa antre.</div>
      <button type="button" class="btn btn-primary" id="cu-go-book">${msIcon('event_available', 'ms-sm')}<span>Booking Servis Sekarang</span></button>
    </div>

    <div class="kpi-android-grid">
      <div class="stat-tile"><div><div class="stat-label">Motor Terdaftar</div><div class="stat-val">${vehicles.length}</div></div><div class="stat-icon-box blue">${msIcon('two_wheeler')}</div></div>
      <div class="stat-tile"><div><div class="stat-label">Work Order</div><div class="stat-val">${wos.length}</div></div><div class="stat-icon-box amber">${msIcon('build')}</div></div>
      <div class="stat-tile"><div><div class="stat-label">Booking Aktif</div><div class="stat-val">${bookings.length}</div></div><div class="stat-icon-box green">${msIcon('event_available')}</div></div>
    </div>

    ${renderAksiCepatHtml('PELANGGAN')}

    <div class="m3-card">
      <div class="m3-card-header"><h3 class="m3-card-title">Status Servis Kendaraan Anda</h3><button type="button" class="btn-text" id="cu-go-wo">Detail</button></div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${wos
          .map((w) => {
            const v = getVehicle(w.vehicleId);
            return `
              <div style="padding:12px; border:1px solid var(--border-color); border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:700;">${esc(v?.noPolisi || '-')} · ${esc(v?.model || '')}</div>
                  <div class="meta-line mono">${esc(w.noWo)} · Est. ${formatRupiah(w.estimasiBiaya)}</div>
                </div>
                <span class="status-tag ${statusClass(w.status)}">${esc(w.status)}</span>
              </div>
            `;
          })
          .join('') || '<div class="empty-state">Belum ada riwayat servis.</div>'}
      </div>
    </div>
  `;
  document.getElementById('cu-go-book').onclick = () => onNavigate('reservasi');
  document.getElementById('cu-go-wo').onclick = () => onNavigate('work-order');
  bindAksiCepatEvents(container, onNavigate, () =>
    renderCustomerDashboard(container, onNavigate, todayFormatted, settings)
  );
}
