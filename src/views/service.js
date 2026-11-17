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
  printDocumentHtml,
  readFileAsDataUrl,
  paginate,
  renderPaginationHtml,
} from '../utils.js';

export const WO_STATUSES = [
  'Menunggu pemeriksaan',
  'Sedang diperiksa',
  'Menunggu persetujuan pelanggan',
  'Menunggu sparepart',
  'Siap dikerjakan',
  'Sedang dikerjakan',
  'Menunggu pengujian',
  'Selesai',
  'Sudah diserahkan',
  'Dibatalkan',
];

let intakeState = {
  step: 1,
  customerId: '',
  vehicleId: '',
  kmMasuk: '',
  bahanBakar: '50%',
  kondisiDiterima: 'Bodi utuh, spion & lampu lengkap',
  barangBawaan: '',
  keluhan: '',
  mechanicId: '',
  estimasiBiaya: 0,
  serviceIds: [],
  fotoKendaraan: '',
  fotoKerusakan: '',
};

function renderServiceTopTabs(activeId, onNavigate) {
  if (!onNavigate || store.roleCode === 'PELANGGAN') return '';
  const canIntake = hasRole('SUPER_ADMIN', 'ADMIN', 'KASIR');
  const canCatalog = hasRole('SUPER_ADMIN', 'ADMIN', 'OWNER', 'KASIR');
  return `
    <div class="m3-tabs" id="srv-top-tabs">
      <button type="button" class="m3-tab-btn ${activeId === 'work-order' ? 'active' : ''}" data-srv-nav="work-order">Work Order</button>
      ${canIntake ? `<button type="button" class="m3-tab-btn ${activeId === 'penerimaan' ? 'active' : ''}" data-srv-nav="penerimaan">Servis Baru</button>` : ''}
      ${canCatalog ? `<button type="button" class="m3-tab-btn ${activeId === 'layanan' ? 'active' : ''}" data-srv-nav="layanan">Layanan Servis</button>` : ''}
    </div>
  `;
}

function bindServiceTopTabs(container, onNavigate) {
  if (!onNavigate) return;
  container.querySelectorAll('#srv-top-tabs [data-srv-nav]').forEach((b) =>
    b.addEventListener('click', () => onNavigate(b.dataset.srvNav))
  );
}

