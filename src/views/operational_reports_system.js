import Chart from 'chart.js/auto';
import { store, refreshAllData, getCustomer, getVehicle, getEmployee, hasRole } from '../state.js';
import { api } from '../api.js';
import {
  esc,
  msIcon,
  formatRupiah,
  formatDate,
  formatDateTime,
  statusClass,
  showToast,
  openModal,
  confirmDialog,
  downloadCSV,
  downloadExcel,
  downloadTextFile,
  printDocumentHtml,
} from '../utils.js';

// ============================================================================
// OPERASIONAL: RESERVASI, ANTREAN, JADWAL, ABSENSI
// ============================================================================
export function renderAppointments(container, onNavigate) {
  const rows = store.data.Appointments || [];
  const customers = store.data.Customers || [];
  const vehicles = store.data.Vehicles || [];
  const services = (store.data.Services || []).filter((s) => s.statusAktif !== false);
  const mechanics = (store.data.Employees || []).filter((e) => e.statusAktif);

  container.innerHTML = `
    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada reservasi servis.</div>`
        : `<div class="card-list">
            ${rows
              .map((a) => {
                const c = getCustomer(a.customerId);
                const v = getVehicle(a.vehicleId);
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800;">${esc(a.noBooking)} · ${esc(v?.noPolisi || '-')}</div>
                        <div class="meta-line">${esc(c?.nama || '-')} · ${esc(v?.model || '')}</div>
                      </div>
                      <span class="status-tag ${statusClass(a.status)}">${esc(a.status)}</span>
                    </div>
                    <div style="font-size:13px;">
                      <div><strong>Jadwal:</strong> <span class="mono">${esc(a.tanggalBooking)} ${esc(a.jamBooking)}</span></div>
                      <div class="meta-line">Layanan: ${esc(a.serviceNames)}</div>
                    </div>
                    <div class="entity-card-actions">
                      ${
                        a.status === 'Menunggu' && hasRole('ADMIN', 'KASIR')
                          ? `<button type="button" class="btn btn-primary btn-sm" data-apt-confirm="${a.id}">Konfirmasi</button>`
                          : ''
                      }
                      ${
                        hasRole('ADMIN', 'KASIR') && a.status !== 'Dibatalkan'
                          ? `<button type="button" class="btn btn-outlined btn-sm" data-apt-intake="${a.id}">Terima Motor</button>`
                          : ''
                      }
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    <button type="button" class="fab" id="apt-add-btn">${msIcon('add')}<span>Booking</span></button>
  `;

  const openBookingModal = (preselectedServiceIds = []) => {
    const initialSrvId = preselectedServiceIds[0] || '';
    const renderPricePanel = (srvId) => {
      const srv = services.find((s) => s.id === srvId);
      if (!srv) {
        return `<div class="meta-line" style="padding:10px 12px; background:#F8FAFC; border:1px dashed var(--border-color); border-radius:10px;">Pilih layanan servis di atas untuk menampilkan harga dan estimasi pengerjaan.</div>`;
      }
      return `
        <div style="padding:12px; background:#FEF2F2; border:1px solid #FECACA; border-radius:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
            <strong style="font-size:13px;">${esc(srv.nama)}</strong>
            <span class="status-tag status-blue">${srv.estimasiMenit} menit</span>
          </div>
          <div class="meta-line" style="margin-bottom:8px;">${esc(srv.deskripsi || srv.categoryName || 'Layanan servis standar bengkel')}</div>
          <div style="display:flex; justify-content:space-between; font-size:13px; padding-top:8px; border-top:1px dashed #FCA5A5;">
            <span>Harga Jasa Standar: <strong class="mono" style="color:var(--accent-red);">${formatRupiah(srv.hargaJasa)}</strong></span>
            <span>Motor Sport: <strong class="mono">${formatRupiah(srv.hargaMotorSport || srv.hargaJasa)}</strong></span>
          </div>
        </div>
      `;
    };

    openModal({
      title: 'Booking Servis Kendaraan',
      bodyHtml: `
        <form id="apt-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Pelanggan *</label>
              <select class="form-control" id="ap-cust" ${store.roleCode === 'PELANGGAN' ? 'disabled' : ''}>
                ${customers.map((c) => `<option value="${c.id}">${esc(c.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Kendaraan *</label>
              <select class="form-control" id="ap-veh">
                ${vehicles.map((v) => `<option value="${v.id}">${esc(v.noPolisi)} · ${esc(v.model)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Tanggal Booking *</label><input class="form-control" id="ap-tgl" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
            <div class="form-group"><label class="form-label">Jam *</label><input class="form-control" id="ap-jam" type="time" value="10:00" required /></div>
            <div class="form-group full">
              <label class="form-label">Pilih Layanan *</label>
              <select class="form-control" id="ap-srv" required>
                <option value="">-- Pilih Layanan Servis --</option>
                ${services.map((s) => `<option value="${s.id}" data-name="${esc(s.nama)}" ${initialSrvId === s.id ? 'selected' : ''}>${esc(s.nama)} · Est. ${s.estimasiMenit} mnt</option>`).join('')}
              </select>
            </div>
            <div class="form-group full" id="ap-price-panel">
              ${renderPricePanel(initialSrvId)}
            </div>
            <div class="form-group full">
              <label class="form-label">Preferensi Mekanik (Opsional)</label>
              <select class="form-control" id="ap-mech">
                <option value="">Mekanik Tersedia</option>
                ${mechanics.map((m) => `<option value="${m.id}">${esc(m.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group full"><label class="form-label">Catatan / Keluhan</label><textarea class="form-control" id="ap-note"></textarea></div>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Kirim Booking Servis</button>
        </form>
      `,
      onMount: ({ close }) => {
        document.getElementById('ap-srv').onchange = (e) => {
          document.getElementById('ap-price-panel').innerHTML = renderPricePanel(e.target.value);
        };
        document.getElementById('apt-form').onsubmit = async (e) => {
          e.preventDefault();
          const srvSel = document.getElementById('ap-srv');
          if (!srvSel.value) {
            showToast('Silakan pilih layanan servis terlebih dahulu.', 'warning');
            return;
          }
          try {
            await api.createRow('Appointments', {
              customerId: document.getElementById('ap-cust').value,
              vehicleId: document.getElementById('ap-veh').value,
              serviceIds: [srvSel.value],
              serviceNames: srvSel.selectedOptions[0]?.dataset.name || '',
              tanggalBooking: document.getElementById('ap-tgl').value,
              jamBooking: document.getElementById('ap-jam').value,
              mechanicId: document.getElementById('ap-mech').value || null,
              catatan: document.getElementById('ap-note').value.trim(),
            });
            await refreshAllData();
            close();
            showToast('Booking servis berhasil dibuat.', 'success');
            renderAppointments(container, onNavigate);
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      },
    });
  };

  document.getElementById('apt-add-btn').onclick = () => openBookingModal([]);

  if (Array.isArray(store.pageStates.bookingServiceIds) && store.pageStates.bookingServiceIds.length > 0) {
    const picked = [...store.pageStates.bookingServiceIds];
    store.pageStates.bookingServiceIds = [];
    openBookingModal(picked);
  }

  container.querySelectorAll('[data-apt-confirm]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api.updateRow('Appointments', b.dataset.aptConfirm, { status: 'Dikonfirmasi' });
      await refreshAllData();
      showToast('Reservasi dikonfirmasi.', 'success');
      renderAppointments(container, onNavigate);
    })
  );

  container.querySelectorAll('[data-apt-intake]').forEach((b) =>
    b.addEventListener('click', () => onNavigate('penerimaan'))
  );
}

export function renderQueues(container) {
  const rows = store.data.Queues || [];
  const canUpdate = hasRole('ADMIN', 'KASIR');
  const queueStatuses = ['Menunggu', 'Dikonfirmasi', 'Dalam antrean', 'Sedang diperiksa', 'Sedang dikerjakan', 'Selesai', 'Dibatalkan'];

  container.innerHTML = `
    <div class="card-list">
      ${rows
        .map((q) => {
          const c = getCustomer(q.customerId);
          const v = getVehicle(q.vehicleId);
          return `
            <div class="entity-card">
              <div class="entity-card-top">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="mono" style="font-size:20px; font-weight:800; color:var(--accent-red);">${esc(q.nomorAntrean)}</div>
                  <div>
                    <div style="font-weight:700;">${esc(v?.noPolisi || '-')} · ${esc(v?.model || '')}</div>
                    <div class="meta-line">${esc(c?.nama || '-')} · Est. ${q.estimasiTungguMenit} mnt</div>
                  </div>
                </div>
                <span class="status-tag ${statusClass(q.status)}">${esc(q.status)}</span>
              </div>
              <div class="meta-line">${esc(q.keluhan)}</div>
              ${
                canUpdate
                  ? `<select class="form-control" data-q-status="${q.id}" style="min-height:42px;">
                      ${queueStatuses.map((s) => `<option value="${esc(s)}" ${q.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                    </select>`
                  : ''
              }
            </div>
          `;
        })
        .join('') || '<div class="m3-card empty-state">Belum ada antrean hari ini.</div>'}
    </div>
  `;

  container.querySelectorAll('[data-q-status]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      await api.updateRow('Queues', sel.dataset.qStatus, { status: sel.value });
      await refreshAllData();
      showToast('Status antrean diperbarui.', 'success');
      renderQueues(container);
    })
  );
}

export function renderSchedules(container) {
  const rows = store.data.Shifts || [];
  const emps = store.data.Employees || [];
  const canEdit = hasRole('ADMIN', 'OWNER');

  container.innerHTML = `
    <div class="card-list">
      ${rows
        .map(
          (s) => `
            <div class="entity-card">
              <div class="entity-card-top">
                <div>
                  <div style="font-weight:700;">${esc(s.employeeName)}</div>
                  <div class="meta-line">${esc(s.hari)}</div>
                </div>
                <span class="status-tag status-blue mono">${esc(s.jamMulai)} - ${esc(s.jamSelesai)}</span>
              </div>
              <div class="meta-line">Area/Pit: <strong>${esc(s.area)}</strong> ${s.catatan ? `· ${esc(s.catatan)}` : ''}</div>
            </div>
          `
        )
        .join('') || '<div class="m3-card empty-state">Belum ada jadwal shift.</div>'}
    </div>

    ${canEdit ? `<button type="button" class="fab" id="shf-add-btn">${msIcon('add')}<span>Jadwal</span></button>` : ''}
  `;

  document.getElementById('shf-add-btn')?.addEventListener('click', () => {
    openModal({
      title: 'Tambah Jadwal Kerja',
      bodyHtml: `
        <form id="shf-form">
          <div class="form-group"><label class="form-label">Pegawai</label><select class="form-control" id="sf-emp">${emps.map((e) => `<option value="${e.id}" data-name="${esc(e.nama)}">${esc(e.nama)}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Hari Kerja</label><input class="form-control" id="sf-hari" value="Senin - Sabtu" required /></div>
          <div class="form-grid">
            <div class="form-group"><label class="form-label">Jam Mulai</label><input class="form-control" id="sf-start" type="time" value="08:00" /></div>
            <div class="form-group"><label class="form-label">Jam Selesai</label><input class="form-control" id="sf-end" type="time" value="17:00" /></div>
          </div>
          <div class="form-group"><label class="form-label">Area / Pit</label><input class="form-control" id="sf-area" value="Pit Servis Umum" /></div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Jadwal</button>
        </form>
      `,
      onMount: ({ close }) => {
        document.getElementById('shf-form').onsubmit = async (e) => {
          e.preventDefault();
          const sel = document.getElementById('sf-emp');
          await api.createRow('Shifts', {
            employeeId: sel.value,
            employeeName: sel.selectedOptions[0].dataset.name,
            hari: document.getElementById('sf-hari').value.trim(),
            jamMulai: document.getElementById('sf-start').value,
            jamSelesai: document.getElementById('sf-end').value,
            area: document.getElementById('sf-area').value.trim(),
            catatan: '',
          });
          await refreshAllData();
          close();
          showToast('Jadwal kerja ditambahkan.', 'success');
          renderSchedules(container);
        };
      },
    });
  });
}

export function renderAttendance(container) {
  const rows = store.data.Attendance || [];
  const emps = store.data.Employees || [];

  container.innerHTML = `
    <div class="card-list">
      ${rows
        .map(
          (a) => `
            <div class="entity-card">
              <div class="entity-card-top">
                <div>
                  <div style="font-weight:700;">${esc(a.employeeName)}</div>
                  <div class="meta-line mono">${formatDate(a.tanggal)} · Masuk ${esc(a.jamMasuk || '-')} / Pulang ${esc(a.jamKeluar || '-')}</div>
                </div>
                <span class="status-tag ${statusClass(a.status)}">${esc(a.status)}</span>
              </div>
              ${a.catatan ? `<div class="meta-line">${esc(a.catatan)}</div>` : ''}
            </div>
          `
        )
        .join('') || '<div class="m3-card empty-state">Belum ada data absensi.</div>'}
    </div>

    <button type="button" class="fab" id="att-add-btn">${msIcon('fingerprint')}<span>Absensi</span></button>
  `;

  document.getElementById('att-add-btn').onclick = () => {
    const nowTime = new Date().toTimeString().slice(0, 5);
    openModal({
      title: 'Catat Kehadiran Pegawai',
      bodyHtml: `
        <form id="att-form">
          <div class="form-group"><label class="form-label">Pegawai</label><select class="form-control" id="at-emp">${emps.map((e) => `<option value="${e.id}" data-name="${esc(e.nama)}">${esc(e.nama)}</option>`).join('')}</select></div>
          <div class="form-grid">
            <div class="form-group"><label class="form-label">Tanggal</label><input class="form-control" id="at-tgl" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
            <div class="form-group"><label class="form-label">Status</label><select class="form-control" id="at-st"><option value="HADIR">HADIR</option><option value="TERLAMBAT">TERLAMBAT</option><option value="IZIN">IZIN</option><option value="SAKIT">SAKIT</option></select></div>
            <div class="form-group"><label class="form-label">Jam Masuk</label><input class="form-control" id="at-in" type="time" value="${nowTime}" /></div>
            <div class="form-group"><label class="form-label">Jam Keluar</label><input class="form-control" id="at-out" type="time" /></div>
          </div>
          <div class="form-group"><label class="form-label">Catatan</label><input class="form-control" id="at-note" /></div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Absensi</button>
        </form>
      `,
      onMount: ({ close }) => {
        document.getElementById('att-form').onsubmit = async (e) => {
          e.preventDefault();
          const sel = document.getElementById('at-emp');
          await api.createRow('Attendance', {
            tanggal: document.getElementById('at-tgl').value,
            employeeId: sel.value,
            employeeName: sel.selectedOptions[0].dataset.name,
            jamMasuk: document.getElementById('at-in').value,
            jamKeluar: document.getElementById('at-out').value,
            status: document.getElementById('at-st').value,
            catatan: document.getElementById('at-note').value.trim(),
          });
          await refreshAllData();
          close();
          showToast('Absensi dicatat.', 'success');
          renderAttendance(container);
        };
      },
    });
  };
}

// ============================================================================
// LAPORAN + EKSPOR PDF, EXCEL, CSV
// ============================================================================
let reportPeriod = 'bulanan';
let repChartInstance = null;

export function renderReports(container, reportType) {
  const validTrx = (store.data.Transactions || []).filter((t) => t.statusPembayaran !== 'DIBATALKAN');
  const now = new Date();
  const cutoffDays = reportPeriod === 'harian' ? 1 : reportPeriod === 'mingguan' ? 7 : reportPeriod === 'bulanan' ? 30 : 365;
  const inPeriod = (iso) => {
    if (!iso) return false;
    const diff = (now.getTime() - new Date(iso).getTime()) / 86400000;
    return diff <= cutoffDays;
  };

  const trxPeriod = validTrx.filter((t) => inPeriod(t.tanggal));
  const trxIds = new Set(trxPeriod.map((t) => t.id));
  const detailsPeriod = (store.data.Transaction_Details || []).filter((d) => trxIds.has(d.transactionId));
  const expPeriod = (store.data.Expenses || []).filter((e) => inPeriod(e.tanggal));
  const comPeriod = (store.data.Commissions || []).filter((c) => inPeriod(c.tanggal));
  const matUsagePeriod = (store.data.Material_Usages || []).filter((m) => inPeriod(m.tanggal));

  let title = 'Laporan Penjualan & Transaksi';
  let headers = [];
  let rows = [];
  let summaryHtml = '';

  if (reportType === 'laporan-penjualan') {
    title = 'Laporan Penjualan & Pembayaran';
    headers = ['No. Transaksi', 'Tanggal', 'Pelanggan', 'Metode', 'Jasa', 'Sparepart', 'Total', 'Status'];
    rows = trxPeriod.map((t) => [
      t.noTransaksi,
      formatDateTime(t.tanggal),
      getCustomer(t.customerId)?.nama || 'Umum',
      `${t.metodePembayaran} ${t.qrisMode || ''}`.trim(),
      t.subtotalJasa,
      t.subtotalSparepart,
      t.total,
      t.statusPembayaran,
    ]);
  } else if (reportType === 'laporan-servis') {
    title = 'Laporan Servis & Riwayat Kendaraan';
    headers = ['No. WO', 'Tanggal', 'Kendaraan', 'Mekanik', 'Tindakan', 'Total Biaya', 'Status'];
    rows = (store.data.Work_Orders || [])
      .filter((w) => inPeriod(w.createdAt))
      .map((w) => [
        w.noWo,
        formatDate(w.createdAt),
        getVehicle(w.vehicleId)?.noPolisi || '-',
        getEmployee(w.mechanicId)?.nama || '-',
        w.diagnosis || w.keluhan,
        w.estimasiBiaya,
        w.status,
      ]);
  } else if (reportType === 'laporan-inventory') {
    title = 'Laporan Stok Sparepart & Bahan';
    headers = ['Kode/SKU', 'Nama Item', 'Jenis', 'Stok', 'Min', 'Harga Beli', 'Nilai Aset'];
    rows = [
      ...(store.data.Spareparts || []).map((p) => [p.sku, p.nama, 'Sparepart', p.stok, p.stokMinimum, p.hargaBeli, p.stok * p.hargaBeli]),
      ...(store.data.Materials || []).map((m) => [m.kode, m.nama, 'Bahan Operasional', m.stok, m.stokMinimum, m.hargaBeli, m.stok * m.hargaBeli]),
    ];
  } else if (reportType === 'laporan-pembelian') {
    title = 'Laporan Pembelian & Supplier';
    headers = ['No. PO', 'Tanggal', 'Supplier', 'Total', 'Dibayar', 'Status Bayar', 'Status Terima'];
    rows = (store.data.Purchases || [])
      .filter((p) => inPeriod(p.tanggal))
      .map((p) => [p.noPembelian, formatDate(p.tanggal), p.supplierName, p.total, p.jumlahDibayar, p.statusPembayaran, p.statusPenerimaan]);
  } else if (reportType === 'laporan-utang-piutang') {
    title = 'Laporan Utang & Piutang';
    headers = ['Jenis', 'Referensi', 'Pihak Terkait', 'Jatuh Tempo', 'Total', 'Sisa', 'Status'];
    rows = [
      ...(store.data.Accounts_Payable || []).map((a) => ['Utang Supplier', a.noPembelian, a.supplierName, a.jatuhTempo, a.totalUtang, a.sisaUtang, a.status]),
      ...(store.data.Accounts_Receivable || []).map((a) => ['Piutang Pelanggan', a.noTransaksi, a.customerName, a.jatuhTempo, a.totalPiutang, a.sisaPiutang, a.status]),
    ];
  } else if (reportType === 'laporan-laba-rugi') {
    title = 'Laporan Laba Rugi (HPP Part & Bahan)';
    const omzetJasa = trxPeriod.reduce((s, t) => s + Number(t.subtotalJasa || 0), 0);
    const omzetPart = trxPeriod.reduce((s, t) => s + Number(t.subtotalSparepart || 0), 0);
    const totalOmzet = omzetJasa + omzetPart;
    const hppSparepart = detailsPeriod
      .filter((d) => d.itemType === 'sparepart')
      .reduce((s, d) => s + Number(d.hargaPokok || 0) * Number(d.qty || 1), 0);
    const hppBahan = matUsagePeriod.reduce((s, m) => s + Number(m.totalBiaya || 0), 0);
    const labaKotor = totalOmzet - hppSparepart - hppBahan;
    const totalKomisi = comPeriod.reduce((s, c) => s + Number(c.nominalKomisi || 0), 0);
    const totalBeban = expPeriod.reduce((s, e) => s + Number(e.nominal || 0), 0);
    const labaBersih = labaKotor - totalKomisi - totalBeban;

    headers = ['Pos Keuangan', 'Nominal (Rp)'];
    rows = [
      ['Pendapatan Jasa Servis', omzetJasa],
      ['Penjualan Sparepart', omzetPart],
      ['Total Pendapatan', totalOmzet],
      ['HPP Sparepart Terjual/Terpakai', -hppSparepart],
      ['HPP Bahan Operasional Terpakai', -hppBahan],
      ['Laba Kotor', labaKotor],
      ['Beban Komisi Mekanik', -totalKomisi],
      ['Beban Pengeluaran Operasional', -totalBeban],
      ['LABA BERSIH OPERASIONAL', labaBersih],
    ];
    summaryHtml = `
      <div class="kpi-android-grid" style="margin-bottom:14px;">
        <div class="stat-tile"><div><div class="stat-label">Pendapatan</div><div class="stat-val">${formatRupiah(totalOmzet)}</div></div><div class="stat-icon-box blue">${msIcon('trending_up')}</div></div>
        <div class="stat-tile"><div><div class="stat-label">Total HPP</div><div class="stat-val">${formatRupiah(hppSparepart + hppBahan)}</div></div><div class="stat-icon-box amber">${msIcon('inventory_2')}</div></div>
        <div class="stat-tile"><div><div class="stat-label">Beban &amp; Komisi</div><div class="stat-val">${formatRupiah(totalBeban + totalKomisi)}</div></div><div class="stat-icon-box red">${msIcon('payments')}</div></div>
        <div class="stat-tile"><div><div class="stat-label">Laba Bersih</div><div class="stat-val" style="color:var(--accent-red);">${formatRupiah(labaBersih)}</div></div><div class="stat-icon-box green">${msIcon('account_balance')}</div></div>
      </div>
    `;
  } else if (reportType === 'laporan-mekanik') {
    title = 'Laporan Performa & Komisi Mekanik';
    headers = ['Kode', 'Nama Mekanik', 'Jabatan', 'Total Pekerjaan', 'Dasar Jasa', 'Total Komisi'];
    rows = (store.data.Employees || []).map((emp) => {
      const mc = comPeriod.filter((c) => c.mechanicId === emp.id);
      return [
        emp.kode,
        emp.nama,
        emp.jabatan,
        mc.length,
        mc.reduce((s, c) => s + Number(c.dasarJasa || 0), 0),
        mc.reduce((s, c) => s + Number(c.nominalKomisi || 0), 0),
      ];
    });
  }

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
      <div class="chip-scroller" id="rep-period-tabs" style="margin-bottom:0;">
        <button type="button" class="m3-chip ${reportPeriod === 'harian' ? 'active' : ''}" data-rp="harian">Harian</button>
        <button type="button" class="m3-chip ${reportPeriod === 'mingguan' ? 'active' : ''}" data-rp="mingguan">Mingguan</button>
        <button type="button" class="m3-chip ${reportPeriod === 'bulanan' ? 'active' : ''}" data-rp="bulanan">Bulanan</button>
        <button type="button" class="m3-chip ${reportPeriod === 'tahunan' ? 'active' : ''}" data-rp="tahunan">Tahunan</button>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn btn-outlined btn-sm" id="rep-csv">CSV</button>
        <button type="button" class="btn btn-outlined btn-sm" id="rep-xls">Excel</button>
        <button type="button" class="btn btn-primary btn-sm" id="rep-pdf">${msIcon('print', 'ms-sm')}<span>PDF</span></button>
      </div>
    </div>

    ${summaryHtml}

    <div class="m3-card" style="margin-bottom:14px;">
      <div class="m3-card-header"><h3 class="m3-card-title">${esc(title)}</h3></div>
      <div class="chart-box" style="height:210px;">
        <canvas id="rep-chart-canvas"></canvas>
      </div>
    </div>

    <div class="m3-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${
              rows.length === 0
                ? `<tr><td colspan="${headers.length}" class="empty-state">Tidak ada data pada periode ini.</td></tr>`
                : rows
                    .map(
                      (r) =>
                        `<tr>${r
                          .map((c) =>
                            typeof c === 'number'
                              ? `<td class="td-right mono">${c > 1000 || c < -1000 ? formatRupiah(c) : c.toLocaleString('id-ID')}</td>`
                              : `<td>${esc(c)}</td>`
                          )
                          .join('')}</tr>`
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-rp]').forEach((b) =>
    b.addEventListener('click', () => {
      reportPeriod = b.dataset.rp;
      renderReports(container, reportType);
    })
  );

  document.getElementById('rep-csv').onclick = () => downloadCSV(`${reportType}-${reportPeriod}.csv`, headers, rows);
  document.getElementById('rep-xls').onclick = () => downloadExcel(`${reportType}-${reportPeriod}`, title, headers, rows);
  document.getElementById('rep-pdf').onclick = () => {
    printDocumentHtml(`
      <div style="font-family:sans-serif; padding:16px;">
        <h2>BENGKEL MOTOR — ${esc(title)} (${reportPeriod.toUpperCase()})</h2>
        <p>Dicetak: ${formatDateTime(new Date().toISOString())}</p>
        <table border="1" cellspacing="0" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead><tr>${headers.map((h) => `<th style="background:#f1f5f9;">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${typeof c === 'number' ? formatRupiah(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    `);
  };

  const canvas = document.getElementById('rep-chart-canvas');
  if (canvas) {
    if (repChartInstance) repChartInstance.destroy();
    const chartLabels = rows.slice(0, 8).map((r) => String(r[0]).slice(0, 18));
    const chartVals = rows.slice(0, 8).map((r) => {
      const nums = r.filter((v) => typeof v === 'number');
      return nums.length ? Math.abs(nums[nums.length - 1]) : 0;
    });
    repChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{ label: title, data: chartVals, backgroundColor: '#DC2626', borderRadius: 6 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
  }
}

// ============================================================================
// SISTEM: PENGGUNA, NOTIFIKASI, PENGATURAN, BACKUP & EKSPOR GAS / APK
// ============================================================================
export function renderUsers(container) {
  const users = store.data.Users || [];
  const roles = store.data.Roles || [];

  container.innerHTML = `
    <div class="card-list">
      ${users
        .map(
          (u) => `
            <div class="entity-card">
              <div class="entity-card-top">
                <div>
                  <div style="font-weight:700;">${esc(u.nama)}</div>
                  <div class="meta-line mono">@${esc(u.username)} · ${esc(u.roleName)}</div>
                </div>
                <span class="status-tag ${u.statusAktif ? 'status-green' : 'status-red'}">${u.statusAktif ? 'Aktif' : 'Nonaktif'}</span>
              </div>
              <div class="meta-line mono">${esc(u.email)} · ${esc(u.noHp)}</div>
              <div class="entity-card-actions">
                <span class="meta-line" style="flex:1;">Login: ${u.lastLogin ? formatDateTime(u.lastLogin) : '-'}</span>
                <button type="button" class="btn btn-outlined btn-sm" data-toggle-usr="${u.id}">${u.statusAktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </div>
            </div>
          `
        )
        .join('')}
    </div>

    <button type="button" class="fab" id="usr-add-btn">${msIcon('person_add')}<span>Pengguna</span></button>
  `;

  document.getElementById('usr-add-btn').onclick = () => {
    openModal({
      title: 'Tambah Pengguna Baru',
      bodyHtml: `
        <form id="usr-form">
          <div class="form-grid">
            <div class="form-group"><label class="form-label">Username *</label><input class="form-control" id="uf-user" required /></div>
            <div class="form-group"><label class="form-label">Nama Lengkap *</label><input class="form-control" id="uf-nama" required /></div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="uf-email" type="email" /></div>
            <div class="form-group"><label class="form-label">No. HP</label><input class="form-control" id="uf-hp" /></div>
            <div class="form-group"><label class="form-label">Hak Akses (Role) *</label><select class="form-control" id="uf-role">${roles.map((r) => `<option value="${r.id}">${esc(r.nama)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Password *</label><input class="form-control" id="uf-pass" type="password" minlength="6" required /></div>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pengguna</button>
        </form>
      `,
      onMount: ({ close }) => {
        document.getElementById('usr-form').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api.createUser({
              username: document.getElementById('uf-user').value.trim(),
              nama: document.getElementById('uf-nama').value.trim(),
              email: document.getElementById('uf-email').value.trim(),
              noHp: document.getElementById('uf-hp').value.trim(),
              roleId: document.getElementById('uf-role').value,
              password: document.getElementById('uf-pass').value,
            });
            await refreshAllData();
            close();
            showToast('Pengguna baru dibuat dengan password ter-hash.', 'success');
            renderUsers(container);
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      },
    });
  };

  container.querySelectorAll('[data-toggle-usr]').forEach((b) =>
    b.addEventListener('click', () => {
      const u = users.find((x) => x.id === b.dataset.toggleUsr);
      if (!u) return;
      confirmDialog({
        title: `${u.statusAktif ? 'Nonaktifkan' : 'Aktifkan'} Akun @${u.username}?`,
        message: 'Perubahan status akun akan langsung diterapkan pada sesi autentikasi pengguna.',
        confirmText: u.statusAktif ? 'Nonaktifkan' : 'Aktifkan',
        destructive: u.statusAktif,
        onConfirm: async () => {
          await api.updateUser(u.id, { statusAktif: !u.statusAktif });
          await refreshAllData();
          showToast('Status pengguna diperbarui.', 'success');
          renderUsers(container);
        },
      });
    })
  );
}

let notifCat = 'ALL';
export function renderNotifications(container) {
  const all = store.data.Notifications || [];
  const types = Array.from(new Set(all.map((n) => n.tipe).filter(Boolean)));
  const rows = notifCat === 'ALL' ? all : all.filter((n) => n.tipe === notifCat);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
      <div class="chip-scroller" style="margin-bottom:0;">
        <button type="button" class="m3-chip ${notifCat === 'ALL' ? 'active' : ''}" data-not-cat="ALL">Semua (${all.length})</button>
        ${types
          .map(
            (tp) =>
              `<button type="button" class="m3-chip ${notifCat === tp ? 'active' : ''}" data-not-cat="${esc(tp)}">${esc(tp)}</button>`
          )
          .join('')}
      </div>
      <button type="button" class="btn btn-outlined btn-sm" id="not-read-all">${msIcon('done_all', 'ms-sm')}<span>Tandai Semua Dibaca</span></button>
    </div>

    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada notifikasi pada kategori ini.</div>`
        : `<div class="card-list">
            ${rows
              .map(
                (n) => `
                  <div class="entity-card" style="${!n.dibaca ? 'border-color:var(--accent-red);' : ''}">
                    <div class="entity-card-top">
                      <div style="display:flex; align-items:center; gap:8px;">
                        ${!n.dibaca ? `<span style="width:8px;height:8px;border-radius:50%;background:var(--accent-red);flex-shrink:0;"></span>` : ''}
                        <span class="status-tag status-blue">${esc(n.tipe)}</span>
                      </div>
                      <span class="meta-line mono">${formatDateTime(n.tanggal)}</span>
                    </div>
                    <div>
                      <div style="font-weight:700; font-size:14px;">${esc(n.judul)}</div>
                      <div class="meta-line">${esc(n.pesan)}</div>
                    </div>
                    ${
                      !n.dibaca
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-outlined btn-sm" data-read-not="${n.id}">Tandai Dibaca</button></div>`
                        : ''
                    }
                  </div>
                `
              )
              .join('')}
          </div>`
    }
  `;

  container.querySelectorAll('[data-not-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      notifCat = b.dataset.notCat;
      renderNotifications(container);
    })
  );

  document.getElementById('not-read-all').onclick = async () => {
    await api.readNotification('all');
    await refreshAllData();
    showToast('Semua notifikasi ditandai sudah dibaca.', 'success');
    renderNotifications(container);
  };
  container.querySelectorAll('[data-read-not]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api.readNotification(b.dataset.readNot);
      await refreshAllData();
      renderNotifications(container);
    })
  );
}

export function renderSettings(container) {
  const s = store.data.Settings || {};
  container.innerHTML = `
    <div class="m3-card" style="max-width:780px;">
      <div class="m3-card-header"><h3 class="m3-card-title">Pengaturan Sistem Bengkel</h3></div>
      <form id="settings-form">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nama Bengkel</label><input class="form-control" id="st-nama" value="${esc(s.namaBengkel)}" required /></div>
          <div class="form-group"><label class="form-label">Telepon / WhatsApp</label><input class="form-control" id="st-telp" value="${esc(s.teleponBengkel)}" /></div>
          <div class="form-group full"><label class="form-label">Alamat Bengkel</label><input class="form-control" id="st-alamat" value="${esc(s.alamatBengkel)}" /></div>
          <div class="form-group"><label class="form-label">Merchant ID QRIS (NMID)</label><input class="form-control mono" id="st-qris" value="${esc(s.qrisMerchantId)}" /></div>
          <div class="form-group"><label class="form-label">Persentase Pajak (%)</label><input class="form-control mono" id="st-tax-pct" type="number" min="0" max="30" value="${s.pajakPersen ?? 11}" /></div>
          <div class="form-group"><label class="form-label">Komisi Default Mekanik (%)</label><input class="form-control mono" id="st-komisi" type="number" min="0" max="100" value="${s.komisiDefaultPersen ?? 30}" /></div>
          <div class="form-group"><label class="form-label">Garansi Servis Default (Hari)</label><input class="form-control mono" id="st-garansi" type="number" min="0" value="${s.garansiDefaultHari ?? 14}" /></div>
          <div class="form-group full"><label class="form-label">Pesan Footer Struk</label><textarea class="form-control" id="st-struk">${esc(s.pesanStruk)}</textarea></div>
          <div class="form-group full" style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="st-tax-on" ${s.pajakAktif ? 'checked' : ''} /><span>Aktifkan Pajak di Kasir POS</span></label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="st-partial" ${s.izinkanPembayaranSebagian ? 'checked' : ''} /><span>Izinkan Pembayaran Sebagian (Piutang)</span></label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="st-dyn-qris" ${s.qrisDinamisApiAktif ? 'checked' : ''} /><span>Aktifkan Verifikasi QRIS Dinamis</span></label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pengaturan</button>
      </form>
    </div>
  `;

  document.getElementById('settings-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.saveSettings({
        namaBengkel: document.getElementById('st-nama').value.trim(),
        teleponBengkel: document.getElementById('st-telp').value.trim(),
        alamatBengkel: document.getElementById('st-alamat').value.trim(),
        qrisMerchantId: document.getElementById('st-qris').value.trim(),
        pajakPersen: Number(document.getElementById('st-tax-pct').value || 0),
        komisiDefaultPersen: Number(document.getElementById('st-komisi').value || 30),
        garansiDefaultHari: Number(document.getElementById('st-garansi').value || 14),
        pesanStruk: document.getElementById('st-struk').value.trim(),
        pajakAktif: document.getElementById('st-tax-on').checked,
        izinkanPembayaranSebagian: document.getElementById('st-partial').checked,
        qrisDinamisApiAktif: document.getElementById('st-dyn-qris').checked,
      });
      await refreshAllData();
      showToast('Pengaturan sistem berhasil diperbarui.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

export function renderBackupAndDeliverables(container) {
  container.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      <button type="button" class="btn btn-primary" id="bk-download-json">${msIcon('cloud_download', 'ms-sm')}<span>Unduh Backup JSON (39 Tabel)</span></button>
      ${hasRole('SUPER_ADMIN') ? `<button type="button" class="btn btn-destructive" id="bk-reset-demo">${msIcon('restart_alt', 'ms-sm')}<span>Reset Data Demo</span></button>` : ''}
    </div>

    <div class="m3-card">
      <div class="m3-card-header">
        <h3 class="m3-card-title">Paket Kode Google Apps Script, Google Sheets (39 Sheet) &amp; Android WebView</h3>
      </div>
      <div id="deliverables-list" class="meta-line">Memuat file sumber...</div>
    </div>
  `;

  document.getElementById('bk-download-json').onclick = async () => {
    try {
      const snap = await api.exportBackup();
      downloadTextFile(`bengkel-motor-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snap, null, 2), 'application/json');
      showToast(`Backup ${snap.tableCount} tabel berhasil diunduh.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('bk-reset-demo')?.addEventListener('click', () => {
    confirmDialog({
      title: 'Reset Data ke Kondisi Demo Awal?',
      message: 'Semua transaksi, Work Order, dan perubahan data akan dikembalikan ke kondisi awal.',
      confirmText: 'Ya, Reset Database',
      destructive: true,
      onConfirm: async () => {
        await api.resetDemo();
        await refreshAllData();
        showToast('Database dikembalikan ke kondisi data awal.', 'success');
      },
    });
  });

  api.getDeliverables().then(({ deliverables }) => {
    const holder = document.getElementById('deliverables-list');
    if (!holder) return;
    holder.innerHTML = deliverables
      .map(
        (d, idx) => `
          <div class="entity-card" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
              <div><strong>${esc(d.title)}</strong> <span class="meta-line mono">(${esc(d.path)})</span></div>
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn btn-outlined btn-sm" data-copy-deliv="${idx}">Salin Kode</button>
                <button type="button" class="btn btn-dark btn-sm" data-dl-deliv="${idx}">Unduh File</button>
              </div>
            </div>
            <pre class="code-viewer">${esc(d.content)}</pre>
          </div>
        `
      )
      .join('');

    holder.querySelectorAll('[data-copy-deliv]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = deliverables[Number(b.dataset.copyDeliv)];
        await navigator.clipboard.writeText(item.content);
        showToast(`${item.path} disalin ke clipboard.`, 'success');
      })
    );
    holder.querySelectorAll('[data-dl-deliv]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = deliverables[Number(b.dataset.dlDeliv)];
        const fileName = item.path.split('/').pop();
        downloadTextFile(fileName, item.content);
      })
    );
  });
}
