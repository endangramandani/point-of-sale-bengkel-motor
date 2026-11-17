import { store, refreshAllData, hasRole } from '../state.js';
import { api } from '../api.js';
import {
  esc,
  msIcon,
  formatRupiah,
  formatDateTime,
  showToast,
  openModal,
  readFileAsDataUrl,
  paginate,
  renderPaginationHtml,
} from '../utils.js';

let spFilter = { search: '', cat: 'ALL', stockState: 'ALL', sort: 'NAME', page: 1 };

function renderInventoryTopTabs(activeId, onNavigate) {
  if (!onNavigate) return '';
  const showSupAndMut = hasRole('ADMIN', 'OWNER');
  return `
    <div class="m3-tabs" id="inv-top-tabs">
      <button type="button" class="m3-tab-btn ${activeId === 'sparepart' ? 'active' : ''}" data-inv-tab="sparepart">Inventory Barang</button>
      <button type="button" class="m3-tab-btn ${activeId === 'bahan' ? 'active' : ''}" data-inv-tab="bahan">Inventory Bahan</button>
      ${showSupAndMut ? `<button type="button" class="m3-tab-btn ${activeId === 'supplier' ? 'active' : ''}" data-inv-tab="supplier">Data Supplier</button>` : ''}
      ${showSupAndMut ? `<button type="button" class="m3-tab-btn ${activeId === 'stok-mutasi' ? 'active' : ''}" data-inv-tab="stok-mutasi">Riwayat Stok</button>` : ''}
    </div>
  `;
}

function bindInventoryTopTabs(onNavigate) {
  if (!onNavigate) return;
  document.querySelectorAll('#inv-top-tabs [data-inv-tab]').forEach((b) =>
    b.addEventListener('click', () => onNavigate(b.dataset.invTab))
  );
}

