import { store, refreshAllData, getCustomer, getVehicle, hasRole } from '../state.js';
import { api } from '../api.js';
import {
  esc,
  msIcon,
  formatRupiah,
  formatDateTime,
  statusClass,
  showToast,
  openModal,
  printDocumentHtml,
  generateQrisSvg,
  paginate,
  renderPaginationHtml,
} from '../utils.js';

let trxFilterState = { search: '', status: 'ALL', page: 1 };

function buildTransactionCardsHtml(rows) {
  const detailsAll = store.data.Transaction_Details || [];
  return rows
    .map((t) => {
      const c = getCustomer(t.customerId);
      const v = getVehicle(t.vehicleId);
      const buyerLabel = c?.nama || (t.pembeliNama ? `Umum · ${t.pembeliNama}` : 'Pelanggan Umum');
      const items = detailsAll.filter((d) => d.transactionId === t.id);
      const itemsSummary = items.map((d) => `${d.namaItem} x${d.qty}`).join(', ');
      return `
        <div class="entity-card">
          <div class="entity-card-top">
            <div>
              <div class="mono" style="font-weight:800; font-size:14px;">${esc(t.noTransaksi)}</div>
              <div class="meta-line">${formatDateTime(t.tanggal)} · Kasir: ${esc(t.kasirName)}</div>
            </div>
            <span class="status-tag ${statusClass(t.statusPembayaran)}">${esc(t.statusPembayaran)}</span>
          </div>
          <div>
            <div style="font-weight:700;">${esc(buyerLabel)}</div>
            <div class="meta-line">${v ? `${esc(v.noPolisi)} · ${esc(v.model)}` : 'Transaksi Langsung'} · ${esc(t.metodePembayaran)} ${t.qrisMode || ''}</div>
            ${itemsSummary ? `<div class="meta-line" style="margin-top:4px; color:var(--text-primary);">${esc(itemsSummary)}</div>` : ''}
            ${t.biayaPasang > 0 ? `<div class="meta-line">Biaya Pasang: <span class="mono">${formatRupiah(t.biayaPasang)}</span></div>` : ''}
            ${t.catatan ? `<div class="meta-line">Ket: ${esc(t.catatan)}</div>` : ''}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="meta-line">Dibayar: <span class="mono">${formatRupiah(t.jumlahDibayar)}</span></span>
            <span class="mono" style="font-weight:800; font-size:15px; color:var(--accent-red);">${formatRupiah(t.total)}</span>
          </div>
          <div class="entity-card-actions">
            <button type="button" class="btn btn-outlined btn-sm" data-trx-receipt="${t.id}">${msIcon('receipt', 'ms-sm')}<span>Struk</span></button>
            ${
              t.statusPembayaran === 'MENUNGGU_PEMBAYARAN' && hasRole('KASIR', 'ADMIN')
                ? `<button type="button" class="btn btn-primary btn-sm" data-trx-confirm-qris="${t.id}">Konfirmasi QRIS</button>`
                : ''
            }
            ${
              t.statusPembayaran !== 'DIBATALKAN' && hasRole('KASIR', 'ADMIN', 'OWNER')
                ? `<button type="button" class="btn btn-destructive btn-sm" data-trx-cancel="${t.id}">Batalkan</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

function bindTransactionListEvents(container, rerenderFn) {
  const all = store.data.Transactions || [];

  container.querySelector('#trx-search')?.addEventListener('input', (e) => {
    trxFilterState.search = e.target.value;
    trxFilterState.page = 1;
    rerenderFn();
    const inp = document.getElementById('trx-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  });

  container.querySelectorAll('[data-trx-st]').forEach((b) =>
    b.addEventListener('click', () => {
      trxFilterState.status = b.dataset.trxSt;
      trxFilterState.page = 1;
      rerenderFn();
    })
  );

  container.querySelector('[data-pg-prev]')?.addEventListener('click', () => {
    trxFilterState.page -= 1;
    rerenderFn();
  });
  container.querySelector('[data-pg-next]')?.addEventListener('click', () => {
    trxFilterState.page += 1;
    rerenderFn();
  });

  container.querySelectorAll('[data-trx-receipt]').forEach((b) =>
    b.addEventListener('click', () => {
      const trx = all.find((x) => x.id === b.dataset.trxReceipt);
      if (trx) openReceiptModal(trx);
    })
  );

  container.querySelectorAll('[data-trx-confirm-qris]').forEach((b) =>
    b.addEventListener('click', () => {
      const trx = all.find((x) => x.id === b.dataset.trxConfirmQris);
      const pay = store.data.Payments.find((p) => p.transactionId === trx?.id);
      if (trx) openQrisVerificationModal(trx, pay, rerenderFn);
    })
  );

  container.querySelectorAll('[data-trx-cancel]').forEach((b) =>
    b.addEventListener('click', () => {
      const trx = all.find((x) => x.id === b.dataset.trxCancel);
      if (!trx) return;
      openModal({
        title: `Batalkan Transaksi ${trx.noTransaksi}`,
        bodyHtml: `
          <p class="meta-line" style="margin-bottom:12px;">Pembatalan transaksi akan membuat catatan pembalik (reversal) dan mengembalikan stok sparepart non-WO.</p>
          <div class="form-group">
            <label class="form-label">Alasan Pembatalan *</label>
            <textarea class="form-control" id="cancel-reason" placeholder="Contoh: Salah input item oleh kasir" required></textarea>
          </div>
        `,
        footerHtml: `
          <button type="button" class="btn btn-secondary" id="cancel-trx-back">Kembali</button>
          <button type="button" class="btn btn-destructive" id="confirm-cancel-trx">Ya, Batalkan Transaksi</button>
        `,
        onMount: ({ close }) => {
          document.getElementById('cancel-trx-back').onclick = close;
          document.getElementById('confirm-cancel-trx').onclick = async () => {
            const reason = document.getElementById('cancel-reason').value.trim();
            if (!reason) {
              showToast('Alasan pembatalan wajib diisi.', 'warning');
              return;
            }
            try {
              await api.cancelTransaction(trx.id, reason);
              await refreshAllData();
              close();
              showToast(`Transaksi ${trx.noTransaksi} dibatalkan dengan pencatatan pembalik.`, 'success');
              rerenderFn();
            } catch (err) {
              showToast(err.message, 'error');
            }
          };
        },
      });
    })
  );
}

function getFilteredTransactions() {
  const all = store.data.Transactions || [];
  const q = trxFilterState.search.toLowerCase();
  const filtered = all.filter((t) => {
    const cust = getCustomer(t.customerId);
    const matchText =
      t.noTransaksi.toLowerCase().includes(q) ||
      (cust?.nama || '').toLowerCase().includes(q) ||
      (t.pembeliNama || '').toLowerCase().includes(q) ||
      t.kasirName.toLowerCase().includes(q);
    const matchStatus = trxFilterState.status === 'ALL' || t.statusPembayaran === trxFilterState.status;
    return matchText && matchStatus;
  });
  return paginate(filtered, trxFilterState.page, 10);
}

function renderFilterToolbarHtml() {
  return `
    <div style="margin-bottom:12px;">
      <div class="search-box" style="margin-bottom:10px;">
        ${msIcon('search')}
        <input class="form-control" id="trx-search" type="search" placeholder="Cari No. Transaksi, Pembeli, Pelanggan, Kasir..." value="${esc(trxFilterState.search)}" />
      </div>
      <div class="chip-scroller">
        ${[
          { id: 'ALL', label: 'Semua' },
          { id: 'LUNAS', label: 'Lunas' },
          { id: 'MENUNGGU_PEMBAYARAN', label: 'Menunggu QRIS' },
          { id: 'SEBAGIAN', label: 'Sebagian' },
          { id: 'DIBATALKAN', label: 'Dibatalkan' },
        ]
          .map(
            (st) =>
              `<button type="button" class="m3-chip ${trxFilterState.status === st.id ? 'active' : ''}" data-trx-st="${st.id}">${st.label}</button>`
          )
          .join('')}
      </div>
    </div>
  `;
}

export function renderPos(container, onNavigate) {
  const today = new Date().toISOString().slice(0, 10);
  const allTrx = store.data.Transactions || [];
  const todayValid = allTrx.filter((t) => t.tanggal.slice(0, 10) === today && t.statusPembayaran !== 'DIBATALKAN');
  const todayTunai = todayValid
    .filter((t) => t.metodePembayaran === 'TUNAI')
    .reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
  const todayQris = todayValid
    .filter((t) => t.metodePembayaran === 'QRIS' && t.statusPembayaran !== 'MENUNGGU_PEMBAYARAN')
    .reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
  const canCashClose = hasRole('ADMIN', 'OWNER', 'KASIR');
  const paged = getFilteredTransactions();

  container.innerHTML = `
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-size:12px; color:#94A3B8; font-weight:600;">Kasir &amp; Riwayat Transaksi (${today})</div>
          <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(todayTunai + todayQris)}</div>
          <div style="font-size:12px; color:#CBD5E1; margin-top:4px;">
            ${todayValid.length} transaksi hari ini · Tunai ${formatRupiah(todayTunai)} · QRIS ${formatRupiah(todayQris)}
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="pos-add-trx-btn">
            ${msIcon('add', 'ms-sm')}
            <span>Tambah Transaksi</span>
          </button>
          ${
            canCashClose
              ? `<button type="button" class="btn btn-secondary btn-sm" id="pos-tutup-kas-btn">${msIcon('lock_clock', 'ms-sm')}<span>Tutup Kas</span></button>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="m3-card-header" style="margin-bottom:8px;">
      <h3 class="m3-card-title">Riwayat Transaksi Kasir</h3>
      <span class="meta-line mono">${paged.total} transaksi</span>
    </div>

    ${renderFilterToolbarHtml()}

    ${
      paged.rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada transaksi sesuai filter. Tekan <strong>Tambah Transaksi</strong> di atas untuk membuat transaksi baru.</div>`
        : `<div class="card-list">${buildTransactionCardsHtml(paged.rows)}</div>`
    }

    ${renderPaginationHtml(paged, 'trx')}
  `;

  const reopenPos = () => renderPos(container, onNavigate);
  document.getElementById('pos-add-trx-btn')?.addEventListener('click', () => openKasirTransactionModal(reopenPos));
  document.getElementById('pos-tutup-kas-btn')?.addEventListener('click', () => onNavigate('tutup-kas'));

  bindTransactionListEvents(container, reopenPos);
}

function openKasirTransactionModal(onDone) {
  const services = (store.data.Services || []).filter((s) => s.statusAktif);
  const parts = (store.data.Spareparts || []).filter((p) => p.statusAktif);
  const customers = store.data.Customers || [];
  const mechanics = (store.data.Employees || []).filter((e) => e.statusAktif);
  const unbilledWOs = (store.data.Work_Orders || []).filter(
    (w) => !w.billedTransactionId && w.status !== 'Dibatalkan'
  );

  const state = {
    step: 'FORM', // 'FORM' | 'PAYMENT'
    workOrderId: '',
    customerId: '',
    pembeliNama: '',
    vehicleId: '',
    mechanicId: '',
    pendingServiceId: '',
    pendingPartId: '',
    pendingPartQty: 1,
    items: [], // { itemType, itemId, namaItem, keterangan, qty, hargaSatuan, mechanicId, workOrderPartId, fromWorkOrder }
    biayaPasang: 0,
    biayaPasangKeterangan: 'Biaya Pasang',
    diskon: 0,
    catatan: '',
    metodePembayaran: 'TUNAI',
    qrisMode: 'STATIS',
    uangDiterima: 0,
    pembayaranSebagian: false,
    nominalBayarQris: 0,
    idempotencyKey: crypto.randomUUID(),
  };

  const computeTotals = () => {
    const settings = store.data.Settings || {};
    const subtotalService = state.items
      .filter((i) => i.itemType === 'service')
      .reduce((s, i) => s + Number(i.hargaSatuan || 0) * Number(i.qty || 1), 0);
    const subtotalPart = state.items
      .filter((i) => i.itemType === 'sparepart')
      .reduce((s, i) => s + Number(i.hargaSatuan || 0) * Number(i.qty || 1), 0);
    const biayaPasang = Math.max(0, Number(state.biayaPasang || 0));
    const diskon = Math.max(0, Number(state.diskon || 0));
    const afterDiskon = Math.max(0, subtotalService + subtotalPart + biayaPasang - diskon);
    const pajakPersen = settings.pajakAktif ? Number(settings.pajakPersen || 0) : 0;
    const pajakNominal = Math.round((afterDiskon * pajakPersen) / 100);
    const grandTotal = afterDiskon + pajakNominal;
    return { settings, subtotalService, subtotalPart, biayaPasang, diskon, pajakPersen, pajakNominal, grandTotal };
  };

  const renderBody = () => {
    const totals = computeTotals();
    const cust = getCustomer(state.customerId);
    const veh = getVehicle(state.vehicleId);
    const mech = (store.data.Employees || []).find((e) => e.id === state.mechanicId);
    const vehicles = state.customerId
      ? (store.data.Vehicles || []).filter((v) => v.customerId === state.customerId)
      : store.data.Vehicles || [];

    const selectedSrvPreview = services.find((s) => s.id === state.pendingServiceId);
    const selectedPartPreview = parts.find((p) => p.id === state.pendingPartId);
    const serviceItems = state.items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.itemType === 'service');
    const partItems = state.items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.itemType === 'sparepart');

    if (state.step === 'FORM') {
      return `
        <div class="form-grid" style="margin-bottom:10px;">
          ${
            unbilledWOs.length > 0
              ? `
                <div class="form-group full">
                  <label class="form-label">Tarik dari Work Order (Opsional)</label>
                  <select class="form-control" id="kt-wo">
                    <option value="">-- Transaksi Langsung (Non-WO) --</option>
                    ${unbilledWOs
                      .map((w) => {
                        const v = getVehicle(w.vehicleId);
                        const c = getCustomer(w.customerId);
                        return `<option value="${w.id}" ${state.workOrderId === w.id ? 'selected' : ''}>${esc(w.noWo)} · ${esc(v?.noPolisi || '-')} (${esc(c?.nama || '-')})</option>`;
                      })
                      .join('')}
                  </select>
                </div>
              `
              : ''
          }
          <div class="form-group">
            <label class="form-label">Siapa Pembelinya / Pelanggan *</label>
            <select class="form-control" id="kt-cust">
              <option value="">Pembeli Umum (Walk-in)</option>
              ${customers.map((c) => `<option value="${c.id}" ${state.customerId === c.id ? 'selected' : ''}>${esc(c.nama)} (${esc(c.noWa)})</option>`).join('')}
            </select>
          </div>
          ${
            !state.customerId
              ? `
                <div class="form-group">
                  <label class="form-label">Nama Pembeli Umum (Opsional)</label>
                  <input class="form-control" id="kt-pembeli-nama" value="${esc(state.pembeliNama)}" placeholder="Contoh: Bapak Hendra" />
                </div>
              `
              : `
                <div class="form-group">
                  <label class="form-label">Kendaraan Pelanggan</label>
                  <select class="form-control" id="kt-veh">
                    <option value="">-- Tanpa Kendaraan --</option>
                    ${vehicles.map((v) => `<option value="${v.id}" ${state.vehicleId === v.id ? 'selected' : ''}>${esc(v.noPolisi)} · ${esc(v.merek)} ${esc(v.model)}</option>`).join('')}
                  </select>
                </div>
              `
          }
          <div class="form-group ${!state.customerId ? 'full' : 'full'}">
            <label class="form-label">Mekanik (Opsional)</label>
            <select class="form-control" id="kt-mech">
              <option value="">-- Tanpa Mekanik --</option>
              ${mechanics.map((m) => `<option value="${m.id}" ${state.mechanicId === m.id ? 'selected' : ''}>${esc(m.nama)} · ${esc(m.jabatan)}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- SERVICE PICKER (HARGA BARU MUNCUL SETELAH SERVICE DIPILIH) -->
        <div class="m3-card" style="padding:12px; margin-bottom:10px; background:#F8FAFC;">
          <div class="form-label" style="margin-bottom:6px;">1. Layanan Service (Pilih service untuk melihat harga)</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <select class="form-control" id="kt-srv-select" style="flex:1; min-width:180px;">
              <option value="">-- Pilih Service --</option>
              ${services.map((s) => `<option value="${s.id}" ${state.pendingServiceId === s.id ? 'selected' : ''}>${esc(s.nama)} · Est. ${s.estimasiMenit} mnt</option>`).join('')}
            </select>
            <button type="button" class="btn btn-dark btn-sm" id="kt-add-srv-btn" ${!selectedSrvPreview ? 'disabled' : ''}>+ Tambah Service</button>
          </div>
          ${
            selectedSrvPreview
              ? `
                <div style="padding:8px 10px; background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div>
                    <div style="font-weight:700; font-size:12px;">${esc(selectedSrvPreview.nama)}</div>
                    <div class="meta-line" style="font-size:11px;">${esc(selectedSrvPreview.deskripsi || selectedSrvPreview.categoryName || 'Layanan servis')}</div>
                  </div>
                  <div class="mono" style="font-weight:800; color:var(--accent-red);">${formatRupiah(selectedSrvPreview.hargaJasa)}</div>
                </div>
              `
              : ''
          }
          ${
            serviceItems.length === 0
              ? `<div class="meta-line">Belum ada service ditambahkan.</div>`
              : serviceItems
                  .map(
                    ({ it, idx }) => `
                      <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid #E2E8F0;">
                        <div style="flex:1; min-width:0;">
                          <div style="font-weight:600; font-size:12px;">${esc(it.namaItem)}</div>
                          <div class="meta-line mono">${formatRupiah(it.hargaSatuan)} × ${it.qty} = <strong>${formatRupiah(it.hargaSatuan * it.qty)}</strong></div>
                        </div>
                        <button type="button" class="btn-icon" style="width:28px; height:28px;" data-kt-dec="${idx}">-</button>
                        <span class="mono" style="font-size:12px;">${it.qty}</span>
                        <button type="button" class="btn-icon" style="width:28px; height:28px;" data-kt-inc="${idx}">+</button>
                        <button type="button" class="btn-icon" style="width:28px; height:28px; color:var(--state-red);" data-kt-del="${idx}">${msIcon('delete_outline', 'ms-sm')}</button>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>

        <!-- SPAREPART PICKER -->
        <div class="m3-card" style="padding:12px; margin-bottom:10px; background:#F8FAFC;">
          <div class="form-label" style="margin-bottom:6px;">2. Sparepart / Barang</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <select class="form-control" id="kt-part-select" style="flex:1; min-width:170px;">
              <option value="">-- Pilih Sparepart --</option>
              ${parts.map((p) => `<option value="${p.id}" ${state.pendingPartId === p.id ? 'selected' : ''} ${p.stok <= 0 ? 'disabled' : ''}>${esc(p.nama)} (Stok: ${p.stok} ${esc(p.satuan || '')})</option>`).join('')}
            </select>
            <input class="form-control mono" id="kt-part-qty" type="number" min="1" value="${state.pendingPartQty}" style="width:72px;" />
            <button type="button" class="btn btn-primary btn-sm" id="kt-add-part-btn" ${!selectedPartPreview ? 'disabled' : ''}>+ Tambah Part</button>
          </div>
          ${
            selectedPartPreview
              ? `
                <div style="padding:8px 10px; background:#FFFFFF; border:1px solid var(--border-color); border-radius:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div>
                    <div style="font-weight:700; font-size:12px;">${esc(selectedPartPreview.nama)} (Stok ${selectedPartPreview.stok})</div>
                    <div class="meta-line" style="font-size:11px;">${esc(selectedPartPreview.deskripsi || selectedPartPreview.kecocokanMotor || selectedPartPreview.merek || '-')}</div>
                  </div>
                  <div class="mono" style="font-weight:800;">${formatRupiah(selectedPartPreview.hargaJual)}</div>
                </div>
              `
              : ''
          }
          ${
            partItems.length === 0
              ? `<div class="meta-line">Belum ada sparepart ditambahkan.</div>`
              : partItems
                  .map(
                    ({ it, idx }) => `
                      <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid #E2E8F0;">
                        <div style="flex:1; min-width:0;">
                          <div style="font-weight:600; font-size:12px;">${esc(it.namaItem)}</div>
                          <div class="meta-line mono">${formatRupiah(it.hargaSatuan)} × ${it.qty} = <strong>${formatRupiah(it.hargaSatuan * it.qty)}</strong></div>
                        </div>
                        <button type="button" class="btn-icon" style="width:28px; height:28px;" data-kt-dec="${idx}">-</button>
                        <span class="mono" style="font-size:12px;">${it.qty}</span>
                        <button type="button" class="btn-icon" style="width:28px; height:28px;" data-kt-inc="${idx}">+</button>
                        <button type="button" class="btn-icon" style="width:28px; height:28px; color:var(--state-red);" data-kt-del="${idx}">${msIcon('delete_outline', 'ms-sm')}</button>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>

        <!-- BIAYA PASANG, DISKON & KETERANGAN -->
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-group">
            <label class="form-label" for="kt-biaya-pasang">3. Biaya Pasang (Rp)</label>
            <input class="form-control mono" id="kt-biaya-pasang" type="number" min="0" value="${state.biayaPasang || 0}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="kt-biaya-pasang-ket">Keterangan Biaya Pasang</label>
            <input class="form-control" id="kt-biaya-pasang-ket" value="${esc(state.biayaPasangKeterangan)}" placeholder="Biaya Pasang / Ongkos Kerja" />
          </div>
          <div class="form-group">
            <label class="form-label" for="kt-diskon">Diskon (Rp)</label>
            <input class="form-control mono" id="kt-diskon" type="number" min="0" value="${state.diskon || 0}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="kt-catatan">Keterangan / Catatan Lainnya</label>
            <input class="form-control" id="kt-catatan" value="${esc(state.catatan)}" placeholder="Catatan tambahan transaksi..." />
          </div>
        </div>

        <div class="summary-total" style="margin-bottom:12px; padding:10px 12px; background:#F8FAFC; border-radius:12px;">
          <span>ESTIMASI TOTAL</span>
          <span class="mono" id="kt-live-total" style="color:var(--accent-red);">${formatRupiah(totals.grandTotal)}</span>
        </div>

        <button type="button" class="btn btn-primary btn-lg" id="kt-to-payment-btn" style="width:100%;">
          ${msIcon('payments', 'ms-sm')}
          <span>Lanjut Pilih Pembayaran</span>
        </button>
      `;
    }

    // STEP 2: KETERANGAN LENGKAP + PILIH PEMBAYARAN
    const buyerDisplay = cust?.nama || (state.pembeliNama ? `Pembeli Umum · ${state.pembeliNama}` : 'Pembeli Umum (Walk-in)');
    const kembalian =
      state.metodePembayaran === 'TUNAI'
        ? Math.max(0, Number(state.uangDiterima || 0) - totals.grandTotal)
        : 0;

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong style="font-size:14px;">Ringkasan &amp; Keterangan Transaksi</strong>
        <button type="button" class="btn btn-outlined btn-sm" id="kt-back-form-btn">${msIcon('arrow_back', 'ms-sm')}<span>Kembali Ubah</span></button>
      </div>

      <div style="background:#F8FAFC; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px;">
        <div class="meta-line" style="margin-bottom:6px; color:var(--text-primary);">
          Pembeli: <strong>${esc(buyerDisplay)}</strong>
          ${veh ? ` · Motor: <strong class="mono">${esc(veh.noPolisi)}</strong>` : ''}
          ${mech ? ` · Mekanik: <strong>${esc(mech.nama)}</strong>` : ''}
        </div>
        <div style="max-height:150px; overflow-y:auto; border-top:1px dashed #CBD5E1; border-bottom:1px dashed #CBD5E1; padding:6px 0; margin:6px 0;">
          ${state.items
            .map(
              (it) => `
                <div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">
                  <span>${esc(it.namaItem)} (${it.itemType === 'service' ? 'Service' : 'Sparepart'}) ×${it.qty}</span>
                  <span class="mono" style="font-weight:700;">${formatRupiah(it.hargaSatuan * it.qty)}</span>
                </div>
              `
            )
            .join('')}
          ${
            totals.biayaPasang > 0
              ? `<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">
                  <span>${esc(state.biayaPasangKeterangan || 'Biaya Pasang')}</span>
                  <span class="mono" style="font-weight:700;">${formatRupiah(totals.biayaPasang)}</span>
                </div>`
              : ''
          }
        </div>
        <div class="meta-line" style="font-size:12px;">
          <strong>Keterangan:</strong> ${state.catatan ? esc(state.catatan) : '<em>Tidak ada catatan tambahan</em>'}
        </div>
        ${totals.diskon > 0 ? `<div class="summary-line" style="font-size:12px; margin-top:4px;"><span>Diskon</span><span class="mono">-${formatRupiah(totals.diskon)}</span></div>` : ''}
        ${totals.settings.pajakAktif ? `<div class="summary-line" style="font-size:12px;"><span>Pajak (${totals.pajakPersen}%)</span><span class="mono">${formatRupiah(totals.pajakNominal)}</span></div>` : ''}
        <div class="summary-total" style="margin-top:6px; padding-top:6px; border-top:1px solid #E2E8F0;">
          <span>TOTAL TAGIHAN</span>
          <span class="mono" style="color:var(--accent-red);">${formatRupiah(totals.grandTotal)}</span>
        </div>
      </div>

      <div class="form-label" style="margin-bottom:8px;">Pilih Metode Pembayaran (Cash / Tunai atau QRIS)</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
        <button type="button" class="btn ${state.metodePembayaran === 'TUNAI' ? 'btn-dark' : 'btn-outlined'} btn-sm" data-kt-pay="TUNAI">${msIcon('payments', 'ms-sm')}<span>CASH / TUNAI</span></button>
        <button type="button" class="btn ${state.metodePembayaran === 'QRIS' ? 'btn-dark' : 'btn-outlined'} btn-sm" data-kt-pay="QRIS">${msIcon('qr_code_2', 'ms-sm')}<span>QRIS</span></button>
      </div>

      ${
        totals.settings.izinkanPembayaranSebagian
          ? `
            <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px; cursor:pointer;">
              <input type="checkbox" id="kt-partial-chk" ${state.pembayaranSebagian ? 'checked' : ''} />
              <span>Catat sisa tagihan sebagai <strong>Piutang Pelanggan</strong></span>
            </label>
            ${
              state.pembayaranSebagian && !state.customerId
                ? `<div style="padding:8px 10px; background:var(--state-amber-bg); color:var(--state-amber); border-radius:10px; font-size:12px; margin-bottom:10px;">Pilih pelanggan terdaftar pada langkah sebelumnya agar piutang tercatat.</div>`
                : ''
            }
          `
          : ''
      }

      ${
        state.metodePembayaran === 'TUNAI'
          ? `
            <div class="form-group">
              <label class="form-label">Uang Tunai Diterima (Rp)</label>
              <input class="form-control mono" id="kt-cash" type="number" min="0" value="${state.uangDiterima || ''}" placeholder="${totals.grandTotal}" />
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
              <button type="button" class="btn btn-secondary btn-sm" data-kt-exact="${totals.grandTotal}">Uang Pas</button>
              <button type="button" class="btn btn-secondary btn-sm" data-kt-exact="100000">100rb</button>
              <button type="button" class="btn btn-secondary btn-sm" data-kt-exact="200000">200rb</button>
              <button type="button" class="btn btn-secondary btn-sm" data-kt-exact="500000">500rb</button>
            </div>
            <div class="summary-line" style="font-weight:700; margin-bottom:12px;">
              <span>${state.pembayaranSebagian && Number(state.uangDiterima) < totals.grandTotal ? 'Sisa Piutang' : 'Kembalian'}</span>
              <span class="mono">${
                state.pembayaranSebagian && Number(state.uangDiterima) < totals.grandTotal
                  ? formatRupiah(Math.max(0, totals.grandTotal - Number(state.uangDiterima || 0)))
                  : formatRupiah(kembalian)
              }</span>
            </div>
          `
          : `
            <div class="form-group">
              <label class="form-label">Jenis QRIS</label>
              <select class="form-control" id="kt-qris-mode">
                <option value="STATIS" ${state.qrisMode === 'STATIS' ? 'selected' : ''}>QRIS Statis (Konfirmasi Kasir)</option>
                <option value="DINAMIS" ${state.qrisMode === 'DINAMIS' ? 'selected' : ''}>QRIS Dinamis (Payment Gateway)</option>
              </select>
            </div>
            ${
              state.pembayaranSebagian
                ? `<div class="form-group"><label class="form-label">Nominal Bayar QRIS (Rp)</label><input class="form-control mono" id="kt-qris-partial" type="number" min="1000" value="${state.nominalBayarQris || totals.grandTotal}" /></div>`
                : ''
            }
          `
      }

      <button type="button" class="btn btn-primary btn-lg" id="kt-submit-btn" style="width:100%;">
        ${msIcon('check_circle', 'ms-sm')}
        <span>${state.metodePembayaran === 'TUNAI' ? 'Simpan & Bayar Tunai' : 'Buat Tagihan QRIS'}</span>
      </button>
    `;
  };

  openModal({
    title: 'Tambah Transaksi Kasir',
    wide: true,
    bodyHtml: `<div id="kt-modal-body"></div>`,
    onMount: ({ close }) => {
      const mount = () => {
        const holder = document.getElementById('kt-modal-body');
        if (!holder) return;
        holder.innerHTML = renderBody();

        holder.querySelector('#kt-wo')?.addEventListener('change', (e) => {
          const woId = e.target.value;
          state.workOrderId = woId;
          if (woId) {
            const wo = store.data.Work_Orders.find((w) => w.id === woId);
            if (wo) {
              state.customerId = wo.customerId || '';
              state.vehicleId = wo.vehicleId || '';
              state.mechanicId = wo.mechanicId || '';
              const details = store.data.Work_Order_Details.filter((d) => d.workOrderId === wo.id);
              const partsWo = store.data.Work_Order_Parts.filter((p) => p.workOrderId === wo.id);
              state.items = [
                ...details.map((d) => ({
                  itemType: 'service',
                  itemId: d.serviceId,
                  namaItem: d.namaLayanan,
                  qty: d.qty,
                  hargaSatuan: d.hargaJasa,
                  mechanicId: d.mechanicId || wo.mechanicId,
                  fromWorkOrder: true,
                })),
                ...partsWo.map((p) => ({
                  itemType: 'sparepart',
                  itemId: p.sparepartId,
                  namaItem: p.namaSparepart,
                  qty: p.qty,
                  hargaSatuan: p.hargaJual,
                  workOrderPartId: p.id,
                  fromWorkOrder: true,
                })),
              ];
            }
          }
          mount();
        });

        holder.querySelector('#kt-cust')?.addEventListener('change', (e) => {
          state.customerId = e.target.value;
          state.vehicleId = '';
          mount();
        });

        holder.querySelector('#kt-pembeli-nama')?.addEventListener('input', (e) => {
          state.pembeliNama = e.target.value;
        });
        holder.querySelector('#kt-veh')?.addEventListener('change', (e) => {
          state.vehicleId = e.target.value;
        });
        holder.querySelector('#kt-mech')?.addEventListener('change', (e) => {
          state.mechanicId = e.target.value;
        });

        holder.querySelector('#kt-srv-select')?.addEventListener('change', (e) => {
          state.pendingServiceId = e.target.value;
          mount();
        });

        holder.querySelector('#kt-add-srv-btn')?.addEventListener('click', () => {
          const srv = services.find((s) => s.id === state.pendingServiceId);
          if (!srv) return;
          const existing = state.items.find((i) => i.itemType === 'service' && i.itemId === srv.id && !i.fromWorkOrder);
          if (existing) existing.qty += 1;
          else {
            state.items.push({
              itemType: 'service',
              itemId: srv.id,
              namaItem: srv.nama,
              qty: 1,
              hargaSatuan: srv.hargaJasa,
              mechanicId: state.mechanicId || null,
              fromWorkOrder: false,
            });
          }
          state.pendingServiceId = '';
          mount();
        });

        holder.querySelector('#kt-part-select')?.addEventListener('change', (e) => {
          state.pendingPartId = e.target.value;
          mount();
        });
        holder.querySelector('#kt-part-qty')?.addEventListener('input', (e) => {
          state.pendingPartQty = Math.max(1, Number(e.target.value || 1));
        });

        holder.querySelector('#kt-add-part-btn')?.addEventListener('click', () => {
          const part = parts.find((p) => p.id === state.pendingPartId);
          if (!part) return;
          const qty = Math.max(1, Number(state.pendingPartQty || 1));
          const existing = state.items.find((i) => i.itemType === 'sparepart' && i.itemId === part.id && !i.fromWorkOrder);
          const nextQty = (existing?.qty || 0) + qty;
          if (nextQty > part.stok) {
            showToast(`Stok ${part.nama} tersisa ${part.stok}.`, 'warning');
            return;
          }
          if (existing) existing.qty = nextQty;
          else {
            state.items.push({
              itemType: 'sparepart',
              itemId: part.id,
              namaItem: part.nama,
              qty,
              hargaSatuan: part.hargaJual,
              fromWorkOrder: false,
            });
          }
          state.pendingPartId = '';
          state.pendingPartQty = 1;
          mount();
        });

        holder.querySelectorAll('[data-kt-inc]').forEach((b) =>
          b.addEventListener('click', () => {
            const it = state.items[Number(b.dataset.ktInc)];
            if (it) it.qty += 1;
            mount();
          })
        );
        holder.querySelectorAll('[data-kt-dec]').forEach((b) =>
          b.addEventListener('click', () => {
            const idx = Number(b.dataset.ktDec);
            const it = state.items[idx];
            if (!it) return;
            if (it.qty > 1) it.qty -= 1;
            else state.items.splice(idx, 1);
            mount();
          })
        );
        holder.querySelectorAll('[data-kt-del]').forEach((b) =>
          b.addEventListener('click', () => {
            state.items.splice(Number(b.dataset.ktDel), 1);
            mount();
          })
        );

        const refreshLiveTotal = () => {
          const tEl = holder.querySelector('#kt-live-total');
          if (tEl) tEl.textContent = formatRupiah(computeTotals().grandTotal);
        };
        holder.querySelector('#kt-biaya-pasang')?.addEventListener('input', (e) => {
          state.biayaPasang = Math.max(0, Number(e.target.value || 0));
          refreshLiveTotal();
        });
        holder.querySelector('#kt-biaya-pasang-ket')?.addEventListener('input', (e) => {
          state.biayaPasangKeterangan = e.target.value;
        });
        holder.querySelector('#kt-diskon')?.addEventListener('input', (e) => {
          state.diskon = Math.max(0, Number(e.target.value || 0));
          refreshLiveTotal();
        });
        holder.querySelector('#kt-catatan')?.addEventListener('input', (e) => {
          state.catatan = e.target.value;
        });

        holder.querySelector('#kt-to-payment-btn')?.addEventListener('click', () => {
          if (state.items.length === 0 && Number(state.biayaPasang || 0) <= 0) {
            showToast('Masukkan minimal satu service, sparepart, atau biaya pasang.', 'warning');
            return;
          }
          state.step = 'PAYMENT';
          mount();
        });

        holder.querySelector('#kt-back-form-btn')?.addEventListener('click', () => {
          state.step = 'FORM';
          mount();
        });

        holder.querySelectorAll('[data-kt-pay]').forEach((b) =>
          b.addEventListener('click', () => {
            state.metodePembayaran = b.dataset.ktPay;
            mount();
          })
        );

        holder.querySelector('#kt-partial-chk')?.addEventListener('change', (e) => {
          state.pembayaranSebagian = e.target.checked;
          mount();
        });
        holder.querySelector('#kt-cash')?.addEventListener('input', (e) => {
          state.uangDiterima = Number(e.target.value || 0);
        });
        holder.querySelector('#kt-cash')?.addEventListener('change', () => mount());
        holder.querySelectorAll('[data-kt-exact]').forEach((b) =>
          b.addEventListener('click', () => {
            state.uangDiterima = Number(b.dataset.ktExact);
            mount();
          })
        );
        holder.querySelector('#kt-qris-mode')?.addEventListener('change', (e) => {
          state.qrisMode = e.target.value;
          mount();
        });
        holder.querySelector('#kt-qris-partial')?.addEventListener('change', (e) => {
          state.nominalBayarQris = Number(e.target.value || 0);
        });

        holder.querySelector('#kt-submit-btn')?.addEventListener('click', async () => {
          const btn = holder.querySelector('#kt-submit-btn');
          if (btn) btn.disabled = true;
          try {
            const totals = computeTotals();
            const res = await api.posCheckout({
              customerId: state.customerId || null,
              pembeliNama: state.customerId ? '' : state.pembeliNama.trim(),
              vehicleId: state.vehicleId || null,
              workOrderId: state.workOrderId || null,
              mechanicId: state.mechanicId || null,
              items: state.items,
              biayaPasang: Number(state.biayaPasang || 0),
              biayaPasangKeterangan: state.biayaPasangKeterangan.trim() || 'Biaya Pasang',
              diskon: Number(state.diskon || 0),
              catatan: state.catatan.trim(),
              metodePembayaran: state.metodePembayaran,
              qrisMode: state.qrisMode,
              uangDiterima: Number(state.uangDiterima || 0),
              pembayaranSebagian: state.pembayaranSebagian,
              nominalBayarQris: Number(state.nominalBayarQris || totals.grandTotal),
              idempotencyKey: state.idempotencyKey,
            });
            await refreshAllData();
            close();
            if (res.transaction.metodePembayaran === 'QRIS') {
              showToast(`Tagihan QRIS ${res.transaction.noTransaksi} dibuat. Menunggu konfirmasi.`, 'warning');
              openQrisVerificationModal(res.transaction, res.payment, onDone);
            } else {
              showToast(`Transaksi ${res.transaction.noTransaksi} berhasil disimpan!`, 'success');
              openReceiptModal(res.transaction);
              if (onDone) onDone();
            }
          } catch (err) {
            showToast(err.message, 'error');
            if (btn) btn.disabled = false;
          }
        });
      };
      mount();
    },
  });
}



export function openQrisVerificationModal(trx, payment, onDone) {
  const isDynamic = trx.qrisMode === 'DINAMIS';
  const ref = payment?.qrisRef || `QR-${trx.noTransaksi}`;
  openModal({
    title: `Pembayaran QRIS ${isDynamic ? 'Dinamis' : 'Statis'} — ${trx.noTransaksi}`,
    bodyHtml: `
      <div class="qris-box">
        <div class="meta-line" style="margin-bottom:8px;">Merchant: <strong>${esc(store.data.Settings?.namaBengkel || 'BENGKEL MOTOR')}</strong> · NMID: <span class="mono">${esc(store.data.Settings?.qrisMerchantId || '')}</span></div>
        ${generateQrisSvg(ref)}
        <div style="margin-top:10px; font-weight:800; font-size:20px;" class="mono">${formatRupiah(payment?.nominal || trx.total)}</div>
        <div class="meta-line mono">Ref: ${esc(ref)}</div>
        <div style="margin-top:10px;">
          <span class="status-tag status-amber">Status: Menunggu Konfirmasi Pembayaran</span>
        </div>
      </div>
      <p class="meta-line" style="margin:10px 0;">
        ${
          isDynamic
            ? 'QRIS Dinamis akan diverifikasi ke Payment Gateway sebelum transaksi ditandai lunas.'
            : 'Untuk QRIS Statis, kasir wajib memeriksa bukti transfer / notifikasi masuk terlebih dahulu sebelum menekan tombol konfirmasi.'
        }
      </p>
      <div class="form-group">
        <label class="form-label">Nomor Referensi / Approval QRIS</label>
        <input class="form-control mono" id="qris-ref-input" value="${esc(ref)}" />
      </div>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="qris-later-btn">Biarkan Menunggu</button>
      <button type="button" class="btn btn-primary" id="qris-confirm-btn">
        ${isDynamic ? 'Verifikasi &amp; Lunaskan' : 'Konfirmasi Masuk (Kasir)'}
      </button>
    `,
    onMount: ({ close }) => {
      document.getElementById('qris-later-btn').onclick = () => {
        close();
        if (onDone) onDone();
      };
      document.getElementById('qris-confirm-btn').onclick = async () => {
        const btn = document.getElementById('qris-confirm-btn');
        btn.disabled = true;
        try {
          const updated = await api.confirmQris(trx.id, {
            qrisRef: document.getElementById('qris-ref-input').value.trim(),
          });
          await refreshAllData();
          close();
          showToast(`Pembayaran QRIS ${updated.noTransaksi} terkonfirmasi!`, 'success');
          openReceiptModal(updated);
          if (onDone) onDone();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    },
  });
}

export function openReceiptModal(trx) {
  const details = (store.data.Transaction_Details || []).filter((d) => d.transactionId === trx.id);
  const cust = getCustomer(trx.customerId);
  const veh = getVehicle(trx.vehicleId);
  const s = store.data.Settings || {};
  const buyerLabel = cust?.nama || (trx.pembeliNama ? `Umum (${trx.pembeliNama})` : 'Pelanggan Umum');

  const receiptHtml = `
    <div style="max-width:360px; margin:0 auto; font-family: var(--font-mono); font-size:12px; color:#111317;">
      <div style="text-align:center; border-bottom:1px dashed #94A3B8; padding-bottom:10px; margin-bottom:10px;">
        <div style="font-size:16px; font-weight:800;">${esc(s.namaBengkel || 'BENGKEL MOTOR')}</div>
        <div>${esc(s.alamatBengkel || '')}</div>
        <div>${esc(s.teleponBengkel || '')}</div>
      </div>
      <div style="margin-bottom:8px;">
        <div>No : ${esc(trx.noTransaksi)}</div>
        <div>Tgl: ${formatDateTime(trx.tanggal)}</div>
        <div>Kasir: ${esc(trx.kasirName)}</div>
        <div>Plg: ${esc(buyerLabel)} ${veh ? `(${esc(veh.noPolisi)})` : ''}</div>
      </div>
      <div style="border-top:1px dashed #94A3B8; border-bottom:1px dashed #94A3B8; padding:8px 0; margin:8px 0;">
        ${details
          .map(
            (d) => `
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>${esc(d.namaItem)} x${d.qty}</span>
                <span>${formatRupiah(d.subtotal)}</span>
              </div>
            `
          )
          .join('')}
      </div>
      <div>
        ${trx.biayaPasang > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Termasuk Biaya Pasang</span><span>${formatRupiah(trx.biayaPasang)}</span></div>` : ''}
        <div style="display:flex; justify-content:space-between;"><span>Diskon</span><span>-${formatRupiah(trx.diskon)}</span></div>
        ${trx.pajakNominal > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Pajak (${trx.pajakPersen}%)</span><span>${formatRupiah(trx.pajakNominal)}</span></div>` : ''}
        <div style="display:flex; justify-content:space-between; font-weight:800; font-size:14px; margin-top:4px;"><span>TOTAL</span><span>${formatRupiah(trx.total)}</span></div>
        <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>Metode</span><span>${esc(trx.metodePembayaran)} ${trx.qrisMode || ''}</span></div>
        <div style="display:flex; justify-content:space-between;"><span>Dibayar</span><span>${formatRupiah(trx.jumlahDibayar)}</span></div>
        ${trx.kembalian > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Kembalian</span><span>${formatRupiah(trx.kembalian)}</span></div>` : ''}
        ${trx.sisaPiutang > 0 ? `<div style="display:flex; justify-content:space-between; color:#B91C1C;"><span>Sisa Piutang</span><span>${formatRupiah(trx.sisaPiutang)}</span></div>` : ''}
        <div style="display:flex; justify-content:space-between;"><span>Status</span><span>${esc(trx.statusPembayaran)}</span></div>
      </div>
      ${
        trx.catatan
          ? `<div style="margin-top:8px; padding-top:6px; border-top:1px dashed #94A3B8; font-size:11px;"><strong>Ket:</strong> ${esc(trx.catatan)}</div>`
          : ''
      }
      <div style="text-align:center; border-top:1px dashed #94A3B8; margin-top:10px; padding-top:8px; font-size:11px;">
        ${esc(s.pesanStruk || 'Terima kasih atas kunjungan Anda.')}
      </div>
    </div>
  `;

  openModal({
    title: `Struk Transaksi — ${trx.noTransaksi}`,
    bodyHtml: receiptHtml,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="rcpt-close">Tutup</button>
      <button type="button" class="btn btn-primary" id="rcpt-print">${msIcon('print', 'ms-sm')}<span>Cetak / PDF</span></button>
    `,
    onMount: ({ close }) => {
      document.getElementById('rcpt-close').onclick = close;
      document.getElementById('rcpt-print').onclick = () => printDocumentHtml(receiptHtml);
    },
  });
}

export function renderTransactionHistory(container) {
  const paged = getFilteredTransactions();
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
      <span class="meta-line">Menampilkan ${paged.rows.length} dari ${paged.total} transaksi</span>
      ${
        hasRole('ADMIN', 'KASIR')
          ? `<button type="button" class="btn btn-primary btn-sm" id="hist-add-trx-btn">${msIcon('add', 'ms-sm')}<span>Tambah Transaksi</span></button>`
          : ''
      }
    </div>
    ${renderFilterToolbarHtml()}
    ${
      paged.rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada transaksi ditemukan.</div>`
        : `<div class="card-list">${buildTransactionCardsHtml(paged.rows)}</div>`
    }
    ${renderPaginationHtml(paged, 'trx')}
  `;

  const rerender = () => renderTransactionHistory(container);
  document.getElementById('hist-add-trx-btn')?.addEventListener('click', () => openKasirTransactionModal(rerender));
  bindTransactionListEvents(container, rerender);
}

export function renderCashClosing(container) {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrx = (store.data.Transactions || []).filter(
    (t) => t.tanggal.slice(0, 10) === today && t.statusPembayaran !== 'DIBATALKAN'
  );
  const totalTunai = todayTrx
    .filter((t) => t.metodePembayaran === 'TUNAI')
    .reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
  const totalQris = todayTrx
    .filter((t) => t.metodePembayaran === 'QRIS' && t.statusPembayaran !== 'MENUNGGU_PEMBAYARAN')
    .reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
  const closings = store.data.Cash_Closings || [];

  container.innerHTML = `
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="font-size:12px; color:#94A3B8;">Total Pendapatan Terkumpul (${today})</div>
      <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(totalTunai + totalQris)}</div>
      <div style="font-size:12px; color:#CBD5E1; margin-top:6px;">
        Kasir: ${esc(store.user.nama)} · ${todayTrx.length} transaksi valid · Tunai ${formatRupiah(totalTunai)} · QRIS ${formatRupiah(totalQris)}
      </div>
    </div>

    <div class="grid-2" style="align-items:start;">
      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Formulir Tutup Kas Harian</h3></div>
        <form id="cash-closing-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Modal Awal Laci (Rp)</label>
              <input class="form-control mono" id="cc-modal" type="number" min="0" value="200000" required />
            </div>
            <div class="form-group">
              <label class="form-label">Uang Tunai Aktual Dihitung (Rp)</label>
              <input class="form-control mono" id="cc-aktual" type="number" min="0" value="${200000 + totalTunai}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Catatan Penutupan</label>
            <textarea class="form-control" id="cc-catatan" placeholder="Catatan selisih kas atau serah terima shift..."></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Tutup Kas Harian</button>
        </form>
      </div>

      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Riwayat Tutup Kas</h3></div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            closings.length === 0
              ? `<div class="empty-state">Belum ada riwayat tutup kas.</div>`
              : closings
                  .map(
                    (c) => `
                      <div class="entity-card">
                        <div class="entity-card-top">
                          <div>
                            <div class="mono" style="font-weight:700;">${esc(c.tanggal)}</div>
                            <div class="meta-line">${esc(c.kasirName)} · ${c.totalTransaksi} transaksi</div>
                          </div>
                          <span class="status-tag ${c.selisihKas === 0 ? 'status-green' : 'status-red'}">Selisih ${formatRupiah(c.selisihKas)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:12px;">
                          <span>Tunai: <strong class="mono">${formatRupiah(c.totalTunai)}</strong></span>
                          <span>QRIS: <strong class="mono">${formatRupiah(c.totalQris)}</strong></span>
                        </div>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>
      </div>
    </div>
  `;

  document.getElementById('cash-closing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.createCashClosing({
        tanggal: today,
        modalAwal: Number(document.getElementById('cc-modal').value || 0),
        uangTunaiAktual: Number(document.getElementById('cc-aktual').value || 0),
        catatan: document.getElementById('cc-catatan').value.trim(),
      });
      await refreshAllData();
      showToast('Tutup kas harian berhasil disimpan.', 'success');
      renderCashClosing(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
