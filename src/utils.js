export function formatRupiah(amount) {
  const num = Number(amount || 0);
  const sign = num < 0 ? '-' : '';
  return `${sign}Rp ${Math.abs(Math.round(num)).toLocaleString('id-ID')}`;
}

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function msIcon(name, extra = '') {
  return `<span class="ms ${extra}" aria-hidden="true">${name}</span>`;
}

export function isAndroidWebView() {
  const ua = navigator.userAgent || '';
  return /; wv\)/i.test(ua) || typeof window.AndroidBridge !== 'undefined';
}

export function isMobileViewport() {
  return window.innerWidth <= 768;
}

export function statusClass(status) {
  const s = String(status || '').toUpperCase();
  if (
    ['LUNAS', 'SELESAI', 'SUDAH DISERAHKAN', 'AKTIF', 'HADIR', 'DITERIMA', 'TERKONFIRMASI', 'DIKONFIRMASI', 'DIBAYAR'].includes(s)
  ) {
    return 'status-green';
  }
  if (
    ['SEDANG DIKERJAKAN', 'SEDANG DIPERIKSA', 'SIAP DIKERJAKAN', 'MENUNGGU PENGUJIAN', 'DIPESAN', 'DALAM ANTREAN'].includes(s)
  ) {
    return 'status-blue';
  }
  if (
    ['DIBATALKAN', 'BELUM_LUNAS', 'GAGAL', 'ALPHA', 'BERAKHIR', 'REVERSAL'].includes(s)
  ) {
    return 'status-red';
  }
  if (
    ['SEBAGIAN', 'SEBAGIAN DITERIMA', 'MENUNGGU_PEMBAYARAN', 'MENUNGGU_KONFIRMASI', 'MENUNGGU PERSETUJUAN PELANGGAN', 'MENUNGGU SPAREPART', 'MENUNGGU PEMERIKSAAN', 'MENUNGGU', 'TERLAMBAT', 'BELUM_DIBAYAR'].includes(s)
  ) {
    return 'status-amber';
  }
  return 'status-gray';
}

export function showToast(message, type = 'info', actionLabel = '', onAction = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `snackbar ${type}`;
  el.innerHTML = `
    <span style="flex:1;">${esc(message)}</span>
    <div style="display:flex; align-items:center; gap:6px;">
      ${actionLabel ? `<button type="button" class="btn-text" id="snack-act" style="color:#FCA5A5; font-weight:700; min-height:32px; padding:0 8px;">${esc(actionLabel)}</button>` : ''}
      <button type="button" id="snack-close" style="background:none;border:none;color:#fff;cursor:pointer;display:inline-flex;padding:4px;" aria-label="Tutup">
        ${msIcon('close', 'ms-sm')}
      </button>
    </div>
  `;
  el.querySelector('#snack-close').onclick = () => el.remove();
  if (actionLabel && typeof onAction === 'function') {
    el.querySelector('#snack-act').onclick = () => {
      el.remove();
      onAction();
    };
  }
  container.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 4000);
}

export function openModal({ title, bodyHtml, footerHtml = '', wide = false, onMount = null }) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
    <div class="sheet-backdrop" id="active-modal-backdrop">
      <div class="sheet-box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="sheet-drag-handle"></div>
        <div class="sheet-head">
          <h3 class="sheet-title">${esc(title)}</h3>
          <button type="button" class="btn-icon" id="modal-close-x" aria-label="Tutup">${msIcon('close')}</button>
        </div>
        <div class="sheet-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="sheet-foot">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  const close = () => {
    root.innerHTML = '';
  };
  document.getElementById('modal-close-x').onclick = close;
  document.getElementById('active-modal-backdrop').onclick = (e) => {
    if (e.target.id === 'active-modal-backdrop') close();
  };
  if (typeof onMount === 'function') {
    onMount({ close, root });
  }
  return close;
}

export function confirmDialog({ title, message, confirmText = 'Ya, Lanjutkan', cancelText = 'Batal', destructive = false, onConfirm }) {
  openModal({
    title,
    bodyHtml: `<p style="margin:0; color:var(--text-secondary); font-size:14px;">${esc(message)}</p>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="cd-cancel">${esc(cancelText)}</button>
      <button type="button" class="btn ${destructive ? 'btn-destructive' : 'btn-primary'}" id="cd-ok">${esc(confirmText)}</button>
    `,
    onMount: ({ close }) => {
      document.getElementById('cd-cancel').onclick = close;
      document.getElementById('cd-ok').onclick = async () => {
        const btn = document.getElementById('cd-ok');
        btn.disabled = true;
        try {
          await onConfirm();
          close();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    },
  });
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

export function downloadCSV(filename, headers, rows) {
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(r.map(csvEscape).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(filename, blob);
}

export function downloadExcel(filename, title, headers, rows) {
  const ths = headers.map((h) => `<th style="background:#111317;color:#fff;padding:6px 10px;border:1px solid #cbd5e1">${esc(h)}</th>`).join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="padding:6px 10px;border:1px solid #cbd5e1">${esc(c)}</td>`).join('')}</tr>`
    )
    .join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8" /></head>
      <body>
        <h3>BENGKEL MOTOR — ${esc(title)}</h3>
        <table border="1" cellspacing="0" cellpadding="4">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(filename.endsWith('.xls') ? filename : `${filename}.xls`, blob);
}

export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8;') {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

export function printDocumentHtml(html) {
  const area = document.getElementById('print-area');
  if (!area) return;
  area.innerHTML = html;
  setTimeout(() => {
    window.print();
  }, 120);
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

export function generateQrisSvg(refText) {
  const seed = String(refText || 'BENGKEL-MOTOR-QRIS');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const size = 21;
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inFinder =
        (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      let on = false;
      if (inFinder) {
        const fx = x >= size - 7 ? x - (size - 7) : x;
        const fy = y >= size - 7 ? y - (size - 7) : y;
        on =
          fx === 0 ||
          fx === 6 ||
          fy === 0 ||
          fy === 6 ||
          (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
      } else {
        on = ((hash ^ (x * 73856093) ^ (y * 19349663)) & 3) === 0;
      }
      if (on) {
        cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#111317"/>`);
      }
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="156" height="156" style="background:#fff;padding:8px;border:1px solid #cbd5e1;border-radius:12px">${cells.join('')}</svg>`;
}

export function paginate(items, page, pageSize = 10) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}

export function renderPaginationHtml(pageInfo, idPrefix = 'pg') {
  if (pageInfo.total === 0) return '';
  return `
    <div class="pagination-bar">
      <span class="tabular">Hal. ${pageInfo.page} dari ${pageInfo.totalPages} (${pageInfo.total} data)</span>
      <div class="pagination-btns">
        <button type="button" class="btn btn-outlined btn-sm" data-pg-prev="${idPrefix}" ${pageInfo.page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
        <button type="button" class="btn btn-outlined btn-sm" data-pg-next="${idPrefix}" ${pageInfo.page >= pageInfo.totalPages ? 'disabled' : ''}>Berikutnya</button>
      </div>
    </div>
  `;
}