export function renderSpareparts(container, onNavigate) {
  const all = store.data.Spareparts || [];
  const cats = store.data.Sparepart_Categories || [];
  const canEdit = hasRole('ADMIN', 'OWNER');
  const q = spFilter.search.toLowerCase();

  let filtered = all.filter((p) => {
    const matchText =
      p.nama.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.merek.toLowerCase().includes(q) ||
      (p.kecocokanMotor || '').toLowerCase().includes(q);
    const matchCat = spFilter.cat === 'ALL' || p.categoryId === spFilter.cat;
    const isLow = p.stok <= p.stokMinimum;
    const matchStock =
      spFilter.stockState === 'ALL' ||
      (spFilter.stockState === 'LOW' && isLow) ||
      (spFilter.stockState === 'OK' && !isLow);
    return matchText && matchCat && matchStock;
  });

  if (spFilter.sort === 'LOW_STOCK') {
    filtered = [...filtered].sort((a, b) => a.stok - b.stok);
  } else if (spFilter.sort === 'HIGH_PRICE') {
    filtered = [...filtered].sort((a, b) => b.hargaJual - a.hargaJual);
  } else {
    filtered = [...filtered].sort((a, b) => a.nama.localeCompare(b.nama));
  }

  const paged = paginate(filtered, spFilter.page, 12);

  container.innerHTML = `
    ${renderInventoryTopTabs('sparepart', onNavigate)}

    <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
      <div class="search-box">
        ${msIcon('search')}
        <input class="form-control" id="sp-search" type="search" placeholder="Cari SKU, nama, merek, motor..." value="${esc(spFilter.search)}" />
      </div>
      <select class="form-control" id="sp-sort" style="width:165px;">
        <option value="NAME" ${spFilter.sort === 'NAME' ? 'selected' : ''}>Urut: Nama A-Z</option>
        <option value="LOW_STOCK" ${spFilter.sort === 'LOW_STOCK' ? 'selected' : ''}>Stok Terendah</option>
        <option value="HIGH_PRICE" ${spFilter.sort === 'HIGH_PRICE' ? 'selected' : ''}>Harga Tertinggi</option>
      </select>
    </div>

    <div class="chip-scroller">
      <button type="button" class="m3-chip ${spFilter.stockState === 'ALL' ? 'active' : ''}" data-sp-st="ALL">Semua Stok</button>
      <button type="button" class="m3-chip ${spFilter.stockState === 'LOW' ? 'active' : ''}" data-sp-st="LOW">Stok Menipis</button>
      <button type="button" class="m3-chip ${spFilter.stockState === 'OK' ? 'active' : ''}" data-sp-st="OK">Stok Aman</button>
      <button type="button" class="m3-chip ${spFilter.cat === 'ALL' ? 'active' : ''}" data-sp-cat="ALL">Semua Kategori</button>
      ${cats
        .map(
          (c) =>
            `<button type="button" class="m3-chip ${spFilter.cat === c.id ? 'active' : ''}" data-sp-cat="${c.id}">${esc(c.nama)}</button>`
        )
        .join('')}
    </div>

    ${
      paged.rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada sparepart ditemukan.</div>`
        : `<div class="card-list">
            ${paged.rows
              .map((p) => {
                const low = p.stok <= p.stokMinimum;
                const sup = (store.data.Suppliers || []).find((s) => s.id === p.supplierId);
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        ${
                          p.foto
                            ? `<img class="thumb-img" src="${esc(p.foto)}" alt="${esc(p.nama)}" />`
                            : `<div class="thumb-fallback">${esc(p.sku.slice(0, 3))}</div>`
                        }
                        <div style="min-width:0;">
                          <div style="font-weight:700; font-size:14px;">${esc(p.nama)}</div>
                          <div class="meta-line mono">${esc(p.sku)} · ${esc(p.merek)}</div>
                        </div>
                      </div>
                      <span class="status-tag ${low ? 'status-red' : 'status-green'}">${low ? 'Menipis' : 'Aman'}</span>
                    </div>

                    <div class="meta-line" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                      ${esc(p.deskripsi || p.kecocokanMotor || '-')}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                      <span>Stok: <strong class="mono" style="color:${low ? 'var(--state-red)' : 'var(--text-primary)'};">${p.stok} ${esc(p.satuan)}</strong> (Min ${p.stokMinimum})</span>
                      <span class="mono" style="font-weight:800; font-size:14px;">${formatRupiah(p.hargaJual)}</span>
                    </div>

                    <div class="entity-card-actions">
                      <span class="meta-line" style="flex:1;">Supplier: <strong>${esc(sup?.nama || 'Belum dipilih')}</strong> · Rak: ${esc(p.lokasiRak || '-')}</span>
                      <button type="button" class="btn btn-outlined btn-sm" data-detail-sp="${p.id}">Detail</button>
                      ${canEdit ? `<button type="button" class="btn btn-dark btn-sm" data-edit-sp="${p.id}">Edit</button>` : ''}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    ${renderPaginationHtml(paged, 'sp')}
    ${canEdit ? `<button type="button" class="fab" id="sp-add-btn">${msIcon('add')}<span>Sparepart</span></button>` : ''}
  `;

  bindInventoryTopTabs(onNavigate);

  document.getElementById('sp-search').oninput = (e) => {
    spFilter.search = e.target.value;
    spFilter.page = 1;
    renderSpareparts(container, onNavigate);
  };
  document.getElementById('sp-sort').onchange = (e) => {
    spFilter.sort = e.target.value;
    renderSpareparts(container, onNavigate);
  };
  container.querySelectorAll('[data-sp-st]').forEach((b) =>
    b.addEventListener('click', () => {
      spFilter.stockState = b.dataset.spSt;
      spFilter.page = 1;
      renderSpareparts(container, onNavigate);
    })
  );
  container.querySelectorAll('[data-sp-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      spFilter.cat = b.dataset.spCat;
      spFilter.page = 1;
      renderSpareparts(container, onNavigate);
    })
  );
  document.getElementById('sp-add-btn')?.addEventListener('click', () => openSparepartModal(null, () => renderSpareparts(container, onNavigate)));
  container.querySelectorAll('[data-edit-sp]').forEach((b) =>
    b.addEventListener('click', () => openSparepartModal(all.find((x) => x.id === b.dataset.editSp), () => renderSpareparts(container, onNavigate)))
  );
  container.querySelectorAll('[data-detail-sp]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = all.find((x) => x.id === b.dataset.detailSp);
      if (!p) return;
      const sup = (store.data.Suppliers || []).find((s) => s.id === p.supplierId);
      openModal({
        title: `${p.nama}`,
        bodyHtml: `
          <div class="entity-card">
            ${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nama)}" style="width:100%; max-height:180px; object-fit:cover; border-radius:12px;" />` : ''}
            <div><strong>SKU / Barcode:</strong> <span class="mono">${esc(p.sku)} / ${esc(p.barcode || '-')}</span></div>
            <div><strong>Deskripsi:</strong> ${esc(p.deskripsi || '-')}</div>
            <div><strong>Kategori &amp; Merek:</strong> ${esc(p.categoryName)} · ${esc(p.merek)}</div>
            <div><strong>Supplier Utama:</strong> ${esc(sup?.nama || 'Belum dipilih')}</div>
            <div><strong>Kecocokan Motor:</strong> ${esc(p.kecocokanMotor || '-')}</div>
            <div><strong>Harga Beli:</strong> <span class="mono">${formatRupiah(p.hargaBeli)}</span></div>
            <div><strong>Harga Jual:</strong> <span class="mono" style="font-weight:800; color:var(--accent-red);">${formatRupiah(p.hargaJual)}</span></div>
            <div><strong>Stok Saat Ini:</strong> <span class="mono">${p.stok} ${esc(p.satuan)}</span> (Min ${p.stokMinimum})</div>
            <div><strong>Lokasi Rak:</strong> ${esc(p.lokasiRak || '-')}</div>
          </div>
        `,
      });
    })
  );
  container.querySelector('[data-pg-prev]')?.addEventListener('click', () => {
    spFilter.page -= 1;
    renderSpareparts(container, onNavigate);
  });
  container.querySelector('[data-pg-next]')?.addEventListener('click', () => {
    spFilter.page += 1;
    renderSpareparts(container, onNavigate);
  });
}

function openSparepartModal(sp, onDone) {
  const cats = store.data.Sparepart_Categories || [];
  const suppliers = store.data.Suppliers || [];
  let foto = sp?.foto || '';
  openModal({
    title: sp ? `Edit Sparepart — ${sp.nama}` : 'Tambah Sparepart Baru',
    wide: true,
    bodyHtml: `
      <form id="sp-modal-form">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Kode SKU *</label><input class="form-control mono" id="spm-sku" value="${esc(sp?.sku || '')}" required /></div>
          <div class="form-group"><label class="form-label">Barcode</label><input class="form-control mono" id="spm-barcode" value="${esc(sp?.barcode || '')}" /></div>
          <div class="form-group"><label class="form-label">Nama Sparepart *</label><input class="form-control" id="spm-nama" value="${esc(sp?.nama || '')}" required /></div>
          <div class="form-group"><label class="form-label">Merek *</label><input class="form-control" id="spm-merek" value="${esc(sp?.merek || '')}" required /></div>
          <div class="form-group">
            <label class="form-label">Kategori</label>
            <select class="form-control" id="spm-cat">
              ${cats.map((c) => `<option value="${c.id}" ${sp?.categoryId === c.id ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Supplier Utama</label>
            <select class="form-control" id="spm-sup">
              <option value="">-- Pilih Supplier --</option>
              ${suppliers.map((s) => `<option value="${s.id}" ${sp?.supplierId === s.id ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Kecocokan Motor</label><input class="form-control" id="spm-motor" value="${esc(sp?.kecocokanMotor || '')}" /></div>
          <div class="form-group"><label class="form-label">Satuan</label><input class="form-control" id="spm-satuan" value="${esc(sp?.satuan || 'Pcs')}" /></div>
          <div class="form-group"><label class="form-label">Harga Beli (Rp) *</label><input class="form-control mono" id="spm-beli" type="number" min="0" value="${sp?.hargaBeli ?? 0}" required /></div>
          <div class="form-group"><label class="form-label">Harga Jual (Rp) *</label><input class="form-control mono" id="spm-jual" type="number" min="0" value="${sp?.hargaJual ?? 0}" required /></div>
          <div class="form-group"><label class="form-label">Stok Awal / Saat Ini</label><input class="form-control mono" id="spm-stok" type="number" min="0" value="${sp?.stok ?? 0}" /></div>
          <div class="form-group"><label class="form-label">Stok Minimum</label><input class="form-control mono" id="spm-min" type="number" min="0" value="${sp?.stokMinimum ?? 5}" /></div>
          <div class="form-group"><label class="form-label">Lokasi Rak</label><input class="form-control" id="spm-rak" value="${esc(sp?.lokasiRak || '')}" /></div>
          <div class="form-group"><label class="form-label">Gambar / Foto Produk</label><input class="form-control" id="spm-foto" type="file" accept="image/*" /></div>
          <div class="form-group full"><label class="form-label">Deskripsi Barang</label><textarea class="form-control" id="spm-desk" placeholder="Deskripsi spesifikasi dan kegunaan sparepart...">${esc(sp?.deskripsi || '')}</textarea></div>
          <div class="form-group full" id="spm-preview-wrap" style="display:${foto ? 'block' : 'none'};">
            <img id="spm-preview" src="${esc(foto)}" alt="Preview" style="max-height:120px; border-radius:10px; border:1px solid var(--border-color);" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Sparepart</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('spm-foto').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const d = await readFileAsDataUrl(f);
        const up = await api.upload(d, f.name);
        foto = up.url;
        const wrap = document.getElementById('spm-preview-wrap');
        const img = document.getElementById('spm-preview');
        if (wrap && img) {
          img.src = foto;
          wrap.style.display = 'block';
        }
        showToast('Foto sparepart diunggah.', 'success');
      };
      document.getElementById('sp-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const catId = document.getElementById('spm-cat').value;
        const cat = cats.find((c) => c.id === catId);
        const payload = {
          sku: document.getElementById('spm-sku').value.trim().toUpperCase(),
          barcode: document.getElementById('spm-barcode').value.trim(),
          nama: document.getElementById('spm-nama').value.trim(),
          merek: document.getElementById('spm-merek').value.trim(),
          deskripsi: document.getElementById('spm-desk').value.trim(),
          categoryId: catId,
          categoryName: cat?.nama || '',
          supplierId: document.getElementById('spm-sup').value || null,
          kecocokanMotor: document.getElementById('spm-motor').value.trim(),
          satuan: document.getElementById('spm-satuan').value.trim() || 'Pcs',
          hargaBeli: Number(document.getElementById('spm-beli').value || 0),
          hargaJual: Number(document.getElementById('spm-jual').value || 0),
          stok: Number(document.getElementById('spm-stok').value || 0),
          stokMinimum: Number(document.getElementById('spm-min').value || 5),
          lokasiRak: document.getElementById('spm-rak').value.trim(),
          foto,
          statusAktif: true,
        };
        try {
          if (sp) await api.updateRow('Spareparts', sp.id, payload);
          else await api.createRow('Spareparts', payload);
          await refreshAllData();
          close();
          showToast('Data sparepart disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

export function renderMaterials(container, onNavigate) {
  const rows = store.data.Materials || [];
  const cats = store.data.Material_Categories || [];
  const suppliers = store.data.Suppliers || [];
  const canEdit = hasRole('ADMIN', 'OWNER');

  container.innerHTML = `
    ${renderInventoryTopTabs('bahan', onNavigate)}

    <div class="card-list">
      ${rows
        .map((m) => {
          const low = m.stok <= m.stokMinimum;
          const sup = suppliers.find((s) => s.id === m.supplierId);
          return `
            <div class="entity-card">
              <div class="entity-card-top">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                  ${
                    m.foto
                      ? `<img class="thumb-img" src="${esc(m.foto)}" alt="${esc(m.nama)}" />`
                      : `<div class="thumb-fallback">${msIcon('oil_barrel', 'ms-sm')}</div>`
                  }
                  <div style="min-width:0;">
                    <div style="font-weight:700; font-size:14px;">${esc(m.nama)}</div>
                    <div class="meta-line mono">${esc(m.kode)} · ${esc(m.categoryName)}</div>
                  </div>
                </div>
                <span class="status-tag ${low ? 'status-red' : 'status-green'}">${low ? 'Menipis' : 'Aman'}</span>
              </div>
              <div class="meta-line" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                ${esc(m.deskripsi || '-')}
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12px;">
                <span>Stok: <strong class="mono" style="color:${low ? 'var(--state-red)' : 'var(--text-primary)'};">${m.stok} ${esc(m.satuan)}</strong> (Min ${m.stokMinimum})</span>
                <span class="mono" style="font-weight:700;">Harga: ${formatRupiah(m.hargaBeli)}</span>
              </div>
              <div class="entity-card-actions">
                <span class="meta-line" style="flex:1;">Supplier: <strong>${esc(sup?.nama || 'Belum dipilih')}</strong></span>
                ${canEdit ? `<button type="button" class="btn btn-outlined btn-sm" data-edit-mat="${m.id}">Edit Bahan</button>` : ''}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>

    ${canEdit ? `<button type="button" class="fab" id="mat-add-btn">${msIcon('add')}<span>Bahan</span></button>` : ''}
  `;

  bindInventoryTopTabs(onNavigate);

  document.getElementById('mat-add-btn')?.addEventListener('click', () => openMaterialModal(null, cats, () => renderMaterials(container, onNavigate)));
  container.querySelectorAll('[data-edit-mat]').forEach((b) =>
    b.addEventListener('click', () => openMaterialModal(rows.find((x) => x.id === b.dataset.editMat), cats, () => renderMaterials(container, onNavigate)))
  );
}

function openMaterialModal(mat, cats, onDone) {
  const suppliers = store.data.Suppliers || [];
  let foto = mat?.foto || '';
  openModal({
    title: mat ? `Edit Bahan — ${mat.nama}` : 'Tambah Bahan Operasional Baru',
    wide: true,
    bodyHtml: `
      <form id="mat-modal-form">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Kode Bahan *</label><input class="form-control mono" id="mm-kode" value="${esc(mat?.kode || '')}" required /></div>
          <div class="form-group"><label class="form-label">Kategori</label><select class="form-control" id="mm-cat">${cats.map((c) => `<option value="${c.id}" ${mat?.categoryId === c.id ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Nama / Title Bahan *</label><input class="form-control" id="mm-nama" value="${esc(mat?.nama || '')}" required /></div>
          <div class="form-group">
            <label class="form-label">Supplier</label>
            <select class="form-control" id="mm-sup">
              <option value="">-- Pilih Supplier --</option>
              ${suppliers.map((s) => `<option value="${s.id}" ${mat?.supplierId === s.id ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Satuan</label><input class="form-control" id="mm-satuan" value="${esc(mat?.satuan || 'Kaleng')}" /></div>
          <div class="form-group"><label class="form-label">Harga Beli (Rp)</label><input class="form-control mono" id="mm-beli" type="number" min="0" value="${mat?.hargaBeli ?? 0}" /></div>
          <div class="form-group"><label class="form-label">Stok</label><input class="form-control mono" id="mm-stok" type="number" min="0" value="${mat?.stok ?? 0}" /></div>
          <div class="form-group"><label class="form-label">Stok Minimum</label><input class="form-control mono" id="mm-min" type="number" min="0" value="${mat?.stokMinimum ?? 5}" /></div>
          <div class="form-group full"><label class="form-label">Deskripsi Bahan</label><textarea class="form-control" id="mm-desk" placeholder="Deskripsi pemakaian atau spesifikasi bahan...">${esc(mat?.deskripsi || '')}</textarea></div>
          <div class="form-group full"><label class="form-label">Gambar / Foto Bahan</label><input class="form-control" id="mm-foto" type="file" accept="image/*" /></div>
          <div class="form-group full" id="mm-preview-wrap" style="display:${foto ? 'block' : 'none'};">
            <img id="mm-preview" src="${esc(foto)}" alt="Preview Bahan" style="max-height:120px; border-radius:10px; border:1px solid var(--border-color);" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Bahan Operasional</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('mm-foto').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const d = await readFileAsDataUrl(f);
        const up = await api.upload(d, f.name);
        foto = up.url;
        const wrap = document.getElementById('mm-preview-wrap');
        const img = document.getElementById('mm-preview');
        if (wrap && img) {
          img.src = foto;
          wrap.style.display = 'block';
        }
        showToast('Foto bahan diunggah.', 'success');
      };
      document.getElementById('mat-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const catId = document.getElementById('mm-cat').value;
        const cat = cats.find((c) => c.id === catId);
        const payload = {
          kode: document.getElementById('mm-kode').value.trim().toUpperCase(),
          nama: document.getElementById('mm-nama').value.trim(),
          deskripsi: document.getElementById('mm-desk').value.trim(),
          categoryId: catId,
          categoryName: cat?.nama || '',
          supplierId: document.getElementById('mm-sup').value || null,
          satuan: document.getElementById('mm-satuan').value.trim(),
          hargaBeli: Number(document.getElementById('mm-beli').value || 0),
          stok: Number(document.getElementById('mm-stok').value || 0),
          stokMinimum: Number(document.getElementById('mm-min').value || 5),
          foto,
          statusAktif: true,
        };
        try {
          if (mat) await api.updateRow('Materials', mat.id, payload);
          else await api.createRow('Materials', payload);
          await refreshAllData();
          close();
          showToast('Data bahan operasional disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

export function renderStockMovements(container, onNavigate) {
  const rows = store.data.Stock_Movements || [];
  container.innerHTML = `
    ${renderInventoryTopTabs('stok-mutasi', onNavigate)}

    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Belum ada mutasi stok.</div>`
        : `<div class="card-list">
            ${rows
              .map(
                (m) => `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div style="font-weight:700;">${esc(m.namaItem)}</div>
                        <div class="meta-line">${m.itemType === 'material' ? 'Bahan Operasional' : 'Sparepart'} · ${formatDateTime(m.tanggal)}</div>
                      </div>
                      <span class="status-tag ${m.tipe === 'MASUK' || m.tipe === 'PEMBALIKAN' ? 'status-green' : m.tipe === 'KELUAR' ? 'status-red' : 'status-amber'}">${esc(m.tipe)} (${m.qty})</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                      <span class="mono">${esc(m.referensiTipe)} · ${esc(m.referensiId)}</span>
                      <span class="mono">Stok: ${m.stokSebelum} &rarr; <strong>${m.stokSesudah}</strong></span>
                    </div>
                    <div class="meta-line">${esc(m.keterangan)}</div>
                  </div>
                `
              )
              .join('')}
          </div>`
    }
  `;

  bindInventoryTopTabs(onNavigate);
}

export function renderSparepartUsages(container) {
  const woParts = store.data.Work_Order_Parts || [];
  const posParts = (store.data.Transaction_Details || []).filter((d) => d.itemType === 'sparepart' && !d.fromWorkOrder);
  container.innerHTML = `
    <div class="grid-2" style="align-items:start;">
      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Pemakaian Sparepart di Work Order</h3></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${woParts
            .map((p) => {
              const wo = store.data.Work_Orders.find((w) => w.id === p.workOrderId);
              return `
                <div class="entity-card">
                  <div class="entity-card-top">
                    <div>
                      <div style="font-weight:700;">${esc(p.namaSparepart)} x${p.qty}</div>
                      <div class="meta-line mono">${esc(wo?.noWo || p.workOrderId)} · ${esc(p.sku)}</div>
                    </div>
                    <span class="status-tag ${p.stockDeducted ? 'status-green' : 'status-amber'}">${p.stockDeducted ? 'Terpotong' : 'Menunggu'}</span>
                  </div>
                  <div class="mono" style="font-weight:700;">${formatRupiah(p.subtotal)}</div>
                </div>
              `;
            })
            .join('') || '<div class="empty-state">Belum ada data.</div>'}
        </div>
      </div>

      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Penjualan Langsung POS (Non-WO)</h3></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${posParts
            .map(
              (d) => `
                <div class="entity-card">
                  <div style="display:flex; justify-content:space-between;">
                    <strong style="font-size:13px;">${esc(d.namaItem)} x${d.qty}</strong>
                    <span class="mono" style="font-weight:700;">${formatRupiah(d.subtotal)}</span>
                  </div>
                  <div class="meta-line mono">${formatDateTime(d.createdAt)}</div>
                </div>
              `
            )
            .join('') || '<div class="empty-state">Belum ada penjualan langsung.</div>'}
        </div>
      </div>
    </div>
  `;
}

export function renderMaterialUsages(container) {
  const usages = store.data.Material_Usages || [];
  const wos = store.data.Work_Orders || [];
  const materials = store.data.Materials || [];

  container.innerHTML = `
    <div class="grid-2" style="align-items:start;">
      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Catat Pemakaian Bahan Operasional</h3></div>
        <form id="mat-usage-form">
          <div class="form-group">
            <label class="form-label">Work Order *</label>
            <select class="form-control" id="mu-wo" required>
              ${wos.map((w) => `<option value="${w.id}">${esc(w.noWo)} · ${esc(w.keluhan.slice(0, 40))}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Bahan Operasional *</label>
            <select class="form-control" id="mu-mat" required>
              ${materials.map((m) => `<option value="${m.id}">${esc(m.nama)} (Stok: ${m.stok} ${esc(m.satuan)})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Jumlah Pemakaian Aktual *</label>
            <input class="form-control mono" id="mu-qty" type="number" min="1" value="1" required />
          </div>
          <div class="form-group">
            <label class="form-label">Catatan Pemakaian</label>
            <input class="form-control" id="mu-note" placeholder="Contoh: Pembersihan throttle body" />
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Catat &amp; Kurangi Stok Bahan</button>
        </form>
      </div>

      <div class="m3-card">
        <div class="m3-card-header"><h3 class="m3-card-title">Riwayat Pemakaian Bahan</h3></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${usages
            .map(
              (u) => `
                <div class="entity-card">
                  <div style="display:flex; justify-content:space-between;">
                    <strong>${esc(u.namaBahan)} (${u.qty} ${esc(u.satuan)})</strong>
                    <span class="mono" style="font-weight:700;">${formatRupiah(u.totalBiaya)}</span>
                  </div>
                  <div class="meta-line mono">${esc(u.noWo)} · ${formatDateTime(u.tanggal)}</div>
                  ${u.catatan ? `<div class="meta-line">${esc(u.catatan)}</div>` : ''}
                </div>
              `
            )
            .join('') || '<div class="empty-state">Belum ada catatan pemakaian bahan.</div>'}
        </div>
      </div>
    </div>
  `;

  document.getElementById('mat-usage-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.addWoMaterial(document.getElementById('mu-wo').value, {
        materialId: document.getElementById('mu-mat').value,
        qty: Number(document.getElementById('mu-qty').value || 1),
        catatan: document.getElementById('mu-note').value.trim(),
      });
      await refreshAllData();
      showToast('Pemakaian bahan operasional dicatat & stok dikurangi.', 'success');
      renderMaterialUsages(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

export function renderStockOpname(container) {
  const parts = store.data.Spareparts || [];
  const mats = store.data.Materials || [];

  container.innerHTML = `
    <div class="m3-card" style="max-width:640px;">
      <div class="m3-card-header"><h3 class="m3-card-title">Penyesuaian Stok Opname</h3></div>
      <form id="opname-form">
        <div class="form-group">
          <label class="form-label">Jenis Inventory</label>
          <select class="form-control" id="op-type">
            <option value="sparepart">Sparepart</option>
            <option value="material">Bahan Operasional</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pilih Item</label>
          <select class="form-control" id="op-item">
            ${parts.map((p) => `<option value="${p.id}">${esc(p.nama)} (Stok Sistem: ${p.stok} ${esc(p.satuan)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Jumlah Stok Fisik Aktual</label>
          <input class="form-control mono" id="op-qty" type="number" min="0" required />
        </div>
        <div class="form-group">
          <label class="form-label">Keterangan / Alasan Penyesuaian</label>
          <input class="form-control" id="op-note" placeholder="Contoh: Hasil opname bulanan rak A" required />
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Penyesuaian Stok Opname</button>
      </form>
    </div>
  `;

  document.getElementById('op-type').onchange = (e) => {
    const sel = document.getElementById('op-item');
    const list = e.target.value === 'material' ? mats : parts;
    sel.innerHTML = list
      .map((i) => `<option value="${i.id}">${esc(i.nama)} (Stok Sistem: ${i.stok} ${esc(i.satuan)})</option>`)
      .join('');
  };

  document.getElementById('opname-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.stockOpname({
        itemType: document.getElementById('op-type').value,
        itemId: document.getElementById('op-item').value,
        stokFisik: Number(document.getElementById('op-qty').value || 0),
        keterangan: document.getElementById('op-note').value.trim(),
      });
      await refreshAllData();
      showToast('Stok opname berhasil disimpan ke mutasi stok.', 'success');
      renderStockOpname(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}