export function renderVehicleIntake(container, onNavigate) {
  const customers = store.data.Customers || [];
  const vehicles = intakeState.customerId
    ? (store.data.Vehicles || []).filter((v) => v.customerId === intakeState.customerId)
    : store.data.Vehicles || [];
  const mechanics = (store.data.Employees || []).filter(
    (e) => e.statusAktif && e.jabatan.toLowerCase().includes('mekanik')
  );
  const services = (store.data.Services || []).filter((s) => s.statusAktif);
  const recentIntake = store.data.Service_Orders || [];

  const stepLabels = ['1. Pelanggan & Motor', '2. Kondisi & Foto', '3. Keluhan & Layanan'];

  container.innerHTML = `
    ${renderServiceTopTabs('penerimaan', onNavigate)}
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
      <div>
        <div style="font-size:13px; font-weight:700; color:var(--accent-red);">${stepLabels[intakeState.step - 1]}</div>
        <div class="meta-line">Langkah ${intakeState.step} dari 3 · Penerimaan Servis Kendaraan</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn btn-outlined btn-sm" id="intake-add-cust-btn">${msIcon('person_add', 'ms-sm')}<span>Pelanggan Baru</span></button>
        <button type="button" class="btn btn-secondary btn-sm" id="intake-goto-wo">${msIcon('build', 'ms-sm')}<span>Daftar WO</span></button>
      </div>
    </div>

    <div class="step-indicator">
      <div class="step-pill ${intakeState.step >= 1 ? 'done' : ''}"></div>
      <div class="step-pill ${intakeState.step >= 2 ? 'done' : ''}"></div>
      <div class="step-pill ${intakeState.step >= 3 ? 'done' : ''}"></div>
    </div>

    <div class="grid-2" style="align-items:start;">
      <div class="m3-card">
        <form id="intake-wizard-form">
          ${
            intakeState.step === 1
              ? `
                <div class="form-group">
                  <label class="form-label">Pelanggan *</label>
                  <select class="form-control" id="in-cust" required>
                    <option value="">-- Pilih Pelanggan --</option>
                    ${customers
                      .map(
                        (c) =>
                          `<option value="${c.id}" ${intakeState.customerId === c.id ? 'selected' : ''}>${esc(c.nama)} (${esc(c.noWa)})</option>`
                      )
                      .join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Kendaraan (No. Polisi) *</label>
                  <select class="form-control" id="in-veh" required>
                    <option value="">-- Pilih Kendaraan --</option>
                    ${vehicles
                      .map(
                        (v) =>
                          `<option value="${v.id}" ${intakeState.vehicleId === v.id ? 'selected' : ''}>${esc(v.noPolisi)} · ${esc(v.merek)} ${esc(v.model)} (${v.tahun})</option>`
                      )
                      .join('')}
                  </select>
                </div>
                <div style="display:flex; justify-content:flex-end; margin-top:12px;">
                  <button type="button" class="btn btn-primary" id="in-next-1"><span>Lanjut: Kondisi &amp; Foto</span>${msIcon('arrow_forward', 'ms-sm')}</button>
                </div>
              `
              : intakeState.step === 2
              ? `
                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">Kilometer Saat Masuk *</label>
                    <input class="form-control mono" id="in-km" type="number" min="0" value="${esc(intakeState.kmMasuk)}" placeholder="14500" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Indikator Bahan Bakar</label>
                    <select class="form-control" id="in-fuel">
                      ${['Penuh (100%)', '75%', '50%', '25%', 'Hampir Habis (E)']
                        .map((f) => `<option value="${f}" ${intakeState.bahanBakar === f ? 'selected' : ''}>${f}</option>`)
                        .join('')}
                    </select>
                  </div>
                  <div class="form-group full">
                    <label class="form-label">Kondisi Kendaraan Saat Diterima</label>
                    <input class="form-control" id="in-kondisi" value="${esc(intakeState.kondisiDiterima)}" />
                  </div>
                  <div class="form-group full">
                    <label class="form-label">Barang Bawaan Kendaraan</label>
                    <input class="form-control" id="in-barang" value="${esc(intakeState.barangBawaan)}" placeholder="Contoh: STNK, Jas Hujan, Helm" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Foto Kendaraan (Kamera / Galeri)</label>
                    <input class="form-control" id="in-foto-veh" type="file" accept="image/*" capture="environment" />
                    ${intakeState.fotoKendaraan ? `<img src="${esc(intakeState.fotoKendaraan)}" alt="Foto kendaraan" style="height:68px;object-fit:cover;margin-top:6px;border-radius:10px;" />` : ''}
                  </div>
                  <div class="form-group">
                    <label class="form-label">Foto Kerusakan (Jika Ada)</label>
                    <input class="form-control" id="in-foto-dmg" type="file" accept="image/*" capture="environment" />
                    ${intakeState.fotoKerusakan ? `<img src="${esc(intakeState.fotoKerusakan)}" alt="Foto kerusakan" style="height:68px;object-fit:cover;margin-top:6px;border-radius:10px;" />` : ''}
                  </div>
                </div>
                <div style="display:flex; justify-content:space-between; gap:8px; margin-top:12px;">
                  <button type="button" class="btn btn-outlined" id="in-prev-2">${msIcon('arrow_back', 'ms-sm')}<span>Kembali</span></button>
                  <button type="button" class="btn btn-primary" id="in-next-2"><span>Lanjut: Keluhan</span>${msIcon('arrow_forward', 'ms-sm')}</button>
                </div>
              `
              : `
                <div class="form-group">
                  <label class="form-label">Keluhan Pelanggan *</label>
                  <textarea class="form-control" id="in-keluhan" placeholder="Tuliskan keluhan utama kendaraan..." required>${esc(intakeState.keluhan)}</textarea>
                </div>
                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">Mekanik yang Ditugaskan</label>
                    <select class="form-control" id="in-mech">
                      <option value="">-- Tentukan Nanti --</option>
                      ${mechanics.map((m) => `<option value="${m.id}" ${intakeState.mechanicId === m.id ? 'selected' : ''}>${esc(m.nama)} (${esc(m.keahlian)})</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Estimasi Biaya Awal (Rp)</label>
                    <input class="form-control mono" id="in-est-biaya" type="number" min="0" value="${intakeState.estimasiBiaya}" />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Pilih Layanan Awal (Opsional)</label>
                  <div style="display:grid; grid-template-columns:1fr; gap:8px; max-height:170px; overflow-y:auto; padding:10px; border:1px solid var(--border-color); border-radius:12px;">
                    ${services
                      .map(
                        (s) => `
                          <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
                            <input type="checkbox" name="in-services" value="${s.id}" ${intakeState.serviceIds.includes(s.id) ? 'checked' : ''} />
                            <span style="flex:1;">${esc(s.nama)}</span>
                            <span class="mono" style="font-weight:600;">${formatRupiah(s.hargaJasa)}</span>
                          </label>
                        `
                      )
                      .join('')}
                  </div>
                </div>
                <div style="display:flex; justify-content:space-between; gap:8px; margin-top:12px;">
                  <button type="button" class="btn btn-outlined" id="in-prev-3">${msIcon('arrow_back', 'ms-sm')}<span>Kembali</span></button>
                  <button type="submit" class="btn btn-primary" style="flex:1;">${msIcon('check_circle', 'ms-sm')}<span>Simpan &amp; Buat Work Order</span></button>
                </div>
              `
          }
        </form>
      </div>

      <div class="m3-card">
        <div class="m3-card-header">
          <h3 class="m3-card-title">Penerimaan Servis Terbaru</h3>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            recentIntake.length === 0
              ? `<div class="empty-state">Belum ada penerimaan servis.</div>`
              : recentIntake
                  .slice(0, 8)
                  .map((so) => {
                    const c = getCustomer(so.customerId);
                    const v = getVehicle(so.vehicleId);
                    return `
                      <div class="entity-card">
                        <div class="entity-card-top">
                          <div>
                            <div class="mono" style="font-weight:700;">${esc(so.noOrder)} · ${esc(v?.noPolisi || '-')}</div>
                            <div class="meta-line">${esc(c?.nama || '-')} · ${esc(v?.model || '')} · ${Number(so.kmMasuk || 0).toLocaleString('id-ID')} km</div>
                          </div>
                          <span class="status-tag ${statusClass(so.status)}">${esc(so.status)}</span>
                        </div>
                        <div class="entity-card-actions">
                          <span class="meta-line" style="flex:1;">${formatDateTime(so.tanggalMasuk)}</span>
                          <button type="button" class="btn btn-outlined btn-sm" data-print-so="${so.id}">${msIcon('print', 'ms-sm')}<span>Cetak Bukti</span></button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')
          }
        </div>
      </div>
    </div>
  `;

  bindServiceTopTabs(container, onNavigate);
  document.getElementById('intake-goto-wo').onclick = () => onNavigate('work-order');
  document.getElementById('intake-add-cust-btn').onclick = () => openQuickCustVehModal(() => renderVehicleIntake(container, onNavigate));

  document.getElementById('in-cust')?.addEventListener('change', (e) => {
    intakeState.customerId = e.target.value;
    intakeState.vehicleId = '';
    renderVehicleIntake(container, onNavigate);
  });
  document.getElementById('in-veh')?.addEventListener('change', (e) => {
    intakeState.vehicleId = e.target.value;
    const v = getVehicle(e.target.value);
    if (v && !intakeState.kmMasuk) intakeState.kmMasuk = v.kilometerTerakhir || 0;
  });

  document.getElementById('in-next-1')?.addEventListener('click', () => {
    if (!intakeState.customerId || !intakeState.vehicleId) {
      showToast('Pilih pelanggan dan kendaraan terlebih dahulu.', 'warning');
      return;
    }
    intakeState.step = 2;
    renderVehicleIntake(container, onNavigate);
  });

  document.getElementById('in-prev-2')?.addEventListener('click', () => {
    saveStep2();
    intakeState.step = 1;
    renderVehicleIntake(container, onNavigate);
  });
  document.getElementById('in-next-2')?.addEventListener('click', () => {
    saveStep2();
    if (intakeState.kmMasuk === '' || Number(intakeState.kmMasuk) < 0) {
      showToast('Masukkan kilometer kendaraan saat masuk.', 'warning');
      return;
    }
    intakeState.step = 3;
    renderVehicleIntake(container, onNavigate);
  });

  document.getElementById('in-prev-3')?.addEventListener('click', () => {
    saveStep3();
    intakeState.step = 2;
    renderVehicleIntake(container, onNavigate);
  });

  document.getElementById('in-foto-veh')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const up = await api.upload(dataUrl, file.name);
      intakeState.fotoKendaraan = up.url;
      showToast('Foto kendaraan berhasil diunggah.', 'success');
      renderVehicleIntake(container, onNavigate);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('in-foto-dmg')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const up = await api.upload(dataUrl, file.name);
      intakeState.fotoKerusakan = up.url;
      showToast('Foto kerusakan berhasil diunggah.', 'success');
      renderVehicleIntake(container, onNavigate);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('intake-wizard-form').onsubmit = async (e) => {
    e.preventDefault();
    if (intakeState.step === 1) {
      document.getElementById('in-next-1')?.click();
      return;
    }
    if (intakeState.step === 2) {
      document.getElementById('in-next-2')?.click();
      return;
    }
    saveStep3();
    if (!intakeState.keluhan) {
      showToast('Keluhan pelanggan wajib diisi.', 'warning');
      return;
    }
    try {
      const res = await api.createServiceOrder({
        customerId: intakeState.customerId,
        vehicleId: intakeState.vehicleId,
        kmMasuk: Number(intakeState.kmMasuk || 0),
        bahanBakar: intakeState.bahanBakar,
        keluhan: intakeState.keluhan,
        kondisiDiterima: intakeState.kondisiDiterima,
        barangBawaan: intakeState.barangBawaan,
        mechanicId: intakeState.mechanicId || null,
        estimasiBiaya: Number(intakeState.estimasiBiaya || 0),
        serviceIds: intakeState.serviceIds,
        fotoKendaraan: intakeState.fotoKendaraan,
        fotoKerusakan: intakeState.fotoKerusakan,
      });
      intakeState = {
        step: 1,
        customerId: '',
        vehicleId: '',
        kmMasuk: '',
        bahanBakar: '50%',
        kondisiDiterima: 'Bodi utuh, spion & lampu lengkap',
        barangBawaan: '',
        keluhan: '',
        mechanicId: '',
        estimasiBiaya: 0,
        serviceIds: [],
        fotoKendaraan: '',
        fotoKerusakan: '',
      };
      await refreshAllData();
      showToast(`Penerimaan ${res.so.noOrder} & ${res.wo.noWo} dibuat (Antrean ${res.queue.nomorAntrean}).`, 'success');
      printIntakeReceipt(res.so, res.wo, res.queue);
      renderVehicleIntake(container, onNavigate);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  container.querySelectorAll('[data-print-so]').forEach((b) =>
    b.addEventListener('click', () => {
      const so = recentIntake.find((s) => s.id === b.dataset.printSo);
      const wo = store.data.Work_Orders.find((w) => w.serviceOrderId === so.id);
      const q = store.data.Queues.find((qu) => qu.serviceOrderId === so.id);
      if (so) printIntakeReceipt(so, wo, q);
    })
  );
}

function saveStep2() {
  const kmEl = document.getElementById('in-km');
  if (kmEl) intakeState.kmMasuk = kmEl.value;
  const fuelEl = document.getElementById('in-fuel');
  if (fuelEl) intakeState.bahanBakar = fuelEl.value;
  const konEl = document.getElementById('in-kondisi');
  if (konEl) intakeState.kondisiDiterima = konEl.value.trim();
  const brgEl = document.getElementById('in-barang');
  if (brgEl) intakeState.barangBawaan = brgEl.value.trim();
}

function saveStep3() {
  const kelEl = document.getElementById('in-keluhan');
  if (kelEl) intakeState.keluhan = kelEl.value.trim();
  const mechEl = document.getElementById('in-mech');
  if (mechEl) intakeState.mechanicId = mechEl.value;
  const estEl = document.getElementById('in-est-biaya');
  if (estEl) intakeState.estimasiBiaya = Number(estEl.value || 0);
  const chks = document.querySelectorAll('input[name="in-services"]:checked');
  if (chks.length || document.querySelector('input[name="in-services"]')) {
    intakeState.serviceIds = Array.from(chks).map((el) => el.value);
  }
}

function openQuickCustVehModal(onDone) {
  openModal({
    title: 'Tambah Pelanggan & Kendaraan Baru',
    bodyHtml: `
      <form id="quick-cust-veh-form">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nama Pelanggan *</label><input class="form-control" id="qc-nama" required /></div>
          <div class="form-group"><label class="form-label">Nomor WhatsApp *</label><input class="form-control mono" id="qc-wa" placeholder="62812..." required /></div>
          <div class="form-group full"><label class="form-label">Alamat</label><input class="form-control" id="qc-alamat" /></div>
          <div class="form-group"><label class="form-label">No. Polisi Motor *</label><input class="form-control mono" id="qc-nopol" placeholder="B 1234 XYZ" required /></div>
          <div class="form-group"><label class="form-label">Merek *</label><input class="form-control" id="qc-merek" placeholder="Honda / Yamaha" required /></div>
          <div class="form-group"><label class="form-label">Model / Tipe *</label><input class="form-control" id="qc-model" placeholder="Vario 160 / NMAX" required /></div>
          <div class="form-group"><label class="form-label">Tahun &amp; Warna</label><input class="form-control" id="qc-warna" placeholder="2024 - Hitam" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%; margin-top:8px;">Simpan Pelanggan &amp; Kendaraan</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('quick-cust-veh-form').onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          const cust = await api.createRow('Customers', {
            nama: document.getElementById('qc-nama').value.trim(),
            noWa: document.getElementById('qc-wa').value.trim(),
            alamat: document.getElementById('qc-alamat').value.trim(),
          });
          const veh = await api.createRow('Vehicles', {
            customerId: cust.id,
            noPolisi: document.getElementById('qc-nopol').value.trim().toUpperCase(),
            merek: document.getElementById('qc-merek').value.trim(),
            model: document.getElementById('qc-model').value.trim(),
            tahun: 2024,
            warna: document.getElementById('qc-warna').value.trim() || '-',
            kilometerTerakhir: 0,
          });
          intakeState.customerId = cust.id;
          intakeState.vehicleId = veh.id;
          await refreshAllData();
          close();
          showToast('Pelanggan dan kendaraan baru ditambahkan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

function printIntakeReceipt(so, wo, queue) {
  const c = getCustomer(so.customerId);
  const v = getVehicle(so.vehicleId);
  const m = getEmployee(so.mechanicId);
  const s = store.data.Settings || {};
  printDocumentHtml(`
    <div style="font-family: sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 20px;">
      <div style="display:flex; justify-content:space-between; border-bottom: 2px solid #111317; padding-bottom: 10px; margin-bottom: 14px;">
        <div>
          <h2 style="margin:0;">${esc(s.namaBengkel || 'BENGKEL MOTOR')}</h2>
          <div style="font-size:12px;">${esc(s.alamatBengkel || '')} · ${esc(s.teleponBengkel || '')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;">BUKTI PENERIMAAN SERVIS</div>
          <div class="mono">${esc(so.noOrder)} / ${esc(wo?.noWo || '')}</div>
          ${queue ? `<div class="mono">Antrean: ${esc(queue.nomorAntrean)}</div>` : ''}
        </div>
      </div>
      <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:14px;">
        <tr><td style="padding:4px 0; width:160px;">Tanggal Masuk</td><td>: ${formatDateTime(so.tanggalMasuk)}</td></tr>
        <tr><td style="padding:4px 0;">Pelanggan</td><td>: ${esc(c?.nama || '-')} (${esc(c?.noWa || '')})</td></tr>
        <tr><td style="padding:4px 0;">Kendaraan</td><td>: ${esc(v?.noPolisi || '-')} · ${esc(v?.merek || '')} ${esc(v?.model || '')} (${v?.tahun || ''})</td></tr>
        <tr><td style="padding:4px 0;">Kilometer / BBM</td><td>: ${Number(so.kmMasuk || 0).toLocaleString('id-ID')} km · BBM ${esc(so.bahanBakar)}</td></tr>
        <tr><td style="padding:4px 0;">Kondisi &amp; Bawaan</td><td>: ${esc(so.kondisiDiterima)} · Bawaan: ${esc(so.barangBawaan)}</td></tr>
        <tr><td style="padding:4px 0;">Keluhan</td><td>: ${esc(so.keluhan)}</td></tr>
        <tr><td style="padding:4px 0;">Mekanik &amp; Estimasi</td><td>: ${esc(m?.nama || 'Menunggu penugasan')} · Estimasi ${formatRupiah(so.estimasiBiaya)}</td></tr>
      </table>
      <div style="display:flex; justify-content:space-between; margin-top:36px; font-size:12px; text-align:center;">
        <div style="width:200px;">Pelanggan<br/><br/><br/>( ${esc(c?.nama || '................')} )</div>
        <div style="width:200px;">Penerima Servis<br/><br/><br/>( ${esc(store.user?.nama || 'Admin')} )</div>
      </div>
    </div>
  `);
}

let woFilter = { search: '', status: 'ALL', page: 1 };

const WO_FILTER_CHIPS = [
  { id: 'ALL', label: 'Semua' },
  { id: 'Menunggu pemeriksaan', label: 'Menunggu' },
  { id: 'Sedang diperiksa', label: 'Pemeriksaan' },
  { id: 'Menunggu persetujuan pelanggan', label: 'Persetujuan' },
  { id: 'Menunggu sparepart', label: 'Sparepart' },
  { id: 'Sedang dikerjakan', label: 'Dikerjakan' },
  { id: 'Menunggu pengujian', label: 'Pengujian' },
  { id: 'Selesai', label: 'Selesai' },
];

export function renderWorkOrders(container, onNavigate, mode = 'work-order') {
  const all = store.data.Work_Orders || [];
  const q = woFilter.search.toLowerCase();
  const filtered = all.filter((w) => {
    const c = getCustomer(w.customerId);
    const v = getVehicle(w.vehicleId);
    const matchText =
      w.noWo.toLowerCase().includes(q) ||
      (c?.nama || '').toLowerCase().includes(q) ||
      (v?.noPolisi || '').toLowerCase().includes(q) ||
      (w.keluhan || '').toLowerCase().includes(q);
    const matchStatus =
      mode === 'daftar-servis'
        ? !['Sudah diserahkan', 'Dibatalkan'].includes(w.status) &&
          (woFilter.status === 'ALL' || w.status === woFilter.status)
        : woFilter.status === 'ALL' || w.status === woFilter.status;
    return matchText && matchStatus;
  });
  const paged = paginate(filtered, woFilter.page, 10);
  const canEditTech = hasRole('ADMIN', 'KASIR', 'MEKANIK');

  container.innerHTML = `
    ${mode === 'work-order' ? renderServiceTopTabs('work-order', onNavigate) : ''}
    <div style="margin-bottom:12px;">
      <div class="search-box" style="margin-bottom:10px;">
        ${msIcon('search')}
        <input class="form-control" id="wo-search" type="search" placeholder="Cari No. WO, No. Polisi, Pelanggan, Keluhan..." value="${esc(woFilter.search)}" />
      </div>
      <div class="chip-scroller">
        ${WO_FILTER_CHIPS.map(
          (ch) =>
            `<button type="button" class="m3-chip ${woFilter.status === ch.id ? 'active' : ''}" data-wo-chip="${esc(ch.id)}">${esc(ch.label)}</button>`
        ).join('')}
      </div>
    </div>

    ${
      paged.rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada Work Order ditemukan.</div>`
        : `<div class="card-list">
            ${paged.rows
              .map((w) => {
                const c = getCustomer(w.customerId);
                const v = getVehicle(w.vehicleId);
                const m = getEmployee(w.mechanicId);
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800; font-size:14px;">${esc(w.noWo)} · ${esc(v?.noPolisi || '-')}</div>
                        <div class="meta-line">${esc(v?.merek || '')} ${esc(v?.model || '')} · ${formatDate(w.createdAt)}</div>
                      </div>
                      <span class="status-tag ${statusClass(w.status)}">${esc(w.status)}</span>
                    </div>

                    <div style="font-size:13px;">
                      <div style="font-weight:600;">${esc(c?.nama || '-')}</div>
                      <div class="meta-line" style="margin-top:2px;">Keluhan: ${esc(w.keluhan)}</div>
                      ${w.diagnosis ? `<div class="meta-line">Diag: ${esc(w.diagnosis)}</div>` : ''}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                      <span>Mekanik: <strong>${esc(m?.nama || 'Belum ditugaskan')}</strong></span>
                      <span class="mono" style="font-weight:800; color:var(--accent-red);">${formatRupiah(w.estimasiBiaya)}</span>
                    </div>

                    <div class="entity-card-actions">
                      <button type="button" class="btn btn-dark btn-sm" data-open-wo="${w.id}" data-wo-tab="info">Lihat Detail</button>
                      ${
                        canEditTech
                          ? `
                            <button type="button" class="btn btn-outlined btn-sm" data-open-wo="${w.id}" data-wo-tab="check">Edit / Status</button>
                            ${store.roleCode !== 'MEKANIK' ? `<button type="button" class="btn btn-outlined btn-sm" data-quick-mech="${w.id}">Mekanik</button>` : ''}
                            <button type="button" class="btn btn-outlined btn-sm" data-open-wo="${w.id}" data-wo-tab="parts">+ Sparepart</button>
                          `
                          : ''
                      }
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    ${renderPaginationHtml(paged, 'wo')}

    ${
      hasRole('ADMIN', 'KASIR')
        ? `<button type="button" class="fab" id="wo-new-intake-btn">${msIcon('add')}<span>Servis Baru</span></button>`
        : ''
    }
  `;

  bindServiceTopTabs(container, onNavigate);
  document.getElementById('wo-new-intake-btn')?.addEventListener('click', () => onNavigate('penerimaan'));
  document.getElementById('wo-search').oninput = (e) => {
    woFilter.search = e.target.value;
    woFilter.page = 1;
    renderWorkOrders(container, onNavigate, mode);
    const inp = document.getElementById('wo-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  };
  container.querySelectorAll('[data-wo-chip]').forEach((b) =>
    b.addEventListener('click', () => {
      woFilter.status = b.dataset.woChip;
      woFilter.page = 1;
      renderWorkOrders(container, onNavigate, mode);
    })
  );
  container.querySelector('[data-pg-prev]')?.addEventListener('click', () => {
    woFilter.page -= 1;
    renderWorkOrders(container, onNavigate, mode);
  });
  container.querySelector('[data-pg-next]')?.addEventListener('click', () => {
    woFilter.page += 1;
    renderWorkOrders(container, onNavigate, mode);
  });

  container.querySelectorAll('[data-open-wo]').forEach((b) =>
    b.addEventListener('click', () =>
      openWorkOrderDetailModal(b.dataset.openWo, () => renderWorkOrders(container, onNavigate, mode), b.dataset.woTab || 'info')
    )
  );

  container.querySelectorAll('[data-quick-mech]').forEach((b) =>
    b.addEventListener('click', () => openQuickAssignMechanicSheet(b.dataset.quickMech, () => renderWorkOrders(container, onNavigate, mode)))
  );
}

function openQuickAssignMechanicSheet(woId, onDone) {
  const wo = store.data.Work_Orders.find((w) => w.id === woId);
  const mechanics = (store.data.Employees || []).filter((e) => e.statusAktif);
  if (!wo) return;
  openModal({
    title: `Tugaskan Mekanik — ${wo.noWo}`,
    bodyHtml: `
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${mechanics
          .map(
            (m) => `
              <button type="button" class="entity-card" style="text-align:left; cursor:pointer; width:100%; border-color:${wo.mechanicId === m.id ? 'var(--accent-red)' : 'var(--border-color)'};" data-assign-m="${m.id}">
                <div style="font-weight:700;">${esc(m.nama)}</div>
                <div class="meta-line">${esc(m.jabatan)} · ${esc(m.keahlian || '-')}</div>
              </button>
            `
          )
          .join('')}
      </div>
    `,
    onMount: ({ close }) => {
      document.querySelectorAll('[data-assign-m]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await api.updateWorkOrder(wo.id, { mechanicId: btn.dataset.assignM });
            await refreshAllData();
            close();
            showToast('Mekanik berhasil ditugaskan ke Work Order.', 'success');
            onDone();
          } catch (err) {
            showToast(err.message, 'error');
          }
        })
      );
    },
  });
}

export function openWorkOrderDetailModal(woId, onRefresh, activeTab = 'info') {
  const wo = store.data.Work_Orders.find((w) => w.id === woId);
  if (!wo) return;
  const c = getCustomer(wo.customerId);
  const v = getVehicle(wo.vehicleId);
  const m = getEmployee(wo.mechanicId);
  const details = store.data.Work_Order_Details.filter((d) => d.workOrderId === wo.id);
  const parts = store.data.Work_Order_Parts.filter((p) => p.workOrderId === wo.id);
  const materials = store.data.Work_Order_Materials.filter((mt) => mt.workOrderId === wo.id);
  const servicesList = (store.data.Services || []).filter((s) => s.statusAktif);
  const sparepartsList = (store.data.Spareparts || []).filter((p) => p.statusAktif);
  const materialsList = (store.data.Materials || []).filter((mt) => mt.statusAktif);
  const mechanics = (store.data.Employees || []).filter((e) => e.statusAktif);

  const isCustomer = store.roleCode === 'PELANGGAN';
  const canEditTech = hasRole('ADMIN', 'KASIR', 'MEKANIK');

  const totalJasa = details.reduce((s, d) => s + Number(d.subtotal || 0), 0);
  const totalParts = parts.reduce((s, p) => s + Number(p.subtotal || 0), 0);

  let currentTab = activeTab;

  const renderTabBody = () => {
    if (currentTab === 'info') {
      return `
        <div class="entity-card" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div class="mono" style="font-weight:800; font-size:15px;">${esc(wo.noWo)} · ${esc(v?.noPolisi || '')}</div>
              <div class="meta-line">${esc(v?.merek || '')} ${esc(v?.model || '')} · Pelanggan: ${esc(c?.nama || '-')}</div>
            </div>
            <span class="status-tag ${statusClass(wo.status)}">${esc(wo.status)}</span>
          </div>
          <div style="font-size:13px; margin-top:6px;">
            <div><strong>Keluhan:</strong> ${esc(wo.keluhan)}</div>
            <div><strong>Mekanik:</strong> ${esc(m?.nama || 'Belum ditugaskan')}</div>
            <div><strong>Total Estimasi:</strong> <span class="mono" style="color:var(--accent-red); font-weight:800;">${formatRupiah(totalJasa + totalParts || wo.estimasiBiaya)}</span></div>
          </div>
        </div>
        ${
          isCustomer
            ? `
              <div class="m3-card">
                <div><strong>Persetujuan Estimasi Biaya:</strong> <span class="mono">${formatRupiah(wo.estimasiBiaya)}</span></div>
                <div class="meta-line" style="margin:4px 0 12px;">Status: ${wo.estimasiDisetujui ? 'Sudah disetujui' : 'Menunggu persetujuan Anda'}</div>
                ${!wo.estimasiDisetujui ? `<button type="button" class="btn btn-primary" id="wo-cust-approve-btn" style="width:100%;">Setujui Estimasi Biaya Ini</button>` : ''}
              </div>
            `
            : `
              <button type="button" class="btn btn-outlined" id="wo-print-btn" style="width:100%;">${msIcon('print', 'ms-sm')}<span>Cetak Dokumen Work Order</span></button>
            `
        }
      `;
    }

    if (currentTab === 'check') {
      if (isCustomer) {
        return `<div class="m3-card"><div class="form-label">Hasil Pemeriksaan &amp; Diagnosis</div><p>${esc(wo.hasilPemeriksaan || 'Sedang dalam pemeriksaan mekanik.')}</p><p class="meta-line">${esc(wo.diagnosis || '')}</p></div>`;
      }
      return `
        <form id="wo-main-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Status Pengerjaan</label>
              <select class="form-control" id="wo-status-sel">
                ${WO_STATUSES.map((st) => `<option value="${esc(st)}" ${wo.status === st ? 'selected' : ''}>${esc(st)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Mekanik Penanggung Jawab</label>
              <select class="form-control" id="wo-mech-sel" ${store.roleCode === 'MEKANIK' ? 'disabled' : ''}>
                <option value="">-- Pilih Mekanik --</option>
                ${mechanics.map((mc) => `<option value="${mc.id}" ${wo.mechanicId === mc.id ? 'selected' : ''}>${esc(mc.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Hasil Pemeriksaan Mekanik</label>
              <textarea class="form-control" id="wo-hasil">${esc(wo.hasilPemeriksaan)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Diagnosis Kerusakan</label>
              <textarea class="form-control" id="wo-diag">${esc(wo.diagnosis)}</textarea>
            </div>
            <div class="form-group full">
              <label class="form-label">Catatan Pengerjaan Teknis</label>
              <input class="form-control" id="wo-notes" value="${esc(wo.catatanMekanik)}" />
            </div>
          </div>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:12px; cursor:pointer;">
            <input type="checkbox" id="wo-approved-chk" ${wo.estimasiDisetujui ? 'checked' : ''} />
            <span>Pelanggan menyetujui estimasi biaya</span>
          </label>
          <button type="submit" class="btn btn-primary" style="width:100%;">Simpan Perubahan WO</button>
        </form>
      `;
    }

    if (currentTab === 'jobs') {
      return `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <strong>Daftar Pekerjaan / Jasa</strong>
          <span class="mono" style="font-weight:800;">${formatRupiah(totalJasa)}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
          ${
            details.length === 0
              ? `<div class="meta-line">Belum ada layanan ditambahkan.</div>`
              : details
                  .map(
                    (d) => `
                      <div class="entity-card" style="padding:10px 12px;">
                        <div style="display:flex; justify-content:space-between;">
                          <span style="font-weight:600;">${esc(d.namaLayanan)} x${d.qty}</span>
                          <span class="mono" style="font-weight:700;">${formatRupiah(d.subtotal)}</span>
                        </div>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>
        ${
          canEditTech
            ? `
              <div style="display:flex; gap:8px;">
                <select class="form-control" id="wo-add-srv-sel">
                  ${servicesList.map((s) => `<option value="${s.id}">${esc(s.nama)} (${formatRupiah(s.hargaJasa)})</option>`).join('')}
                </select>
                <button type="button" class="btn btn-dark" id="wo-add-srv-btn">+ Jasa</button>
              </div>
            `
            : ''
        }
      `;
    }

    if (currentTab === 'parts') {
      return `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <strong>Sparepart Dibutuhkan</strong>
          <span class="mono" style="font-weight:800;">${formatRupiah(totalParts)}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
          ${
            parts.length === 0
              ? `<div class="meta-line">Belum ada sparepart ditambahkan.</div>`
              : parts
                  .map(
                    (p) => `
                      <div class="entity-card" style="padding:10px 12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                          <div>
                            <div style="font-weight:600;">${esc(p.namaSparepart)} x${p.qty}</div>
                            <div class="mono meta-line">${formatRupiah(p.subtotal)}</div>
                          </div>
                          ${
                            p.stockDeducted
                              ? `<span class="status-tag status-green">Terpotong</span>`
                              : canEditTech
                              ? `<button type="button" class="btn btn-primary btn-sm" data-confirm-part="${p.id}">Konfirmasi Pakai</button>`
                              : `<span class="status-tag status-amber">Menunggu</span>`
                          }
                        </div>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>
        ${
          canEditTech
            ? `
              <div style="display:flex; gap:8px; margin-bottom:16px;">
                <select class="form-control" id="wo-add-part-sel" style="flex:1;">
                  ${sparepartsList.map((p) => `<option value="${p.id}">${esc(p.nama)} (Stok: ${p.stok})</option>`).join('')}
                </select>
                <input class="form-control mono" id="wo-add-part-qty" type="number" min="1" value="1" style="width:72px;" />
                <button type="button" class="btn btn-dark" id="wo-add-part-btn">+ Part</button>
              </div>

              <div style="padding-top:12px; border-top:1px solid var(--border-color);">
                <div style="font-weight:700; margin-bottom:8px;">Bahan Operasional</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
                  ${materials.map((mt) => `<span class="status-tag status-gray">${esc(mt.namaBahan)} (${mt.qty} ${esc(mt.satuan)})</span>`).join('') || '<span class="meta-line">Belum ada bahan dicatat.</span>'}
                </div>
                <div style="display:flex; gap:8px;">
                  <select class="form-control" id="wo-add-mat-sel" style="flex:1;">
                    ${materialsList.map((mt) => `<option value="${mt.id}">${esc(mt.nama)} (Stok: ${mt.stok} ${esc(mt.satuan)})</option>`).join('')}
                  </select>
                  <input class="form-control mono" id="wo-add-mat-qty" type="number" min="1" value="1" style="width:72px;" />
                  <button type="button" class="btn btn-outlined" id="wo-add-mat-btn">Catat</button>
                </div>
              </div>
            `
            : ''
        }
      `;
    }

    return `
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${(wo.riwayatStatus || [])
          .map(
            (r) => `
              <div class="entity-card" style="padding:10px 12px;">
                <div style="font-weight:700;">${esc(r.status)}</div>
                <div class="meta-line mono">${formatDateTime(r.waktu)} · ${esc(r.oleh)}</div>
              </div>
            `
          )
          .join('')}
      </div>
    `;
  };

  openModal({
    title: `Work Order ${wo.noWo}`,
    wide: true,
    bodyHtml: `
      <div class="m3-tabs" id="wo-detail-tabs">
        <button type="button" class="m3-tab-btn ${currentTab === 'info' ? 'active' : ''}" data-wt="info">Informasi</button>
        <button type="button" class="m3-tab-btn ${currentTab === 'check' ? 'active' : ''}" data-wt="check">Pemeriksaan</button>
        <button type="button" class="m3-tab-btn ${currentTab === 'jobs' ? 'active' : ''}" data-wt="jobs">Pekerjaan</button>
        <button type="button" class="m3-tab-btn ${currentTab === 'parts' ? 'active' : ''}" data-wt="parts">Sparepart</button>
        <button type="button" class="m3-tab-btn ${currentTab === 'history' ? 'active' : ''}" data-wt="history">Riwayat</button>
      </div>
      <div id="wo-detail-body">${renderTabBody()}</div>
    `,
    onMount: ({ close }) => {
      const reopen = async (tabToKeep) => {
        await refreshAllData();
        close();
        if (onRefresh) onRefresh();
        openWorkOrderDetailModal(woId, onRefresh, tabToKeep);
      };

      const bindTabActions = () => {
        const holder = document.getElementById('wo-detail-body');
        if (!holder) return;
        holder.innerHTML = renderTabBody();

        document.getElementById('wo-print-btn')?.addEventListener('click', () => {
          printDocumentHtml(`
            <div style="font-family:sans-serif; max-width:740px; margin:0 auto; padding:20px; border:1px solid #cbd5e1;">
              <h2>WORK ORDER — ${esc(wo.noWo)}</h2>
              <p>Pelanggan: ${esc(c?.nama || '-')} · Kendaraan: ${esc(v?.noPolisi || '-')} (${esc(v?.model || '')})</p>
              <p>Keluhan: ${esc(wo.keluhan)}<br/>Diagnosis: ${esc(wo.diagnosis || '-')}</p>
              <h4>Pekerjaan</h4>
              <ul>${details.map((d) => `<li>${esc(d.namaLayanan)} — ${formatRupiah(d.subtotal)}</li>`).join('')}</ul>
              <h4>Sparepart</h4>
              <ul>${parts.map((p) => `<li>${esc(p.namaSparepart)} x${p.qty} — ${formatRupiah(p.subtotal)}</li>`).join('')}</ul>
              <h3>Total Estimasi: ${formatRupiah(totalJasa + totalParts)}</h3>
            </div>
          `);
        });

        document.getElementById('wo-cust-approve-btn')?.addEventListener('click', async () => {
          try {
            await api.updateWorkOrder(wo.id, { estimasiDisetujui: true });
            showToast('Estimasi biaya disetujui!', 'success');
            await reopen('info');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        document.getElementById('wo-main-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await api.updateWorkOrder(wo.id, {
              status: document.getElementById('wo-status-sel').value,
              mechanicId: document.getElementById('wo-mech-sel').value || null,
              hasilPemeriksaan: document.getElementById('wo-hasil').value.trim(),
              diagnosis: document.getElementById('wo-diag').value.trim(),
              catatanMekanik: document.getElementById('wo-notes').value.trim(),
              estimasiDisetujui: document.getElementById('wo-approved-chk').checked,
            });
            showToast(`Work Order ${wo.noWo} diperbarui.`, 'success');
            await reopen('check');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        document.getElementById('wo-add-srv-btn')?.addEventListener('click', async () => {
          try {
            await api.addWoDetail(wo.id, { serviceId: document.getElementById('wo-add-srv-sel').value, qty: 1 });
            showToast('Layanan ditambahkan ke Work Order.', 'success');
            await reopen('jobs');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        document.getElementById('wo-add-part-btn')?.addEventListener('click', async () => {
          try {
            await api.addWoPart(wo.id, {
              sparepartId: document.getElementById('wo-add-part-sel').value,
              qty: Number(document.getElementById('wo-add-part-qty').value || 1),
              confirmImmediately: false,
            });
            showToast('Sparepart ditambahkan ke Work Order.', 'success');
            await reopen('parts');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        holder.querySelectorAll('[data-confirm-part]').forEach((b) =>
          b.addEventListener('click', async () => {
            try {
              await api.confirmWoPart(wo.id, b.dataset.confirmPart);
              showToast('Pemakaian sparepart dikonfirmasi & stok berkurang.', 'success');
              await reopen('parts');
            } catch (err) {
              showToast(err.message, 'error');
            }
          })
        );

        document.getElementById('wo-add-mat-btn')?.addEventListener('click', async () => {
          try {
            await api.addWoMaterial(wo.id, {
              materialId: document.getElementById('wo-add-mat-sel').value,
              qty: Number(document.getElementById('wo-add-mat-qty').value || 1),
            });
            showToast('Pemakaian bahan operasional dicatat & stok berkurang.', 'success');
            await reopen('parts');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      };

      document.querySelectorAll('#wo-detail-tabs [data-wt]').forEach((btn) =>
        btn.addEventListener('click', () => {
          currentTab = btn.dataset.wt;
          document.querySelectorAll('#wo-detail-tabs .m3-tab-btn').forEach((t) => t.classList.remove('active'));
          btn.classList.add('active');
          bindTabActions();
        })
      );

      bindTabActions();
    },
  });
}

let histSearch = '';
export function renderServiceHistory(container) {
  const rows = (store.data.Service_History || []).filter((h) => {
    const c = getCustomer(h.customerId);
    const v = getVehicle(h.vehicleId);
    const q = histSearch.toLowerCase();
    return (
      h.noWo.toLowerCase().includes(q) ||
      (c?.nama || '').toLowerCase().includes(q) ||
      (v?.noPolisi || '').toLowerCase().includes(q) ||
      (h.tindakan || '').toLowerCase().includes(q)
    );
  });

  container.innerHTML = `
    <div class="search-box" style="margin-bottom:12px;">
      ${msIcon('search')}
      <input class="form-control" id="hist-search" type="search" placeholder="Cari No. Polisi, WO, Pelanggan, Tindakan..." value="${esc(histSearch)}" />
    </div>

    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada riwayat servis.</div>`
        : `<div class="card-list">
            ${rows
              .map((h) => {
                const c = getCustomer(h.customerId);
                const v = getVehicle(h.vehicleId);
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800;">${esc(h.noWo)} · ${esc(v?.noPolisi || '-')}</div>
                        <div class="meta-line">${formatDateTime(h.tanggal)} · ${Number(h.kmSaatServis || 0).toLocaleString('id-ID')} km</div>
                      </div>
                      <span class="mono" style="font-weight:800; color:var(--accent-red);">${formatRupiah(h.totalBiaya)}</span>
                    </div>
                    <div style="font-size:13px;">
                      <div style="font-weight:600;">${esc(c?.nama || '-')} · ${esc(v?.model || '')}</div>
                      <div class="meta-line">Tindakan: ${esc(h.tindakan)}</div>
                      <div class="meta-line">Sparepart: ${esc(h.sparepartDiganti || '-')} · Mekanik: ${esc(h.mechanicName)}</div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>`
    }
  `;

  document.getElementById('hist-search').oninput = (e) => {
    histSearch = e.target.value;
    renderServiceHistory(container);
  };
}

export function renderWarranties(container) {
  const rows = store.data.Warranties || [];
  container.innerHTML = `
    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada data garansi servis atau sparepart.</div>`
        : `<div class="card-list">
            ${rows
              .map((g) => {
                const c = getCustomer(g.customerId);
                const v = getVehicle(g.vehicleId);
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800;">${esc(g.noGaransi)}</div>
                        <div class="meta-line">${esc(c?.nama || '-')} · ${esc(v?.noPolisi || '-')}</div>
                      </div>
                      <span class="status-tag ${statusClass(g.status)}">${esc(g.status)}</span>
                    </div>
                    <div style="font-size:13px;">
                      <div style="font-weight:600;">${esc(g.jenisGaransi)} — ${esc(g.itemDijamin)}</div>
                      <div class="meta-line mono">${formatDate(g.tanggalMulai)} s/d ${formatDate(g.tanggalBerakhir)}</div>
                    </div>
                    ${
                      g.status === 'AKTIF' && hasRole('ADMIN', 'KASIR')
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-outlined btn-sm" data-claim-garansi="${g.id}">Proses Klaim Garansi</button></div>`
                        : ''
                    }
                  </div>
                `;
              })
              .join('')}
          </div>`
    }
  `;

  container.querySelectorAll('[data-claim-garansi]').forEach((b) =>
    b.addEventListener('click', () => {
      confirmDialog({
        title: 'Proses Klaim Garansi?',
        message: 'Status garansi akan diubah menjadi KLAIM. Pastikan pengecekan fisik motor sudah dilakukan.',
        confirmText: 'Ya, Proses Klaim',
        onConfirm: async () => {
          await api.updateRow('Warranties', b.dataset.claimGaransi, { status: 'KLAIM' });
          await refreshAllData();
          showToast('Status garansi diperbarui menjadi KLAIM.', 'success');
          renderWarranties(container);
        },
      });
    })
  );
}
