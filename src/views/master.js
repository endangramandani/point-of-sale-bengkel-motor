import { store, refreshAllData, getCustomer, getVehicle, hasRole } from '../state.js';
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
  paginate,
  renderPaginationHtml,
} from '../utils.js';

let srvFilter = { search: '', cat: 'ALL', page: 1, selectedIds: [] };

export function renderServicesCatalog(container, onNavigate) {
  const all = store.data.Services || [];
  const cats = store.data.Service_Categories || [];
  const isCustomer = store.roleCode === 'PELANGGAN';
  const canEdit = hasRole('SUPER_ADMIN', 'ADMIN', 'OWNER');
  const q = srvFilter.search.toLowerCase();
  const filtered = all.filter((s) => {
    const matchText =
      String(s.nama || '').toLowerCase().includes(q) ||
      String(s.kode || '').toLowerCase().includes(q);
    const matchCat = srvFilter.cat === 'ALL' || s.categoryId === srvFilter.cat;
    const matchActive = isCustomer ? s.statusAktif !== false : true;
    return matchText && matchCat && matchActive;
  });
  const paged = paginate(filtered, srvFilter.page, 12);
  const selectedServices = all.filter((s) => srvFilter.selectedIds.includes(s.id));
  const selectedTotal = selectedServices.reduce((sum, s) => sum + Number(s.hargaJasa || 0), 0);

  const serviceTabsHtml =
    !isCustomer && onNavigate
      ? `
        <div class="m3-tabs" id="srv-top-tabs">
          <button type="button" class="m3-tab-btn" data-srv-nav="work-order">Work Order</button>
          ${hasRole('SUPER_ADMIN', 'ADMIN', 'KASIR') ? `<button type="button" class="m3-tab-btn" data-srv-nav="penerimaan">Servis Baru</button>` : ''}
          <button type="button" class="m3-tab-btn active" data-srv-nav="layanan">Layanan Servis</button>
        </div>
      `
      : '';

  container.innerHTML = `
    ${serviceTabsHtml}

    ${
      canEdit
        ? `
          <div class="m3-card-dark" style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
              <div>
                <div style="font-size:12px; color:#94A3B8; font-weight:600;">Katalog Jasa &amp; Layanan Servis</div>
                <div class="mono" style="font-size:20px; font-weight:800; margin-top:2px;">${all.length} Layanan Terdaftar</div>
              </div>
              <button type="button" class="btn btn-primary" id="srv-add-btn">
                ${msIcon('add', 'ms-sm')}
                <span>Tambah Service Baru</span>
              </button>
            </div>
          </div>
        `
        : ''
    }

    <div style="margin-bottom:12px;">
      <div class="search-box" style="margin-bottom:10px;">
        ${msIcon('search')}
        <input class="form-control" id="srv-search" type="search" placeholder="Cari layanan atau kode..." value="${esc(srvFilter.search)}" />
      </div>
      <div class="chip-scroller">
        <button type="button" class="m3-chip ${srvFilter.cat === 'ALL' ? 'active' : ''}" data-srv-cat="ALL">Semua Kategori</button>
        ${cats
          .map(
            (c) =>
              `<button type="button" class="m3-chip ${srvFilter.cat === c.id ? 'active' : ''}" data-srv-cat="${c.id}">${esc(c.nama)}</button>`
          )
          .join('')}
      </div>
    </div>

    ${
      isCustomer
        ? `<div class="m3-card" style="margin-bottom:12px; padding:12px 14px; background:#F8FAFC; border:1px dashed var(--border-color);">
            <div style="font-weight:700; font-size:13px;">Pilih Layanan untuk Melihat Harga</div>
            <div class="meta-line">Tap tombol <strong>Pilih Layanan</strong> pada servis yang Anda butuhkan untuk melihat rincian harga dan melanjutkan booking.</div>
          </div>`
        : ''
    }

    ${
      paged.rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada layanan ditemukan.</div>`
        : `<div class="card-list">
            ${paged.rows
              .map((s) => {
                const isPicked = srvFilter.selectedIds.includes(s.id);
                return `
                  <div class="entity-card" style="${isCustomer && isPicked ? 'border-color:var(--accent-red); box-shadow:0 0 0 1px var(--accent-red);' : ''}">
                    <div class="entity-card-top">
                      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        ${
                          s.foto
                            ? `<img class="thumb-img" src="${esc(s.foto)}" alt="${esc(s.nama)}" />`
                            : `<div class="thumb-fallback" style="background:#FEF2F2; color:var(--accent-red);">${msIcon('home_repair_service', 'ms-sm')}</div>`
                        }
                        <div style="min-width:0;">
                          <div style="font-weight:700; font-size:14px;">${esc(s.nama)}</div>
                          <div class="meta-line mono">${esc(s.kode)} · ${esc(s.categoryName || 'Umum')} · ${s.estimasiMenit} mnt</div>
                        </div>
                      </div>
                      <span class="status-tag ${s.statusAktif !== false ? 'status-green' : 'status-gray'}">${s.statusAktif !== false ? 'Aktif' : 'Nonaktif'}</span>
                    </div>
                    <div class="meta-line">${esc(s.deskripsi || 'Layanan servis standar bengkel')}</div>
                    ${
                      !isCustomer || isPicked
                        ? `
                          <div style="display:flex; justify-content:space-between; font-size:12px; padding:8px 10px; background:#FEF2F2; border-radius:10px;">
                            <span>Harga Standar: <strong class="mono" style="color:var(--accent-red);">${formatRupiah(s.hargaJasa)}</strong></span>
                            <span>Motor Sport: <strong class="mono">${formatRupiah(s.hargaMotorSport || s.hargaJasa)}</strong></span>
                          </div>
                        `
                        : `<div class="meta-line" style="font-style:italic;">Pilih layanan ini untuk menampilkan harga.</div>`
                    }
                    ${
                      isCustomer
                        ? `
                          <div class="entity-card-actions">
                            <button type="button" class="btn ${isPicked ? 'btn-primary' : 'btn-outlined'} btn-sm" style="width:100%;" data-pick-cust-srv="${s.id}">
                              ${msIcon(isPicked ? 'check_circle' : 'add_circle_outline', 'ms-sm')}
                              <span>${isPicked ? 'Dipilih (Batalkan)' : 'Pilih Layanan'}</span>
                            </button>
                          </div>
                        `
                        : canEdit
                        ? `<div class="entity-card-actions"><span class="meta-line" style="flex:1;">Komisi ${s.komisiNilai || 0}%</span><button type="button" class="btn btn-outlined btn-sm" data-edit-srv="${s.id}">Edit Layanan</button></div>`
                        : ''
                    }
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    ${
      isCustomer && selectedServices.length > 0
        ? `
          <div class="m3-card-dark" style="margin-top:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <div>
                <div style="font-size:12px; color:#94A3B8;">${selectedServices.length} Layanan Dipilih</div>
                <div class="mono" style="font-size:20px; font-weight:800;">Estimasi Total: ${formatRupiah(selectedTotal)}</div>
                <div class="meta-line" style="color:#CBD5E1;">${selectedServices.map((s) => esc(s.nama)).join(', ')}</div>
              </div>
              <button type="button" class="btn btn-primary" id="srv-cust-book-btn">
                ${msIcon('event_available', 'ms-sm')}
                <span>Booking Sekarang</span>
              </button>
            </div>
          </div>
        `
        : ''
    }

    ${renderPaginationHtml(paged, 'srv')}
  `;

  if (onNavigate) {
    container.querySelectorAll('#srv-top-tabs [data-srv-nav]').forEach((b) =>
      b.addEventListener('click', () => onNavigate(b.dataset.srvNav))
    );
  }

  document.getElementById('srv-search').oninput = (e) => {
    srvFilter.search = e.target.value;
    srvFilter.page = 1;
    renderServicesCatalog(container, onNavigate);
    const inp = document.getElementById('srv-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  };
  container.querySelectorAll('[data-srv-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      srvFilter.cat = b.dataset.srvCat;
      srvFilter.page = 1;
      renderServicesCatalog(container, onNavigate);
    })
  );
  container.querySelectorAll('[data-pick-cust-srv]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.pickCustSrv;
      if (srvFilter.selectedIds.includes(id)) {
        srvFilter.selectedIds = srvFilter.selectedIds.filter((x) => x !== id);
      } else {
        srvFilter.selectedIds = [...srvFilter.selectedIds, id];
      }
      renderServicesCatalog(container, onNavigate);
    })
  );
  document.getElementById('srv-cust-book-btn')?.addEventListener('click', () => {
    store.pageStates.bookingServiceIds = [...srvFilter.selectedIds];
    if (onNavigate) onNavigate('reservasi');
  });
  document.getElementById('srv-add-btn')?.addEventListener('click', () =>
    openServiceModal(null, () => {
      srvFilter.cat = 'ALL';
      srvFilter.search = '';
      srvFilter.page = 1;
      renderServicesCatalog(container, onNavigate);
    })
  );
  container.querySelectorAll('[data-edit-srv]').forEach((b) =>
    b.addEventListener('click', () => {
      const srv = all.find((x) => x.id === b.dataset.editSrv);
      openServiceModal(srv, () => renderServicesCatalog(container, onNavigate));
    })
  );
  container.querySelector('[data-pg-prev]')?.addEventListener('click', () => {
    srvFilter.page -= 1;
    renderServicesCatalog(container, onNavigate);
  });
  container.querySelector('[data-pg-next]')?.addEventListener('click', () => {
    srvFilter.page += 1;
    renderServicesCatalog(container, onNavigate);
  });
}

function openServiceModal(srv, onDone) {
  const cats = store.data.Service_Categories || [];
  let foto = srv?.foto || '';
  openModal({
    title: srv ? `Edit Layanan — ${srv.nama}` : 'Tambah Service / Layanan Baru',
    bodyHtml: `
      <form id="srv-modal-form">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nama Service / Layanan *</label>
            <input class="form-control" id="sm-nama" value="${esc(srv?.nama || '')}" placeholder="Contoh: Ganti Oli Mesin" required />
          </div>
          <div class="form-group">
            <label class="form-label">Kategori *</label>
            <select class="form-control" id="sm-cat">
              ${
                cats.length > 0
                  ? cats.map((c) => `<option value="${c.id}" ${srv?.categoryId === c.id ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')
                  : `<option value="umum">Umum</option>`
              }
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Harga Jasa Standar (Rp) *</label>
            <input class="form-control mono" id="sm-harga" type="number" min="0" value="${srv?.hargaJasa ?? 50000}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Harga Motor Sport / 250cc+ (Rp)</label>
            <input class="form-control mono" id="sm-sport" type="number" min="0" value="${srv?.hargaMotorSport ?? 75000}" />
          </div>
          <div class="form-group">
            <label class="form-label">Estimasi Durasi (Menit)</label>
            <input class="form-control mono" id="sm-durasi" type="number" min="1" value="${srv?.estimasiMenit ?? 30}" />
          </div>
          <div class="form-group">
            <label class="form-label">Komisi Mekanik (%)</label>
            <input class="form-control mono" id="sm-komisi" type="number" min="0" max="100" value="${srv?.komisiNilai ?? 30}" />
          </div>
          <div class="form-group full">
            <label class="form-label">Deskripsi Pekerjaan</label>
            <textarea class="form-control" id="sm-desc" placeholder="Deskripsi detail pengerjaan layanan...">${esc(srv?.deskripsi || '')}</textarea>
          </div>
          <div class="form-group full">
            <label class="form-label">Gambar / Foto Layanan (Opsional)</label>
            <input class="form-control" id="sm-foto" type="file" accept="image/jpeg,image/png,image/webp" />
          </div>
          <div class="form-group full" id="sm-preview-wrap" style="display:${foto ? 'block' : 'none'};">
            <img id="sm-preview" src="${esc(foto)}" alt="Preview Layanan" style="max-height:120px; border-radius:10px; border:1px solid var(--border-color);" />
          </div>
          <div class="form-group full">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="sm-aktif" ${srv?.statusAktif !== false ? 'checked' : ''} />
              <span>Layanan Aktif</span>
            </label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" id="sm-submit-btn" style="width:100%;">Simpan Layanan</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('sm-foto').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const d = await readFileAsDataUrl(f);
          const up = await api.upload(d, f.name);
          foto = up.url;
          const wrap = document.getElementById('sm-preview-wrap');
          const img = document.getElementById('sm-preview');
          if (wrap && img) {
            img.src = foto;
            wrap.style.display = 'block';
          }
          showToast('Foto layanan diunggah.', 'success');
        } catch (err) {
          e.target.value = '';
          showToast(err.message || 'Gagal mengunggah foto.', 'error');
        }
      };
      document.getElementById('srv-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const nama = document.getElementById('sm-nama').value.trim();
        if (!nama) {
          showToast('Nama service / layanan wajib diisi.', 'warning');
          return;
        }
        const submitBtn = document.getElementById('sm-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        const catId = document.getElementById('sm-cat').value;
        const cat = cats.find((c) => c.id === catId);
        const payload = {
          nama,
          categoryId: catId,
          categoryName: cat?.nama || 'Umum',
          hargaJasa: Number(document.getElementById('sm-harga').value || 0),
          hargaMotorSport: Number(document.getElementById('sm-sport').value || 0),
          estimasiMenit: Math.max(1, Number(document.getElementById('sm-durasi').value || 30)),
          komisiTipe: 'PERSEN',
          komisiNilai: Number(document.getElementById('sm-komisi').value || 30),
          deskripsi: document.getElementById('sm-desc').value.trim(),
          foto,
          statusAktif: document.getElementById('sm-aktif').checked,
        };
        try {
          if (srv) await api.updateRow('Services', srv.id, payload);
          else await api.createRow('Services', payload);
          await refreshAllData();
          close();
          showToast('Data layanan servis disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
          if (submitBtn) submitBtn.disabled = false;
        }
      };
    },
  });
}

let custSearch = '';
export function renderCustomers(container) {
  const all = store.data.Customers || [];
  const canEdit = hasRole('ADMIN', 'KASIR');
  const q = custSearch.toLowerCase();
  const rows = all.filter(
    (c) =>
      c.nama.toLowerCase().includes(q) ||
      (c.noWa || '').toLowerCase().includes(q) ||
      (c.kode || '').toLowerCase().includes(q)
  );

  container.innerHTML = `
    <div class="search-box" style="margin-bottom:12px;">
      ${msIcon('search')}
      <input class="form-control" id="cust-search" type="search" placeholder="Cari nama, kode, WhatsApp..." value="${esc(custSearch)}" />
    </div>

    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada pelanggan ditemukan.</div>`
        : `<div class="card-list">
            ${rows
              .map((c) => {
                const vehCount = (store.data.Vehicles || []).filter((v) => v.customerId === c.id).length;
                const visits = (store.data.Service_Orders || []).filter((s) => s.customerId === c.id).length;
                const trxs = (store.data.Transactions || []).filter(
                  (t) => t.customerId === c.id && t.statusPembayaran !== 'DIBATALKAN'
                );
                const spend = trxs.reduce((s, t) => s + Number(t.total || 0), 0);
                const initials = c.nama
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() || '')
                  .join('');
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div style="display:flex; align-items:center; gap:10px;">
                        <div class="thumb-fallback" style="border-radius:50%; background:var(--bg-charcoal); color:#fff;">${esc(initials)}</div>
                        <div>
                          <div style="font-weight:700; font-size:14px;">${esc(c.nama)}</div>
                          <div class="meta-line mono">${esc(c.kode)} · ${esc(c.noWa)}</div>
                        </div>
                      </div>
                      <span class="status-tag status-blue">${vehCount} Motor</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                      <span>Kunjungan: <strong class="mono">${visits}x</strong></span>
                      <span>Total Belanja: <strong class="mono">${formatRupiah(spend)}</strong></span>
                    </div>
                    <div class="entity-card-actions">
                      <button type="button" class="btn btn-dark btn-sm" data-detail-cust="${c.id}">Detail</button>
                      ${
                        canEdit
                          ? `<button type="button" class="btn btn-outlined btn-sm" data-edit-cust="${c.id}">Edit</button>`
                          : ''
                      }
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    ${canEdit ? `<button type="button" class="fab" id="cust-add-btn">${msIcon('person_add')}<span>Pelanggan</span></button>` : ''}
  `;

  document.getElementById('cust-search').oninput = (e) => {
    custSearch = e.target.value;
    renderCustomers(container);
  };
  document.getElementById('cust-add-btn')?.addEventListener('click', () => openCustomerModal(null, () => renderCustomers(container)));
  container.querySelectorAll('[data-edit-cust]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = all.find((x) => x.id === b.dataset.editCust);
      openCustomerModal(c, () => renderCustomers(container));
    })
  );
  container.querySelectorAll('[data-detail-cust]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = all.find((x) => x.id === b.dataset.detailCust);
      if (c) openCustomerDetailModal(c);
    })
  );
}

function openCustomerDetailModal(cust) {
  const vehs = (store.data.Vehicles || []).filter((v) => v.customerId === cust.id);
  const srvHist = (store.data.Service_History || []).filter((h) => h.customerId === cust.id);
  const trxs = (store.data.Transactions || []).filter((t) => t.customerId === cust.id);
  const warranties = (store.data.Warranties || []).filter((g) => g.customerId === cust.id);

  let activeTab = 'profil';
  const renderTab = () => {
    if (activeTab === 'profil') {
      return `
        <div class="entity-card">
          <div><strong>Kode:</strong> <span class="mono">${esc(cust.kode)}</span></div>
          <div><strong>WhatsApp:</strong> <span class="mono">${esc(cust.noWa)}</span></div>
          <div><strong>Alamat:</strong> ${esc(cust.alamat || '-')}</div>
          <div><strong>Bergabung:</strong> ${formatDate(cust.tanggalBergabung)}</div>
        </div>
      `;
    }
    if (activeTab === 'kendaraan') {
      return vehs.length === 0
        ? `<div class="empty-state">Belum ada kendaraan terdaftar.</div>`
        : vehs
            .map(
              (v) => `
                <div class="entity-card" style="margin-bottom:8px;">
                  <div class="mono" style="font-weight:700;">${esc(v.noPolisi)} · ${esc(v.merek)} ${esc(v.model)}</div>
                  <div class="meta-line">Tahun ${v.tahun} · Warna ${esc(v.warna)} · ${Number(v.kilometerTerakhir || 0).toLocaleString('id-ID')} km</div>
                </div>
              `
            )
            .join('');
    }
    if (activeTab === 'servis') {
      return srvHist.length === 0
        ? `<div class="empty-state">Belum ada riwayat servis.</div>`
        : srvHist
            .map(
              (h) => `
                <div class="entity-card" style="margin-bottom:8px;">
                  <div style="display:flex; justify-content:space-between;">
                    <strong class="mono">${esc(h.noWo)}</strong>
                    <span class="mono">${formatRupiah(h.totalBiaya)}</span>
                  </div>
                  <div class="meta-line">${formatDateTime(h.tanggal)} · ${esc(h.tindakan)}</div>
                </div>
              `
            )
            .join('');
    }
    if (activeTab === 'transaksi') {
      return trxs.length === 0
        ? `<div class="empty-state">Belum ada transaksi.</div>`
        : trxs
            .map(
              (t) => `
                <div class="entity-card" style="margin-bottom:8px;">
                  <div style="display:flex; justify-content:space-between;">
                    <strong class="mono">${esc(t.noTransaksi)}</strong>
                    <span class="status-tag ${statusClass(t.statusPembayaran)}">${esc(t.statusPembayaran)}</span>
                  </div>
                  <div class="meta-line">${formatDateTime(t.tanggal)} · ${esc(t.metodePembayaran)} · <strong class="mono">${formatRupiah(t.total)}</strong></div>
                </div>
              `
            )
            .join('');
    }
    if (activeTab === 'garansi') {
      return warranties.length === 0
        ? `<div class="empty-state">Belum ada data garansi.</div>`
        : warranties
            .map(
              (g) => `
                <div class="entity-card" style="margin-bottom:8px;">
                  <div style="display:flex; justify-content:space-between;">
                    <strong class="mono">${esc(g.noGaransi)}</strong>
                    <span class="status-tag ${statusClass(g.status)}">${esc(g.status)}</span>
                  </div>
                  <div class="meta-line">${esc(g.itemDijamin)} · s/d ${formatDate(g.tanggalBerakhir)}</div>
                </div>
              `
            )
            .join('');
    }
    return `<div class="entity-card">${esc(cust.catatan || 'Tidak ada catatan khusus pelanggan.')}</div>`;
  };

  openModal({
    title: `Detail Pelanggan — ${cust.nama}`,
    wide: true,
    bodyHtml: `
      <div class="m3-tabs" id="cust-detail-tabs">
        <button type="button" class="m3-tab-btn active" data-ct="profil">Profil</button>
        <button type="button" class="m3-tab-btn" data-ct="kendaraan">Kendaraan (${vehs.length})</button>
        <button type="button" class="m3-tab-btn" data-ct="servis">Riwayat Servis</button>
        <button type="button" class="m3-tab-btn" data-ct="transaksi">Transaksi</button>
        <button type="button" class="m3-tab-btn" data-ct="garansi">Garansi</button>
        <button type="button" class="m3-tab-btn" data-ct="catatan">Catatan</button>
      </div>
      <div id="cust-detail-body">${renderTab()}</div>
    `,
    onMount: () => {
      document.querySelectorAll('#cust-detail-tabs [data-ct]').forEach((b) =>
        b.addEventListener('click', () => {
          activeTab = b.dataset.ct;
          document.querySelectorAll('#cust-detail-tabs .m3-tab-btn').forEach((t) => t.classList.remove('active'));
          b.classList.add('active');
          document.getElementById('cust-detail-body').innerHTML = renderTab();
        })
      );
    },
  });
}

function openCustomerModal(cust, onDone) {
  openModal({
    title: cust ? `Edit Pelanggan — ${cust.nama}` : 'Tambah Pelanggan Baru',
    bodyHtml: `
      <form id="cust-modal-form">
        <div class="form-group"><label class="form-label">Nama Lengkap *</label><input class="form-control" id="cm-nama" value="${esc(cust?.nama || '')}" required /></div>
        <div class="form-group"><label class="form-label">Nomor WhatsApp *</label><input class="form-control mono" id="cm-wa" value="${esc(cust?.noWa || '')}" placeholder="62812..." required /></div>
        <div class="form-group"><label class="form-label">Alamat</label><input class="form-control" id="cm-alamat" value="${esc(cust?.alamat || '')}" /></div>
        <div class="form-group"><label class="form-label">Catatan Pelanggan</label><textarea class="form-control" id="cm-catatan">${esc(cust?.catatan || '')}</textarea></div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pelanggan</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('cust-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          nama: document.getElementById('cm-nama').value.trim(),
          noWa: document.getElementById('cm-wa').value.trim(),
          alamat: document.getElementById('cm-alamat').value.trim(),
          catatan: document.getElementById('cm-catatan').value.trim(),
        };
        try {
          if (cust) await api.updateRow('Customers', cust.id, payload);
          else await api.createRow('Customers', payload);
          await refreshAllData();
          close();
          showToast('Data pelanggan disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

let vehSearch = '';
export function renderVehicles(container) {
  const all = store.data.Vehicles || [];
  const customers = store.data.Customers || [];
  const canEdit = hasRole('ADMIN', 'KASIR', 'PELANGGAN');
  const q = vehSearch.toLowerCase();
  const rows = all.filter((v) => {
    const c = getCustomer(v.customerId);
    return (
      v.noPolisi.toLowerCase().includes(q) ||
      v.merek.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      (c?.nama || '').toLowerCase().includes(q)
    );
  });

  container.innerHTML = `
    <div class="search-box" style="margin-bottom:12px;">
      ${msIcon('search')}
      <input class="form-control" id="veh-search" type="search" placeholder="Cari No. Polisi, Merek, Model, Pemilik..." value="${esc(vehSearch)}" />
    </div>

    ${
      rows.length === 0
        ? `<div class="m3-card empty-state">Tidak ada kendaraan ditemukan.</div>`
        : `<div class="card-list">
            ${rows
              .map((v) => {
                const c = getCustomer(v.customerId);
                return `
                  <div class="entity-card">
                    <div class="entity-card-top">
                      <div>
                        <div class="mono" style="font-weight:800; font-size:15px;">${esc(v.noPolisi)}</div>
                        <div style="font-weight:600; font-size:13px;">${esc(v.merek)} ${esc(v.model)} (${v.tahun})</div>
                      </div>
                      <span class="status-tag status-gray">${Number(v.kilometerTerakhir || 0).toLocaleString('id-ID')} km</span>
                    </div>
                    <div class="meta-line">
                      <div>Pemilik: <strong>${esc(c?.nama || '-')}</strong> · Warna: ${esc(v.warna)}</div>
                      <div class="mono">Rangka: ${esc(v.noRangka || '-')} · Mesin: ${esc(v.noMesin || '-')}</div>
                    </div>
                    ${
                      canEdit
                        ? `<div class="entity-card-actions"><button type="button" class="btn btn-outlined btn-sm" data-edit-veh="${v.id}">Edit Kendaraan</button></div>`
                        : ''
                    }
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    ${canEdit ? `<button type="button" class="fab" id="veh-add-btn">${msIcon('add')}<span>Kendaraan</span></button>` : ''}
  `;

  document.getElementById('veh-search').oninput = (e) => {
    vehSearch = e.target.value;
    renderVehicles(container);
  };
  document.getElementById('veh-add-btn')?.addEventListener('click', () => openVehicleModal(null, customers, () => renderVehicles(container)));
  container.querySelectorAll('[data-edit-veh]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = all.find((x) => x.id === b.dataset.editVeh);
      openVehicleModal(v, customers, () => renderVehicles(container));
    })
  );
}

function openVehicleModal(veh, customers, onDone) {
  openModal({
    title: veh ? `Edit Kendaraan — ${veh.noPolisi}` : 'Tambah Kendaraan Baru',
    bodyHtml: `
      <form id="veh-modal-form">
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label">Pemilik (Pelanggan) *</label>
            <select class="form-control" id="vm-cust" ${store.roleCode === 'PELANGGAN' ? 'disabled' : ''}>
              ${customers.map((c) => `<option value="${c.id}" ${veh?.customerId === c.id ? 'selected' : ''}>${esc(c.nama)} (${esc(c.noWa)})</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Nomor Polisi *</label><input class="form-control mono" id="vm-nopol" value="${esc(veh?.noPolisi || '')}" required /></div>
          <div class="form-group"><label class="form-label">Merek *</label><input class="form-control" id="vm-merek" value="${esc(veh?.merek || '')}" required /></div>
          <div class="form-group"><label class="form-label">Model / Tipe *</label><input class="form-control" id="vm-model" value="${esc(veh?.model || '')}" required /></div>
          <div class="form-group"><label class="form-label">Tahun</label><input class="form-control mono" id="vm-tahun" type="number" value="${veh?.tahun || 2024}" /></div>
          <div class="form-group"><label class="form-label">Warna</label><input class="form-control" id="vm-warna" value="${esc(veh?.warna || '')}" /></div>
          <div class="form-group"><label class="form-label">Kilometer Terakhir</label><input class="form-control mono" id="vm-km" type="number" value="${veh?.kilometerTerakhir || 0}" /></div>
          <div class="form-group"><label class="form-label">Nomor Rangka</label><input class="form-control mono" id="vm-rangka" value="${esc(veh?.noRangka || '')}" /></div>
          <div class="form-group"><label class="form-label">Nomor Mesin</label><input class="form-control mono" id="vm-mesin" value="${esc(veh?.noMesin || '')}" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Kendaraan</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('veh-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          customerId: document.getElementById('vm-cust').value,
          noPolisi: document.getElementById('vm-nopol').value.trim().toUpperCase(),
          merek: document.getElementById('vm-merek').value.trim(),
          model: document.getElementById('vm-model').value.trim(),
          tahun: Number(document.getElementById('vm-tahun').value || 2024),
          warna: document.getElementById('vm-warna').value.trim(),
          kilometerTerakhir: Number(document.getElementById('vm-km').value || 0),
          noRangka: document.getElementById('vm-rangka').value.trim().toUpperCase(),
          noMesin: document.getElementById('vm-mesin').value.trim().toUpperCase(),
        };
        try {
          if (veh) await api.updateRow('Vehicles', veh.id, payload);
          else await api.createRow('Vehicles', payload);
          await refreshAllData();
          close();
          showToast('Data kendaraan disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}

export function renderEmployees(container) {
  const rows = store.data.Employees || [];
  const canEdit = hasRole('ADMIN', 'OWNER');
  const commissions = store.data.Commissions || [];
  const wos = store.data.Work_Orders || [];

  container.innerHTML = `
    <div class="card-list">
      ${rows
        .map((e) => {
          const myComs = commissions.filter((c) => c.mechanicId === e.id);
          const totalCom = myComs.reduce((s, c) => s + Number(c.nominalKomisi || 0), 0);
          const activeJobs = wos.filter((w) => w.mechanicId === e.id && !['Selesai', 'Sudah diserahkan', 'Dibatalkan'].includes(w.status)).length;
          const doneJobs = wos.filter((w) => w.mechanicId === e.id && ['Selesai', 'Sudah diserahkan'].includes(w.status)).length;
          return `
            <div class="entity-card">
              <div class="entity-card-top">
                <div style="display:flex; align-items:center; gap:12px;">
                  ${
                    e.foto
                      ? `<img class="thumb-img" src="${esc(e.foto)}" alt="${esc(e.nama)}" />`
                      : `<div class="thumb-fallback" style="background:var(--bg-charcoal); color:#fff;">${esc(e.nama.slice(0, 2).toUpperCase())}</div>`
                  }
                  <div>
                    <div style="font-weight:700; font-size:14px;">${esc(e.nama)}</div>
                    <div class="meta-line">${esc(e.jabatan)} · ${esc(e.keahlian || '-')}</div>
                  </div>
                </div>
                <span class="status-tag ${e.statusAktif ? 'status-green' : 'status-gray'}">${e.statusAktif ? 'Aktif' : 'Nonaktif'}</span>
              </div>

              <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; text-align:center; background:var(--bg-surface-tonal); padding:8px; border-radius:10px;">
                <div><div class="meta-line">Aktif</div><div class="mono" style="font-weight:700;">${activeJobs}</div></div>
                <div><div class="meta-line">Selesai</div><div class="mono" style="font-weight:700;">${doneJobs}</div></div>
                <div><div class="meta-line">Komisi</div><div class="mono" style="font-weight:700; color:var(--accent-red);">${formatRupiah(totalCom)}</div></div>
              </div>

              <div class="entity-card-actions">
                <button type="button" class="btn btn-dark btn-sm" data-mech-detail="${e.id}">Detail</button>
                <button type="button" class="btn btn-outlined btn-sm" data-mech-sched="${e.id}">Jadwal</button>
                <button type="button" class="btn btn-outlined btn-sm" data-mech-jobs="${e.id}">Riwayat</button>
                ${canEdit ? `<button type="button" class="btn btn-outlined btn-sm" data-edit-emp="${e.id}">Edit</button>` : ''}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>

    ${canEdit ? `<button type="button" class="fab" id="emp-add-btn">${msIcon('add')}<span>Mekanik</span></button>` : ''}
  `;

  document.getElementById('emp-add-btn')?.addEventListener('click', () => openEmployeeModal(null, () => renderEmployees(container)));
  container.querySelectorAll('[data-edit-emp]').forEach((b) =>
    b.addEventListener('click', () => {
      const emp = rows.find((x) => x.id === b.dataset.editEmp);
      openEmployeeModal(emp, () => renderEmployees(container));
    })
  );
  container.querySelectorAll('[data-mech-detail]').forEach((b) =>
    b.addEventListener('click', () => openEmployeeInfoModal(rows.find((x) => x.id === b.dataset.mechDetail), 'detail'))
  );
  container.querySelectorAll('[data-mech-sched]').forEach((b) =>
    b.addEventListener('click', () => openEmployeeInfoModal(rows.find((x) => x.id === b.dataset.mechSched), 'schedule'))
  );
  container.querySelectorAll('[data-mech-jobs]').forEach((b) =>
    b.addEventListener('click', () => openEmployeeInfoModal(rows.find((x) => x.id === b.dataset.mechJobs), 'jobs'))
  );
}

function openEmployeeInfoModal(emp, mode) {
  if (!emp) return;
  const shifts = (store.data.Shifts || []).filter((s) => s.employeeId === emp.id);
  const wos = (store.data.Work_Orders || []).filter((w) => w.mechanicId === emp.id);
  let title = `Profil Mekanik — ${emp.nama}`;
  let bodyHtml = `
    <div class="entity-card">
      <div><strong>Kode:</strong> <span class="mono">${esc(emp.kode)}</span></div>
      <div><strong>Jabatan &amp; Keahlian:</strong> ${esc(emp.jabatan)} · ${esc(emp.keahlian || '-')}</div>
      <div><strong>No. Telp:</strong> <span class="mono">${esc(emp.noTelp)}</span></div>
      <div><strong>Aturan Komisi:</strong> ${emp.tipeKomisi === 'PERSEN' ? `${emp.nilaiKomisi}%` : formatRupiah(emp.nilaiKomisi)}</div>
      <div><strong>Alamat:</strong> ${esc(emp.alamat || '-')}</div>
    </div>
  `;
  if (mode === 'schedule') {
    title = `Jadwal Kerja — ${emp.nama}`;
    bodyHtml =
      shifts.length === 0
        ? `<div class="empty-state">Belum ada jadwal shift terdaftar untuk mekanik ini.</div>`
        : shifts
            .map(
              (s) => `
                <div class="entity-card" style="margin-bottom:8px;">
                  <div style="font-weight:700;">${esc(s.hari)}</div>
                  <div class="meta-line mono">${esc(s.jamMulai)} - ${esc(s.jamSelesai)} · ${esc(s.area)}</div>
                </div>
              `
            )
            .join('');
  } else if (mode === 'jobs') {
    title = `Riwayat Pekerjaan — ${emp.nama}`;
    bodyHtml =
      wos.length === 0
        ? `<div class="empty-state">Belum ada pekerjaan Work Order untuk mekanik ini.</div>`
        : wos
            .map((w) => {
              const v = getVehicle(w.vehicleId);
              return `
                <div class="entity-card" style="margin-bottom:8px;">
                  <div style="display:flex; justify-content:space-between;">
                    <strong class="mono">${esc(w.noWo)} · ${esc(v?.noPolisi || '-')}</strong>
                    <span class="status-tag ${statusClass(w.status)}">${esc(w.status)}</span>
                  </div>
                  <div class="meta-line">${esc(w.keluhan)}</div>
                </div>
              `;
            })
            .join('');
  }
  openModal({ title, bodyHtml });
}

function openEmployeeModal(emp, onDone) {
  let uploadedPhoto = emp?.foto || '';
  openModal({
    title: emp ? `Edit Pegawai — ${emp.nama}` : 'Tambah Mekanik / Pegawai Baru',
    bodyHtml: `
      <form id="emp-modal-form">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nama Lengkap *</label><input class="form-control" id="em-nama" value="${esc(emp?.nama || '')}" required /></div>
          <div class="form-group"><label class="form-label">Jabatan *</label><input class="form-control" id="em-jabatan" value="${esc(emp?.jabatan || 'Mekanik')}" required /></div>
          <div class="form-group"><label class="form-label">No. Telepon *</label><input class="form-control mono" id="em-telp" value="${esc(emp?.noTelp || '')}" required /></div>
          <div class="form-group"><label class="form-label">Keahlian</label><input class="form-control" id="em-ahli" value="${esc(emp?.keahlian || '')}" /></div>
          <div class="form-group">
            <label class="form-label">Tipe Komisi</label>
            <select class="form-control" id="em-tipe">
              <option value="PERSEN" ${emp?.tipeKomisi === 'PERSEN' ? 'selected' : ''}>Persentase Jasa (%)</option>
              <option value="NOMINAL" ${emp?.tipeKomisi === 'NOMINAL' ? 'selected' : ''}>Nominal Tetap (Rp)</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Nilai Komisi</label><input class="form-control mono" id="em-nilai" type="number" min="0" value="${emp?.nilaiKomisi ?? 25}" /></div>
          <div class="form-group full"><label class="form-label">Alamat</label><input class="form-control" id="em-alamat" value="${esc(emp?.alamat || '')}" /></div>
          <div class="form-group full"><label class="form-label">Foto Profil</label><input class="form-control" id="em-foto" type="file" accept="image/*" /></div>
          <div class="form-group full">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="em-aktif" ${emp?.statusAktif !== false ? 'checked' : ''} />
              <span>Pegawai Aktif</span>
            </label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">Simpan Pegawai</button>
      </form>
    `,
    onMount: ({ close }) => {
      document.getElementById('em-foto').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const d = await readFileAsDataUrl(f);
        const up = await api.upload(d, f.name);
        uploadedPhoto = up.url;
        showToast('Foto berhasil diunggah.', 'success');
      };
      document.getElementById('emp-modal-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          nama: document.getElementById('em-nama').value.trim(),
          jabatan: document.getElementById('em-jabatan').value.trim(),
          noTelp: document.getElementById('em-telp').value.trim(),
          keahlian: document.getElementById('em-ahli').value.trim(),
          tipeKomisi: document.getElementById('em-tipe').value,
          nilaiKomisi: Number(document.getElementById('em-nilai').value || 0),
          alamat: document.getElementById('em-alamat').value.trim(),
          foto: uploadedPhoto,
          statusAktif: document.getElementById('em-aktif').checked,
          tanggalBergabung: emp?.tanggalBergabung || new Date().toISOString().slice(0, 10),
        };
        try {
          if (emp) await api.updateRow('Employees', emp.id, payload);
          else await api.createRow('Employees', payload);
          await refreshAllData();
          close();
          showToast('Data pegawai disimpan.', 'success');
          onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    },
  });
}
