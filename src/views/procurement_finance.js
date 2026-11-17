import { store, refreshAllData, hasRole } from '../state.js';
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
  readFileAsDataUrl,
  generateQrisSvg,
} from '../utils.js';

export function renderSuppliers(container, onNavigate) {
  const rows = store.data.Suppliers || [];
  const purchases = store.data.Purchases || [];
  const payables = store.data.Accounts_Payable || [];
  const parts = store.data.Spareparts || [];
  const materials = store.data.Materials || [];
  const canEdit = hasRole('ADMIN', 'OWNER');

  const tabsHtml = onNavigate
    ? `
      <div class="m3-tabs" id="sup-inv-tabs">
        <button type="button" class="m3-tab-btn" data-sup-tab="sparepart">Inventory Barang</button>
        <button type="button" class="m3-tab-btn" data-sup-tab="bahan">Inventory Bahan</button>
        <button type="button" class="m3-tab-btn active" data-sup-tab="supplier">Data Supplier</button>
        <button type="button" class="m3-tab-btn" data-sup-tab="stok-mutasi">Riwayat Stok</button>
      </div>
    `
    : '';

  container.innerHTML = `
    ${tabsHtml}
    <div class="card-list">
      ${rows
        .map((s) => {
          const totalBuy = purchases
            .filter((p) => p.supplierId === s.id)
            .reduce((sum, p) => sum + Number(p.total || 0), 0);
          const debt = payables
            .filter((a) => a.supplierId === s.id)
            .reduce((sum, a) => sum + Number(a.sisaUtang || 0), 0);
          const partCount = parts.filter((p) => p.supplierId === s.id).length;
          const matCount = materials.filter((m) => m.supplierId === s.id).length;
          return `
            <div class="entity-card">
              <div class="entity-card-top">
                <div>
                  <div style="font-weight:700; font-size:14px;">${esc(s.nama)}</div>
                  <div class="meta-line mono">${esc(s.kode)} · ${esc(s.perusahaan)}</div>
                </div>
                <span class="status-tag ${debt > 0 ? 'status-red' : 'status-green'}">Utang ${formatRupiah(debt)}</span>
              </div>
              <div class="meta-line">
                <div class="mono">${esc(s.noTelp)} · ${esc(s.email || '-')}</div>
                <div>PIC: ${esc(s.pic)} · ${esc(s.alamat)}</div>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:11px;">
                <span class="status-tag status-blue">${partCount} Barang (Sparepart)</span>
                <span class="status-tag status-amber">${matCount} Bahan Operasional</span>
              </div>
              <div class="entity-card-actions">
                <span style="flex:1; font-size:12px;">Total PO: <strong class="mono">${formatRupiah(totalBuy)}</strong></span>
                ${onNavigate && canEdit ? `<button type="button" class="btn btn-primary btn-sm" data-sup-buy="${s.id}">+ Beli</button>` : ''}
                ${onNavigate && debt > 0 && canEdit ? `<button type="button" class="btn btn-destructive btn-sm" data-sup-debt="${s.id}">Bayar Utang</button>` : ''}
                ${canEdit ? `<button type="button" class="btn btn-outlined btn-sm" data-edit-sup="${s.id}">Edit</button>` : ''}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>

    ${canEdit ? `<button type="button" class="fab" id="sup-add-btn">${msIcon('add')}<span>Supplier</span></button>` : ''}
  `;

  if (onNavigate) {
    document.querySelectorAll('#sup-inv-tabs [data-sup-tab]').forEach((b) =>
      b.addEventListener('click', () => onNavigate(b.dataset.supTab))
    );
    container.querySelectorAll('[data-sup-buy]').forEach((b) =>
      b.addEventListener('click', () => onNavigate('pembelian'))
    );
    container.querySelectorAll('[data-sup-debt]').forEach((b) =>
      b.addEventListener('click', () => onNavigate('utang'))
    );
  }
  document.getElementById('sup-add-btn')?.addEventListener('click', () => openSupplierModal(null, () => renderSuppliers(container, onNavigate)));
  container.querySelectorAll('[data-edit-sup]').forEach((b) =>
    b.addEventListener('click', () => openSupplierModal(rows.find((x) => x.id === b.dataset.editSup), () => renderSuppliers(container, onNavigate)))
  );
}

function openSupplierModal(sup, onDone) {
  openModal({
    title: sup ? `Edit Supplier — ${sup.nama}` : 'Tambah Supplier Baru',
    bodyHtml: `
      <form id="sup-modal-form">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nama Supplier *</label><input class="form-control" id="sm-nama" value="${esc(sup?.nama || '')}" required /></div>
          <div class="form-group"><label class="form-label">Nama Perusahaan</label><input class="form-control" id="sm-comp" value="${esc(sup?.perusahaan || '')}" /></div>
          <div class="form-group"><label class="form-label">No. Telepon *</label><input class="form-control mono" id="sm-telp" value="${esc(sup?.noTelp || '')}" required /></div>
          <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="sm-email" type="email" value="${esc(sup?.email || '')}" /></div>
          <div class="form-group"><label class="form-label">PIC / Penanggung Jawab</label><input class="form-control" id="sm-pic" value="${esc(sup?.pic || '')}" /></div>
          <div class="form-group full"><label class="form-label">Alamat</label><input class="form-control" id="sm-alamat" value="${esc(sup?.alamat || '')}" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Supplier</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('sup-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          nama: document.getElementById('sm-nama').value.trim(),
          perusahaan: document.getElementById('sm-comp').value.trim(),
          noTelp: document.getElementById('sm-telp').value.trim(),
          email: document.getElementById('sm-email').value.trim(),
          pic: document.getElementById('sm-pic').value.trim(),
          alamat: document.getElementById('sm-alamat').value.trim(),
        };
        try {
          if (sup) await api.updateRow('Suppliers', sup.id, payload);
          else await api.createRow('Suppliers', payload);
          await refreshAllData();
          close();
          showToast('Data supplier disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

let purchaseDraftItems = [];

export function renderPurchaseCreate(container, onNavigate) {
  const suppliers = store.data.Suppliers || [];
  const parts = store.data.Spareparts || [];
  const mats = store.data.Materials || [];

  const subtotal = purchaseDraftItems.reduce((s, it) => s + it.qtyPesan * it.hargaBeli, 0);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
      <div class="meta-line">Stok bertambah hanya saat barang dikonfirmasi diterima di gudang.</div>
      <button type="button" class="btn btn-outlined btn-sm" id="pur-goto-hist">${msIcon('inventory', 'ms-sm')}<span>Riwayat PO</span></button>
    </div>

    <div class="grid-2" style="align-items:start;">
      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Tambah Item Pembelian</h3></div>
        <div class="form-group">
          <label class="form-label">Jenis Barang</label>
          <select class="form-control" id="pur-item-type">
            <option value="sparepart">Sparepart</option>
            <option value="material">Bahan Operasional</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pilih Item</label>
          <select class="form-control" id="pur-item-id">
            ${parts.map((p) => `<option value="${p.id}" data-price="${p.hargaBeli}" data-name="${esc(p.nama)}">${esc(p.nama)} (${esc(p.sku)})</option>`).join('')}
          </select>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Jumlah Pesan</label>
            <input class="form-control mono" id="pur-qty" type="number" min="1" value="10" />
          </div>
          <div class="form-group">
            <label class="form-label">Harga Beli Satuan (Rp)</label>
            <input class="form-control mono" id="pur-price" type="number" min="0" value="${parts[0]?.hargaBeli || 0}" />
          </div>
        </div>
        <button type="button" class="btn btn-dark" id="pur-add-line" style="width:100%;">+ Tambahkan ke Daftar PO</button>
      </div>

      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Ringkasan Pesanan Pembelian</h3></div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
          ${
            purchaseDraftItems.length === 0
              ? `<div class="empty-state" style="padding:16px;">Belum ada barang ditambahkan.</div>`
              : purchaseDraftItems
                  .map(
                    (it, idx) => `
                      <div class="entity-card" style="padding:10px 12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                          <div>
                            <div style="font-weight:700;">${esc(it.namaItem)}</div>
                            <div class="meta-line mono">${it.qtyPesan} x ${formatRupiah(it.hargaBeli)}</div>
                          </div>
                          <div style="display:flex; align-items:center; gap:8px;">
                            <span class="mono" style="font-weight:700;">${formatRupiah(it.qtyPesan * it.hargaBeli)}</span>
                            <button type="button" class="btn-icon" style="width:34px; height:34px;" data-del-po-line="${idx}">${msIcon('delete_outline', 'ms-sm')}</button>
                          </div>
                        </div>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>

        <form id="pur-submit-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Supplier *</label>
              <select class="form-control" id="pur-sup" required>
                ${suppliers.map((s) => `<option value="${s.id}">${esc(s.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Status Awal</label>
              <select class="form-control" id="pur-status">
                <option value="Dipesan">Dipesan</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Diskon (Rp)</label>
              <input class="form-control mono" id="pur-diskon" type="number" min="0" value="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Dibayar Awal (Rp, 0 = Kredit / Utang)</label>
              <input class="form-control mono" id="pur-paid" type="number" min="0" value="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Metode Bayar Awal</label>
              <select class="form-control" id="pur-pay-method">
                <option value="TUNAI">CASH / TUNAI</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Jatuh Tempo Utang</label>
              <input class="form-control" id="pur-due" type="date" value="${new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}" />
            </div>
            <div class="form-group full">
              <label class="form-label">Catatan</label>
              <input class="form-control" id="pur-note" placeholder="Catatan PO..." />
            </div>
          </div>
          <div class="summary-line"><span>Total PO Setelah Diskon</span><span class="mono" id="pur-net-total">${formatRupiah(subtotal)}</span></div>
          <div class="summary-total" style="margin-bottom:12px;">
            <span>Dicatat ke Utang Supplier</span>
            <span class="mono" id="pur-utang-preview" style="color:var(--accent-red);">${formatRupiah(subtotal)}</span>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;" ${purchaseDraftItems.length === 0 ? 'disabled' : ''}>Simpan Pesanan Pembelian</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('pur-goto-hist').onclick = () => onNavigate('riwayat-pembelian');

  const updatePurchaseUtangPreview = () => {
    const disc = Math.max(0, Number(document.getElementById('pur-diskon')?.value || 0));
    const paid = Math.max(0, Number(document.getElementById('pur-paid')?.value || 0));
    const net = Math.max(0, subtotal - disc);
    const utang = Math.max(0, net - paid);
    const netEl = document.getElementById('pur-net-total');
    const utangEl = document.getElementById('pur-utang-preview');
    if (netEl) netEl.textContent = formatRupiah(net);
    if (utangEl) utangEl.textContent = formatRupiah(utang);
  };
  document.getElementById('pur-diskon')?.addEventListener('input', updatePurchaseUtangPreview);
  document.getElementById('pur-paid')?.addEventListener('input', updatePurchaseUtangPreview);

  const typeSel = document.getElementById('pur-item-type');
  const itemSel = document.getElementById('pur-item-id');
  const priceInput = document.getElementById('pur-price');

  typeSel.onchange = () => {
    const list = typeSel.value === 'material' ? mats : parts;
    itemSel.innerHTML = list
      .map((i) => `<option value="${i.id}" data-price="${i.hargaBeli}" data-name="${esc(i.nama)}">${esc(i.nama)}</option>`)
      .join('');
    priceInput.value = list[0]?.hargaBeli || 0;
  };
  itemSel.onchange = () => {
    const opt = itemSel.selectedOptions[0];
    if (opt) priceInput.value = opt.dataset.price || 0;
  };

  document.getElementById('pur-add-line').onclick = () => {
    const opt = itemSel.selectedOptions[0];
    if (!opt) return;
    purchaseDraftItems.push({
      itemType: typeSel.value,
      itemId: opt.value,
      namaItem: opt.dataset.name,
      qtyPesan: Math.max(1, Number(document.getElementById('pur-qty').value || 1)),
      hargaBeli: Number(priceInput.value || 0),
    });
    renderPurchaseCreate(container, onNavigate);
  };

  container.querySelectorAll('[data-del-po-line]').forEach((b) =>
    b.addEventListener('click', () => {
      purchaseDraftItems.splice(Number(b.dataset.delPoLine), 1);
      renderPurchaseCreate(container, onNavigate);
    })
  );

  document.getElementById('pur-submit-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const paidVal = Number(document.getElementById('pur-paid').value || 0);
      const payMethod = document.getElementById('pur-pay-method').value;
      const rawNote = document.getElementById('pur-note').value.trim();
      const noteText = paidVal > 0 ? `${rawNote ? rawNote + ' · ' : ''}DP via ${payMethod}` : rawNote;
      const res = await api.createPurchase({
        supplierId: document.getElementById('pur-sup').value,
        statusPenerimaan: document.getElementById('pur-status').value,
        diskon: Number(document.getElementById('pur-diskon').value || 0),
        jumlahDibayar: paidVal,
        jatuhTempo: document.getElementById('pur-due').value,
        catatan: noteText,
        items: purchaseDraftItems,
      });
      purchaseDraftItems = [];
      await refreshAllData();
      const hasDebt = Number(res.purchase.total) - Number(res.purchase.jumlahDibayar) > 0;
      showToast(
        hasDebt
          ? `PO ${res.purchase.noPembelian} disimpan & utang supplier tercatat!`
          : `PO ${res.purchase.noPembelian} berhasil dibuat!`,
        'success'
      );
      onNavigate('riwayat-pembelian');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

export function renderPurchaseHistory(container, onNavigate) {
  const rows = store.data.Purchases || [];
  container.innerHTML = `
    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada riwayat pembelian.</div>`
        : `<div class="card-list">
            ${rows
              .map(
                (p) => `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800;">${esc(p.noPembelian)}</div>
                        <div class="meta-line">${esc(p.supplierName)} · ${formatDate(p.tanggal)}</div>
                      </div>
                      <span class="mono" style="font-weight:800;">${formatRupiah(p.total)}</span>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <span class="status-tag ${statusClass(p.statusPembayaran)}">Bayar: ${esc(p.statusPembayaran)}</span>
                      <span class="status-tag ${statusClass(p.statusPenerimaan)}">Gudang: ${esc(p.statusPenerimaan)}</span>
                    </div>
                    ${
                      p.statusPenerimaan !== 'Diterima' && p.statusPenerimaan !== 'Dibatalkan'
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-primary btn-sm" data-receive-po="${p.id}">Terima Barang</button></div>`
                        : ''
                    }
                  </div>
                `
              )
              .join('')}
          </div>`
    }

    <button type="button" class="fab" id="ph-new-btn">${msIcon('add')}<span>Buat PO</span></button>
  `;

  document.getElementById('ph-new-btn').onclick = () => onNavigate('pembelian');
  container.querySelectorAll('[data-receive-po]').forEach((b) =>
    b.addEventListener('click', () => openReceivePurchaseModal(b.dataset.receivePo, () => renderPurchaseHistory(container, onNavigate)))
  );
}

function openReceivePurchaseModal(purchaseId, onDone) {
  const pur = store.data.Purchases.find((p) => p.id === purchaseId);
  const details = store.data.Purchase_Details.filter((d) => d.purchaseId === purchaseId);
  if (!pur) return;

  openModal({
    title: `Penerimaan Barang — ${pur.noPembelian}`,
    bodyHtml: `
      <p class="meta-line" style="margin-bottom:12px;">Masukkan jumlah barang aktual yang diterima. Stok gudang bertambah sesuai jumlah diterima.</p>
      <form id="rec-po-form">
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
          ${details
            .map((d) => {
              const rem = Math.max(0, Number(d.qtyPesan) - Number(d.qtyDiterima));
              return `
                <div class="entity-card">
                  <div style="font-weight:700;">${esc(d.namaItem)}</div>
                  <div class="meta-line mono">Dipesan: ${d.qtyPesan} · Sudah Diterima: ${d.qtyDiterima}</div>
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Terima Sekarang</label>
                    <input class="form-control mono" type="number" min="0" max="${rem}" value="${rem}" data-rec-detail="${d.id}" />
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Konfirmasi Penerimaan &amp; Tambah Stok</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('rec-po-form').onsubmit = async (e) => {
        e.preventDefault();
        const receivedItems = Array.from(document.querySelectorAll('[data-rec-detail]')).map((inp) => ({
          detailId: inp.dataset.recDetail,
          qtyBaruDiterima: Number(inp.value || 0),
        }));
        try {
          await api.receivePurchase(purchaseId, receivedItems);
          await refreshAllData();
          close();
          showToast('Penerimaan barang dicatat & stok bertambah.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

export function renderPayables(container, onNavigate) {
  const rows = store.data.Accounts_Payable || [];
  const history = store.data.Payable_Payments || [];
  const totalSisa = rows.reduce((s, r) => s + Number(r.sisaUtang || 0), 0);
  const settings = store.data.Settings || {};

  const tabsHtml = onNavigate
    ? `
      <div class="m3-tabs" id="fin-debt-tabs">
        <button type="button" class="m3-tab-btn active" data-fin-tab="utang">Utang Supplier</button>
        <button type="button" class="m3-tab-btn" data-fin-tab="piutang">Piutang Pelanggan</button>
      </div>
    `
    : '';

  container.innerHTML = `
    ${tabsHtml}
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-size:12px; color:#94A3B8;">Total Sisa Utang Supplier Aktif</div>
          <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(totalSisa)}</div>
        </div>
        ${
          onNavigate && hasRole('ADMIN', 'OWNER')
            ? `<button type="button" class="btn btn-primary btn-sm" id="ap-create-po-btn">${msIcon('add_shopping_cart', 'ms-sm')}<span>Catat Pembelian Kredit</span></button>`
            : ''
        }
      </div>
    </div>

    <div class="card-list" style="margin-bottom:16px;">
      ${
        rows.length === 0
          ? `<div class="m3-card empty-state">Tidak ada catatan utang supplier.</div>`
          : rows
              .map(
                (a) => `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800;">${esc(a.noPembelian)}</div>
                        <div class="meta-line">${esc(a.supplierName)} · Jatuh tempo ${formatDate(a.jatuhTempo)}</div>
                      </div>
                      <span class="status-tag ${statusClass(a.status)}">${esc(a.status)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                      <span>Total: <strong class="mono">${formatRupiah(a.totalUtang)}</strong></span>
                      <span>Sisa: <strong class="mono" style="color:var(--state-red);">${formatRupiah(a.sisaUtang)}</strong></span>
                    </div>
                    ${
                      a.sisaUtang > 0 && hasRole('ADMIN', 'OWNER')
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-primary btn-sm" data-pay-ap="${a.id}">Bayar Cicilan (Cash / QRIS)</button></div>`
                        : ''
                    }
                  </div>
                `
              )
              .join('')
      }
    </div>

    <div class="m3-card">
      <div class="m3-card-header"><h3 class="m3-card-title">Riwayat Pembayaran Utang</h3></div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${history
          .map(
            (h) => `
              <div class="entity-card">
                <div style="display:flex; justify-content:space-between;">
                  <strong class="mono">${esc(h.metode || 'TUNAI')} ${h.referensi ? `· ${esc(h.referensi)}` : ''}</strong>
                  <span class="mono" style="font-weight:700;">${formatRupiah(h.nominal)}</span>
                </div>
                <div class="meta-line">${formatDateTime(h.tanggal)} · ${esc(h.catatan || '-')}</div>
              </div>
            `
          )
          .join('') || '<div class="empty-state">Belum ada pembayaran utang.</div>'}
      </div>
    </div>
  `;

  if (onNavigate) {
    document.querySelectorAll('#fin-debt-tabs [data-fin-tab]').forEach((b) =>
      b.addEventListener('click', () => onNavigate(b.dataset.finTab))
    );
    document.getElementById('ap-create-po-btn')?.addEventListener('click', () => onNavigate('pembelian'));
  }

  container.querySelectorAll('[data-pay-ap]').forEach((b) =>
    b.addEventListener('click', () => {
      const ap = rows.find((x) => x.id === b.dataset.payAp);
      if (!ap) return;
      let payMethod = 'TUNAI';
      openModal({
        title: `Bayar Utang ${ap.noPembelian}`,
        bodyHtml: `
          <form id="pay-ap-form">
            <div class="form-group"><label class="form-label">Sisa Utang Saat Ini</label><input class="form-control mono" value="${formatRupiah(ap.sisaUtang)}" disabled /></div>
            <div class="form-group"><label class="form-label">Nominal Pembayaran (Rp) *</label><input class="form-control mono" id="ap-nom" type="number" min="1" max="${ap.sisaUtang}" value="${ap.sisaUtang}" required /></div>
            <div class="form-group">
              <label class="form-label">Metode Pembayaran (Cash / QRIS) *</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <button type="button" class="btn btn-dark btn-sm" id="ap-btn-cash">${msIcon('payments', 'ms-sm')}<span>CASH / TUNAI</span></button>
                <button type="button" class="btn btn-outlined btn-sm" id="ap-btn-qris">${msIcon('qr_code_2', 'ms-sm')}<span>QRIS</span></button>
              </div>
            </div>
            <div id="ap-qris-box" style="display:none; margin-bottom:12px;">
              <div class="qris-box">
                <div class="meta-line" style="margin-bottom:6px;">Pembayaran QRIS Supplier · ${esc(ap.supplierName)}</div>
                ${generateQrisSvg(`AP-${ap.noPembelian}`)}
                <div class="meta-line mono" style="margin-top:6px;">NMID: ${esc(settings.qrisMerchantId || 'ID1020304050607')}</div>
              </div>
            </div>
            <div class="form-group"><label class="form-label">No. Bukti / Referensi</label><input class="form-control mono" id="ap-ref" placeholder="KW-... / Ref QRIS" /></div>
            <div class="form-group"><label class="form-label">Catatan</label><input class="form-control" id="ap-note" /></div>
            <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pembayaran Utang</button>
          </form>
        `,
        onMount: ({ close }) => {
          const btnCash = document.getElementById('ap-btn-cash');
          const btnQris = document.getElementById('ap-btn-qris');
          const qrisBox = document.getElementById('ap-qris-box');
          const setMethod = (m) => {
            payMethod = m;
            btnCash.className = `btn ${m === 'TUNAI' ? 'btn-dark' : 'btn-outlined'} btn-sm`;
            btnQris.className = `btn ${m === 'QRIS' ? 'btn-dark' : 'btn-outlined'} btn-sm`;
            qrisBox.style.display = m === 'QRIS' ? 'block' : 'none';
          };
          btnCash.onclick = () => setMethod('TUNAI');
          btnQris.onclick = () => setMethod('QRIS');
          document.getElementById('pay-ap-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.payPayable(ap.id, {
                nominal: Number(document.getElementById('ap-nom').value),
                metode: payMethod,
                referensi: document.getElementById('ap-ref').value.trim(),
                catatan: document.getElementById('ap-note').value.trim(),
              });
              await refreshAllData();
              close();
              showToast('Pembayaran utang supplier berhasil dicatat.', 'success');
              renderPayables(container, onNavigate);
            } catch (err) {
              showToast(err.message, 'error');
            }
          };
        },
      });
    })
  );
}

export function renderReceivables(container, onNavigate) {
  const rows = store.data.Accounts_Receivable || [];
  const history = store.data.Receivable_Payments || [];
  const totalSisa = rows.reduce((s, r) => s + Number(r.sisaPiutang || 0), 0);
  const settings = store.data.Settings || {};

  const tabsHtml =
    onNavigate && hasRole('ADMIN', 'OWNER')
      ? `
        <div class="m3-tabs" id="fin-ar-tabs">
          <button type="button" class="m3-tab-btn" data-ar-tab="utang">Utang Supplier</button>
          <button type="button" class="m3-tab-btn active" data-ar-tab="piutang">Piutang Pelanggan</button>
        </div>
      `
      : '';

  container.innerHTML = `
    ${tabsHtml}
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-size:12px; color:#94A3B8;">Total Sisa Piutang Pelanggan (Cash / QRIS)</div>
          <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(totalSisa)}</div>
        </div>
        ${
          onNavigate && hasRole('KASIR', 'ADMIN')
            ? `<button type="button" class="btn btn-primary btn-sm" id="ar-create-pos-btn">${msIcon('point_of_sale', 'ms-sm')}<span>Catat Piutang di Kasir</span></button>`
            : ''
        }
      </div>
    </div>

    <div class="card-list" style="margin-bottom:16px;">
      ${
        rows.length === 0
          ? `<div class="m3-card empty-state">Tidak ada piutang pelanggan.</div>`
          : rows
              .map(
                (a) => `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800;">${esc(a.noTransaksi)}</div>
                        <div class="meta-line">${esc(a.customerName)} · ${esc(a.noPolisi)} · Jatuh tempo ${formatDate(a.jatuhTempo)}</div>
                      </div>
                      <span class="status-tag ${statusClass(a.status)}">${esc(a.status)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                      <span>Total: <strong class="mono">${formatRupiah(a.totalPiutang)}</strong></span>
                      <span>Sisa: <strong class="mono" style="color:var(--state-red);">${formatRupiah(a.sisaPiutang)}</strong></span>
                    </div>
                    ${
                      a.sisaPiutang > 0 && hasRole('KASIR', 'ADMIN', 'OWNER')
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-primary btn-sm" data-pay-ar="${a.id}">Bayar Cicilan (Cash / QRIS)</button></div>`
                        : ''
                    }
                  </div>
                `
              )
              .join('')
      }
    </div>

    <div class="m3-card">
      <div class="m3-card-header"><h3 class="m3-card-title">Riwayat Cicilan Piutang</h3></div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${
          history.length === 0
            ? `<div class="empty-state">Belum ada pembayaran cicilan piutang.</div>`
            : history
                .map(
                  (h) => `
                    <div class="entity-card">
                      <div style="display:flex; justify-content:space-between;">
                        <strong>${esc(h.metode)} ${h.qrisMode || ''}</strong>
                        <span class="mono" style="font-weight:700;">${formatRupiah(h.nominal)}</span>
                      </div>
                      <div class="meta-line">${formatDateTime(h.tanggal)} · ${esc(h.catatan || '-')}</div>
                    </div>
                  `
                )
                .join('')
        }
      </div>
    </div>
  `;

  if (onNavigate) {
    document.querySelectorAll('#fin-ar-tabs [data-ar-tab]').forEach((b) =>
      b.addEventListener('click', () => onNavigate(b.dataset.arTab))
    );
    document.getElementById('ar-create-pos-btn')?.addEventListener('click', () => onNavigate('pos'));
  }

  container.querySelectorAll('[data-pay-ar]').forEach((b) =>
    b.addEventListener('click', () => {
      const ar = rows.find((x) => x.id === b.dataset.payAr);
      if (!ar) return;
      let payMethod = 'TUNAI';
      openModal({
        title: `Terima Pembayaran Piutang — ${ar.customerName}`,
        bodyHtml: `
          <form id="pay-ar-form">
            <div class="form-group"><label class="form-label">Sisa Piutang</label><input class="form-control mono" value="${formatRupiah(ar.sisaPiutang)}" disabled /></div>
            <div class="form-group"><label class="form-label">Nominal Bayar (Rp) *</label><input class="form-control mono" id="ar-nom" type="number" min="1" max="${ar.sisaPiutang}" value="${ar.sisaPiutang}" required /></div>
            <div class="form-group">
              <label class="form-label">Metode Pembayaran (Cash / QRIS) *</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <button type="button" class="btn btn-dark btn-sm" id="ar-btn-cash">${msIcon('payments', 'ms-sm')}<span>CASH / TUNAI</span></button>
                <button type="button" class="btn btn-outlined btn-sm" id="ar-btn-qris">${msIcon('qr_code_2', 'ms-sm')}<span>QRIS</span></button>
              </div>
            </div>
            <div id="ar-qris-verify-box" style="display:none; margin-bottom:12px;">
              <div class="qris-box">
                <div class="meta-line" style="margin-bottom:6px;">Merchant: <strong>${esc(settings.namaBengkel || 'BENGKEL MOTOR')}</strong></div>
                ${generateQrisSvg(`AR-${ar.noTransaksi}`)}
                <div class="meta-line mono" style="margin-top:6px;">NMID: ${esc(settings.qrisMerchantId || 'ID1020304050607')}</div>
              </div>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="ar-qris-ok" />
                <span>Saya telah memeriksa &amp; memverifikasi pembayaran QRIS masuk.</span>
              </label>
            </div>
            <div class="form-group"><label class="form-label">Catatan</label><input class="form-control" id="ar-note" /></div>
            <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Konfirmasi Pembayaran Piutang</button>
          </form>
        `,
        onMount: ({ close }) => {
          const btnCash = document.getElementById('ar-btn-cash');
          const btnQris = document.getElementById('ar-btn-qris');
          const qrisBox = document.getElementById('ar-qris-verify-box');
          const setMethod = (m) => {
            payMethod = m;
            btnCash.className = `btn ${m === 'TUNAI' ? 'btn-dark' : 'btn-outlined'} btn-sm`;
            btnQris.className = `btn ${m === 'QRIS' ? 'btn-dark' : 'btn-outlined'} btn-sm`;
            qrisBox.style.display = m === 'QRIS' ? 'block' : 'none';
          };
          btnCash.onclick = () => setMethod('TUNAI');
          btnQris.onclick = () => setMethod('QRIS');
          document.getElementById('pay-ar-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api.payReceivable(ar.id, {
                nominal: Number(document.getElementById('ar-nom').value),
                metode: payMethod,
                qrisMode: 'STATIS',
                qrisVerified: payMethod === 'TUNAI' || document.getElementById('ar-qris-ok').checked,
                catatan: document.getElementById('ar-note').value.trim(),
              });
              await refreshAllData();
              close();
              showToast('Pembayaran piutang dicatat.', 'success');
              renderReceivables(container, onNavigate);
            } catch (err) {
              showToast(err.message, 'error');
            }
          };
        },
      });
    })
  );
}

export function renderExpenses(container) {
  const rows = store.data.Expenses || [];
  const total = rows.reduce((s, r) => s + Number(r.nominal || 0), 0);
  const categories = ['Listrik', 'Air', 'Internet', 'Sewa tempat', 'Gaji pegawai', 'Perawatan alat', 'Pembelian perlengkapan', 'Kebersihan', 'Transportasi', 'Pengeluaran lainnya'];

  container.innerHTML = `
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="font-size:12px; color:#94A3B8;">Total Pengeluaran Operasional Tercatat</div>
      <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(total)}</div>
    </div>

    <div class="card-list">
      ${rows
        .map(
          (x) => `
            <div class="entity-card">
              <div class="entity-card-top">
                <div>
                  <div style="font-weight:700;">${esc(x.kategori)}</div>
                  <div class="meta-line mono">${formatDate(x.tanggal)} · ${esc(x.createdByName)}</div>
                </div>
                <span class="mono" style="font-weight:800; color:var(--state-red);">${formatRupiah(x.nominal)}</span>
              </div>
              <div class="meta-line">${esc(x.keterangan)}</div>
            </div>
          `
        )
        .join('')}
    </div>

    <button type="button" class="fab" id="exp-add-btn">${msIcon('add')}<span>Pengeluaran</span></button>
  `;

  document.getElementById('exp-add-btn').onclick = () => {
    let bukti = '';
    openModal({
      title: 'Catat Pengeluaran Operasional',
      bodyHtml: `
        <form id="exp-form">
          <div class="form-grid">
            <div class="form-group"><label class="form-label">Kategori *</label><select class="form-control" id="ex-kat">${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Tanggal *</label><input class="form-control" id="ex-tgl" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
            <div class="form-group full"><label class="form-label">Keterangan *</label><input class="form-control" id="ex-ket" required /></div>
            <div class="form-group"><label class="form-label">Nominal (Rp) *</label><input class="form-control mono" id="ex-nom" type="number" min="1" required /></div>
            <div class="form-group"><label class="form-label">Bukti Pembayaran</label><input class="form-control" id="ex-file" type="file" accept="image/*,application/pdf" /></div>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pengeluaran</button>
        </form>
      `,
      onMount: ({ close }) => {
        document.getElementById('ex-file').onchange = async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const d = await readFileAsDataUrl(f);
          const up = await api.upload(d, f.name);
          bukti = up.url;
          showToast('Bukti pengeluaran diunggah.', 'success');
        };
        document.getElementById('exp-form').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api.createRow('Expenses', {
              kategori: document.getElementById('ex-kat').value,
              tanggal: document.getElementById('ex-tgl').value,
              keterangan: document.getElementById('ex-ket').value.trim(),
              nominal: Number(document.getElementById('ex-nom').value),
              bukti,
            });
            await refreshAllData();
            close();
            showToast('Pengeluaran operasional dicatat.', 'success');
            renderExpenses(container);
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      },
    });
  };
}

export function renderRevenues(container) {
  const validTrx = (store.data.Transactions || []).filter((t) => t.statusPembayaran !== 'DIBATALKAN');
  const totalJasa = validTrx.reduce((s, t) => s + Number(t.subtotalJasa || 0), 0);
  const totalPart = validTrx.reduce((s, t) => s + Number(t.subtotalSparepart || 0), 0);
  const totalTunai = validTrx.filter((t) => t.metodePembayaran === 'TUNAI').reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
  const totalQris = validTrx.filter((t) => t.metodePembayaran === 'QRIS').reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);

  container.innerHTML = `
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="font-size:12px; color:#94A3B8;">Total Pendapatan Bruto</div>
      <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(totalJasa + totalPart)}</div>
      <div style="font-size:12px; color:#CBD5E1; margin-top:4px;">Tunai ${formatRupiah(totalTunai)} · QRIS ${formatRupiah(totalQris)}</div>
    </div>

    <div class="kpi-android-grid">
      <div class="stat-tile"><div><div class="stat-label">Jasa Servis</div><div class="stat-val">${formatRupiah(totalJasa)}</div></div><div class="stat-icon-box blue">${msIcon('build')}</div></div>
      <div class="stat-tile"><div><div class="stat-label">Sparepart</div><div class="stat-val">${formatRupiah(totalPart)}</div></div><div class="stat-icon-box green">${msIcon('inventory_2')}</div></div>
    </div>

    <div class="card-list">
      ${validTrx
        .map(
          (t) => `
            <div class="entity-card">
              <div class="entity-card-top">
                <div>
                  <div class="mono" style="font-weight:800;">${esc(t.noTransaksi)}</div>
                  <div class="meta-line">${formatDateTime(t.tanggal)} · ${esc(t.metodePembayaran)}</div>
                </div>
                <span class="mono" style="font-weight:800; color:var(--accent-red);">${formatRupiah(t.total)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12px;">
                <span>Jasa: <span class="mono">${formatRupiah(t.subtotalJasa)}</span></span>
                <span>Part: <span class="mono">${formatRupiah(t.subtotalSparepart)}</span></span>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

export function renderCommissions(container) {
  const rows = store.data.Commissions || [];
  const totalAll = rows.reduce((s, c) => s + Number(c.nominalKomisi || 0), 0);
  const canPay = hasRole('ADMIN', 'OWNER');

  container.innerHTML = `
    <div class="m3-card-dark" style="margin-bottom:14px;">
      <div style="font-size:12px; color:#94A3B8;">Total Komisi Mekanik</div>
      <div class="mono" style="font-size:26px; font-weight:800; margin-top:4px;">${formatRupiah(totalAll)}</div>
    </div>

    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada komisi tercatat.</div>`
        : `<div class="card-list">
            ${rows
              .map(
                (c) => `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div style="font-weight:700;">${esc(c.mechanicName)}</div>
                        <div class="meta-line mono">${esc(c.noWo)} · ${formatDateTime(c.tanggal)}</div>
                      </div>
                      <span class="status-tag ${statusClass(c.status)}">${esc(c.status)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                      <span>Dasar: <span class="mono">${formatRupiah(c.dasarJasa)}</span> (${esc(c.persentaseAtauTipe)})</span>
                      <span class="mono" style="font-weight:800; color:var(--accent-red);">${formatRupiah(c.nominalKomisi)}</span>
                    </div>
                    ${
                      canPay && c.status === 'BELUM_DIBAYAR'
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-primary btn-sm" data-pay-com="${c.id}">Tandai Dibayar</button></div>`
                        : ''
                    }
                  </div>
                `
              )
              .join('')}
          </div>`
    }
  `;

  container.querySelectorAll('[data-pay-com]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api.updateRow('Commissions', b.dataset.payCom, { status: 'DIBAYAR' });
        await refreshAllData();
        showToast('Komisi mekanik ditandai sudah dibayar.', 'success');
        renderCommissions(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    })
  );
}
