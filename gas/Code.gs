/**
 * ============================================================================
 * BENGKEL MOTOR — Point of Sale & Workshop Management System
 * Backend Google Apps Script (Code.gs)
 * Database: Google Sheets (39 Sheet Terpisah) | Storage: Google Drive
 * ============================================================================
 */

var CONFIG = {
  APP_NAME: 'BENGKEL MOTOR',
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '',
  DRIVE_FOLDER_NAME: 'BENGKEL_MOTOR_FILES',
  SESSION_TTL_SECONDS: 43200 // 12 Jam (CacheService max 21600, kita simpan di ScriptProperties/Cache)
};

// Struktur 39 Sheet Lengkap beserta Header Kolom
var SCHEMA_39_TABLES = {
  Users: ['id', 'username', 'nama', 'email', 'noHp', 'roleId', 'roleName', 'employeeId', 'customerId', 'passwordHash', 'passwordSalt', 'statusAktif', 'lastLogin', 'createdAt'],
  Roles: ['id', 'kode', 'nama', 'deskripsi', 'permissionsJson', 'createdAt'],
  Employees: ['id', 'kode', 'nama', 'jabatan', 'keahlian', 'noTelp', 'alamat', 'foto', 'tanggalBergabung', 'statusAktif', 'tipeKomisi', 'nilaiKomisi', 'createdAt'],
  Customers: ['id', 'kode', 'nama', 'noWa', 'alamat', 'foto', 'tanggalBergabung', 'catatan', 'createdAt'],
  Vehicles: ['id', 'customerId', 'noPolisi', 'merek', 'model', 'tahun', 'warna', 'noRangka', 'noMesin', 'kilometerTerakhir', 'createdAt'],
  Service_Categories: ['id', 'nama', 'deskripsi', 'createdAt'],
  Services: ['id', 'categoryId', 'categoryName', 'kode', 'nama', 'deskripsi', 'foto', 'hargaJasa', 'hargaMotorSport', 'estimasiMenit', 'komisiTipe', 'komisiNilai', 'defaultPartsJson', 'statusAktif', 'createdAt'],
  Suppliers: ['id', 'kode', 'nama', 'perusahaan', 'noTelp', 'email', 'alamat', 'pic', 'createdAt'],
  Spareparts: ['id', 'sku', 'barcode', 'nama', 'merek', 'categoryId', 'categoryName', 'deskripsi', 'kecocokanMotor', 'stok', 'satuan', 'hargaBeli', 'hargaJual', 'supplierId', 'stokMinimum', 'lokasiRak', 'tanggalKedaluwarsa', 'foto', 'statusAktif', 'createdAt'],
  Sparepart_Categories: ['id', 'nama', 'deskripsi', 'createdAt'],
  Materials: ['id', 'kode', 'nama', 'categoryId', 'categoryName', 'deskripsi', 'stok', 'satuan', 'hargaBeli', 'supplierId', 'stokMinimum', 'tanggalKedaluwarsa', 'foto', 'statusAktif', 'createdAt'],
  Material_Categories: ['id', 'nama', 'deskripsi', 'createdAt'],
  Service_Orders: ['id', 'noOrder', 'tanggalMasuk', 'customerId', 'vehicleId', 'kmMasuk', 'keluhan', 'kondisiDiterima', 'bahanBakar', 'barangBawaan', 'fotoKendaraan', 'fotoKerusakan', 'mechanicId', 'estimasiBiaya', 'estimasiSelesai', 'status', 'createdBy', 'createdAt'],
  Work_Orders: ['id', 'noWo', 'serviceOrderId', 'customerId', 'vehicleId', 'mechanicId', 'keluhan', 'hasilPemeriksaan', 'diagnosis', 'catatanMekanik', 'estimasiBiaya', 'estimasiDisetujui', 'tanggalDisetujui', 'estimasiSelesai', 'status', 'riwayatStatusJson', 'billedTransactionId', 'commissionGenerated', 'createdBy', 'createdAt', 'updatedAt'],
  Work_Order_Details: ['id', 'workOrderId', 'serviceId', 'namaLayanan', 'hargaJasa', 'qty', 'subtotal', 'mechanicId', 'komisi', 'status', 'createdAt'],
  Work_Order_Parts: ['id', 'workOrderId', 'sparepartId', 'sku', 'namaSparepart', 'qty', 'hargaBeli', 'hargaJual', 'subtotal', 'dikonfirmasi', 'stockDeducted', 'createdAt'],
  Work_Order_Materials: ['id', 'workOrderId', 'materialId', 'namaBahan', 'qty', 'satuan', 'hargaBeli', 'subtotal', 'createdAt'],
  Service_History: ['id', 'vehicleId', 'customerId', 'workOrderId', 'noWo', 'tanggal', 'kmSaatServis', 'mechanicId', 'mechanicName', 'keluhan', 'diagnosis', 'tindakan', 'sparepartDiganti', 'totalBiaya', 'fotoKendaraan', 'catatanTeknisi', 'createdAt'],
  Purchases: ['id', 'noPembelian', 'tanggal', 'supplierId', 'supplierName', 'diskon', 'total', 'statusPembayaran', 'jumlahDibayar', 'jatuhTempo', 'statusPenerimaan', 'buktiPembelian', 'catatan', 'createdBy', 'createdAt'],
  Purchase_Details: ['id', 'purchaseId', 'itemType', 'itemId', 'namaItem', 'qtyPesan', 'qtyDiterima', 'hargaBeli', 'subtotal', 'createdAt'],
  Stock_Movements: ['id', 'tanggal', 'itemType', 'itemId', 'namaItem', 'tipe', 'qty', 'stokSebelum', 'stokSesudah', 'referensiTipe', 'referensiId', 'keterangan', 'idempotencyKey', 'createdBy', 'createdAt'],
  Material_Usages: ['id', 'tanggal', 'workOrderId', 'noWo', 'materialId', 'namaBahan', 'qty', 'satuan', 'hargaBeli', 'totalBiaya', 'mechanicId', 'catatan', 'createdBy', 'createdAt'],
  Appointments: ['id', 'noBooking', 'customerId', 'vehicleId', 'serviceIdsJson', 'serviceNames', 'tanggalBooking', 'jamBooking', 'mechanicId', 'catatan', 'status', 'createdBy', 'createdAt'],
  Queues: ['id', 'nomorAntrean', 'tanggal', 'appointmentId', 'serviceOrderId', 'workOrderId', 'customerId', 'vehicleId', 'keluhan', 'estimasiTungguMenit', 'status', 'createdAt'],
  Transactions: ['id', 'noTransaksi', 'tanggal', 'customerId', 'vehicleId', 'workOrderId', 'subtotalJasa', 'subtotalSparepart', 'diskon', 'pajakPersen', 'pajakNominal', 'total', 'metodePembayaran', 'qrisMode', 'statusPembayaran', 'uangDiterima', 'kembalian', 'jumlahDibayar', 'sisaPiutang', 'kasirId', 'kasirName', 'idempotencyKey', 'alasanBatal', 'createdAt'],
  Transaction_Details: ['id', 'transactionId', 'itemType', 'itemId', 'namaItem', 'qty', 'hargaSatuan', 'hargaPokok', 'subtotal', 'mechanicId', 'fromWorkOrder', 'createdAt'],
  Payments: ['id', 'transactionId', 'noTransaksi', 'tanggal', 'metode', 'qrisMode', 'qrisRef', 'nominal', 'status', 'verifiedBy', 'verifiedAt', 'idempotencyKey', 'createdAt'],
  Accounts_Payable: ['id', 'purchaseId', 'noPembelian', 'supplierId', 'supplierName', 'totalUtang', 'jumlahDibayar', 'sisaUtang', 'jatuhTempo', 'status', 'createdAt'],
  Payable_Payments: ['id', 'payableId', 'tanggal', 'nominal', 'metode', 'referensi', 'catatan', 'createdBy', 'idempotencyKey', 'createdAt'],
  Accounts_Receivable: ['id', 'transactionId', 'noTransaksi', 'workOrderId', 'customerId', 'customerName', 'vehicleId', 'noPolisi', 'totalPiutang', 'jumlahDibayar', 'sisaPiutang', 'jatuhTempo', 'status', 'createdAt'],
  Receivable_Payments: ['id', 'receivableId', 'tanggal', 'nominal', 'metode', 'qrisMode', 'status', 'catatan', 'createdBy', 'idempotencyKey', 'createdAt'],
  Expenses: ['id', 'tanggal', 'kategori', 'keterangan', 'nominal', 'bukti', 'createdBy', 'createdByName', 'createdAt'],
  Commissions: ['id', 'tanggal', 'mechanicId', 'mechanicName', 'workOrderId', 'noWo', 'transactionId', 'dasarJasa', 'persentaseAtauTipe', 'nominalKomisi', 'status', 'createdAt'],
  Attendance: ['id', 'tanggal', 'employeeId', 'employeeName', 'jamMasuk', 'jamKeluar', 'status', 'catatan', 'createdAt'],
  Shifts: ['id', 'employeeId', 'employeeName', 'hari', 'jamMulai', 'jamSelesai', 'area', 'catatan', 'createdAt'],
  Warranties: ['id', 'noGaransi', 'workOrderId', 'transactionId', 'customerId', 'vehicleId', 'tanggalMulai', 'tanggalBerakhir', 'jenisGaransi', 'itemDijamin', 'syarat', 'status', 'createdAt'],
  Notifications: ['id', 'tanggal', 'tipe', 'judul', 'pesan', 'targetRole', 'referensiTipe', 'referensiId', 'dibaca', 'createdAt'],
  Activity_Logs: ['id', 'tanggal', 'userId', 'userName', 'role', 'aksi', 'modul', 'referensiId', 'detail', 'createdAt'],
  Settings: ['id', 'namaBengkel', 'alamatBengkel', 'teleponBengkel', 'emailBengkel', 'pajakAktif', 'pajakPersen', 'izinkanPembayaranSebagian', 'qrisDinamisApiAktif', 'qrisMerchantId', 'pesanStruk', 'komisiDefaultPersen', 'garansiDefaultHari', 'updatedAt']
};

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('BENGKEL MOTOR — Point of Sale & Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSpreadsheet_() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (ssId) return SpreadsheetApp.openById(ssId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  }
  ss = SpreadsheetApp.create('DATABASE_BENGKEL_MOTOR');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

/**
 * Jalankan fungsi ini SEKALI dari Editor Apps Script untuk membuat seluruh 39 Sheet + Seed Admin
 */
function setupDatabase() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = getSpreadsheet_();
    var sheetNames = Object.keys(SCHEMA_39_TABLES);
    for (var i = 0; i < sheetNames.length; i++) {
      var name = sheetNames[i];
      var cols = SCHEMA_39_TABLES[name];
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(cols);
        sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#111317').setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
      }
    }
    seedInitialRolesAndAdmin_(ss);
    return { ok: true, spreadsheetId: ss.getId(), totalSheets: sheetNames.length };
  } finally {
    lock.releaseLock();
  }
}

function seedInitialRolesAndAdmin_(ss) {
  var now = new Date().toISOString();
  var rolesSheet = ss.getSheetByName('Roles');
  if (rolesSheet.getLastRow() <= 1) {
    var defaultRoles = [
      ['role-superadmin', 'SUPER_ADMIN', 'Super Admin', 'Akses penuh seluruh sistem', '["*"]', now],
      ['role-owner', 'OWNER', 'Owner', 'Laporan keuangan, stok, pembelian, utang-piutang', '["dashboard","reports","finance","inventory"]', now],
      ['role-admin', 'ADMIN', 'Admin', 'Operasional bengkel, servis, master, inventory, pembelian', '["dashboard","service","master","inventory"]', now],
      ['role-kasir', 'KASIR', 'Kasir', 'POS, pembayaran TUNAI/QRIS, tutup kas, antrean', '["dashboard","pos","cash_closing"]', now],
      ['role-mekanik', 'MEKANIK', 'Mekanik', 'Work Order ditugaskan, diagnosis, pemakaian part/bahan, komisi', '["dashboard","work_orders_assigned"]', now],
      ['role-pelanggan', 'PELANGGAN', 'Pelanggan', 'Katalog layanan, booking servis, riwayat kendaraan', '["dashboard","appointments_own"]', now]
    ];
    for (var r = 0; r < defaultRoles.length; r++) rolesSheet.appendRow(defaultRoles[r]);
  }

  var usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() <= 1) {
    var salt = Utilities.getUuid();
    var hash = hashPassword_('bengkel123', salt);
    usersSheet.appendRow([
      Utilities.getUuid(), 'superadmin', 'Arif Nugroho', 'superadmin@bengkelmotor.id', '0811000001',
      'role-superadmin', 'Super Admin', '', '', hash, salt, true, '', now
    ]);
  }

  var settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.appendRow([
      'set-default', 'BENGKEL MOTOR', 'Jl. Panjang Kebon Jeruk No. 108, Jakarta Barat',
      '021-5366-8899', 'halo@bengkelmotor.id', false, 11, true, true,
      'ID1020304050607', 'Terima kasih telah mempercayakan motor Anda di BENGKEL MOTOR.', 30, 14, now
    ]);
  }
}

function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password);
  return raw.map(function (b) {
    var s = (b < 0 ? b + 256 : b).toString(16);
    return s.length === 1 ? '0' + s : s;
  }).join('');
}

function apiLogin(username, password) {
  var ss = getSpreadsheet_();
  var users = readSheetAsObjects_(ss, 'Users');
  var found = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username).toLowerCase() === String(username).trim().toLowerCase()) {
      found = users[i];
      break;
    }
  }
  if (!found || !found.statusAktif) throw new Error('Username tidak ditemukan atau akun nonaktif.');
  if (hashPassword_(password, found.passwordSalt) !== found.passwordHash) {
    throw new Error('Password salah.');
  }
  var token = Utilities.getUuid();
  var roles = readSheetAsObjects_(ss, 'Roles');
  var roleObj = roles.filter(function (r) { return r.id === found.roleId; })[0];
  var sessionObj = { userId: found.id, roleCode: roleObj ? roleObj.kode : 'PELANGGAN', roleName: found.roleName, nama: found.nama, employeeId: found.employeeId, customerId: found.customerId };
  CacheService.getScriptCache().put('SESS_' + token, JSON.stringify(sessionObj), 21600);
  return { token: token, user: sessionObj };
}

function verifySession_(token) {
  if (!token) throw new Error('Sesi tidak valid. Silakan login kembali.');
  var raw = CacheService.getScriptCache().get('SESS_' + token);
  if (!raw) throw new Error('Sesi berakhir. Silakan login ulang.');
  return JSON.parse(raw);
}

/**
 * Upload Foto Kendaraan / Kerusakan / Bukti ke Google Drive
 */
function apiUploadToDrive(token, base64DataUrl, fileName) {
  var sess = verifySession_(token);
  var match = String(base64DataUrl).match(/^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,(.+)$/);
  if (!match) throw new Error('Format file ditolak (hanya JPG, PNG, WEBP, PDF).');
  var mimeType = match[1];
  var bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran file maksimal 5 MB.');

  var folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
  var blob = Utilities.newBlob(bytes, mimeType, fileName || ('upload_' + Date.now()));
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var ss = getSpreadsheet_();
  appendObject_(ss, 'Activity_Logs', {
    id: Utilities.getUuid(), tanggal: new Date().toISOString(), userId: sess.userId,
    userName: sess.nama, role: sess.roleName, aksi: 'UPLOAD_DRIVE', modul: 'Google Drive',
    referensiId: file.getId(), detail: 'Upload file ' + file.getName(), createdAt: new Date().toISOString()
  });

  return { fileId: file.getId(), url: 'https://drive.google.com/uc?export=view&id=' + file.getId(), name: file.getName() };
}

/**
 * Transaksi POS Atomik dengan LockService & Idempotency Key (TUNAI & QRIS saja)
 */
function apiCheckoutPOS(token, payload) {
  var sess = verifySession_(token);
  if (['SUPER_ADMIN', 'ADMIN', 'KASIR'].indexOf(sess.roleCode) === -1) {
    throw new Error('Hak akses ditolak untuk transaksi POS.');
  }
  if (['TUNAI', 'QRIS'].indexOf(payload.metodePembayaran) === -1) {
    throw new Error('Metode pembayaran hanya diizinkan TUNAI atau QRIS.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = getSpreadsheet_();
    var existingTrx = readSheetAsObjects_(ss, 'Transactions');
    for (var k = 0; k < existingTrx.length; k++) {
      if (existingTrx[k].idempotencyKey === payload.idempotencyKey) {
        return { transaction: existingTrx[k], deduplicated: true };
      }
    }

    var now = new Date().toISOString();
    var trxId = Utilities.getUuid();
    var noTrx = 'TRX-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd') + '-' + String(existingTrx.length + 1).padStart(3, '0');
    var statusBayar = payload.metodePembayaran === 'QRIS' ? 'MENUNGGU_PEMBAYARAN' : (Number(payload.uangDiterima) >= Number(payload.total) ? 'LUNAS' : 'SEBAGIAN');

    var trxRow = {
      id: trxId, noTransaksi: noTrx, tanggal: now,
      customerId: payload.customerId || '', vehicleId: payload.vehicleId || '', workOrderId: payload.workOrderId || '',
      subtotalJasa: Number(payload.subtotalJasa || 0), subtotalSparepart: Number(payload.subtotalSparepart || 0),
      diskon: Number(payload.diskon || 0), pajakPersen: Number(payload.pajakPersen || 0), pajakNominal: Number(payload.pajakNominal || 0),
      total: Number(payload.total || 0), metodePembayaran: payload.metodePembayaran, qrisMode: payload.qrisMode || '',
      statusPembayaran: statusBayar, uangDiterima: Number(payload.uangDiterima || 0),
      kembalian: Math.max(0, Number(payload.uangDiterima || 0) - Number(payload.total || 0)),
      jumlahDibayar: statusBayar === 'LUNAS' ? Number(payload.total) : (payload.metodePembayaran === 'TUNAI' ? Number(payload.uangDiterima) : 0),
      sisaPiutang: statusBayar === 'LUNAS' ? 0 : Number(payload.total) - (payload.metodePembayaran === 'TUNAI' ? Number(payload.uangDiterima) : 0),
      kasirId: sess.userId, kasirName: sess.nama, idempotencyKey: payload.idempotencyKey, alasanBatal: '', createdAt: now
    };
    appendObject_(ss, 'Transactions', trxRow);

    // Kurangi stok sparepart non-WO sekali saja
    var spareparts = readSheetAsObjects_(ss, 'Spareparts');
    for (var i = 0; i < payload.items.length; i++) {
      var it = payload.items[i];
      appendObject_(ss, 'Transaction_Details', {
        id: Utilities.getUuid(), transactionId: trxId, itemType: it.itemType, itemId: it.itemId,
        namaItem: it.namaItem, qty: it.qty, hargaSatuan: it.hargaSatuan, hargaPokok: it.hargaPokok || 0,
        subtotal: it.qty * it.hargaSatuan, mechanicId: it.mechanicId || '', fromWorkOrder: !!it.fromWorkOrder, createdAt: now
      });
      if (it.itemType === 'sparepart' && !it.alreadyDeducted) {
        for (var p = 0; p < spareparts.length; p++) {
          if (spareparts[p].id === it.itemId) {
            var before = Number(spareparts[p].stok);
            var after = Math.max(0, before - Number(it.qty));
            updateCellById_(ss, 'Spareparts', it.itemId, 'stok', after);
            appendObject_(ss, 'Stock_Movements', {
              id: Utilities.getUuid(), tanggal: now, itemType: 'sparepart', itemId: it.itemId,
              namaItem: it.namaItem, tipe: 'KELUAR', qty: it.qty, stokSebelum: before, stokSesudah: after,
              referensiTipe: 'POS', referensiId: noTrx, keterangan: 'Penjualan Kasir POS ' + noTrx,
              idempotencyKey: payload.idempotencyKey + '-' + it.itemId, createdBy: sess.userId, createdAt: now
            });
            break;
          }
        }
      }
    }

    return { transaction: trxRow };
  } finally {
    lock.releaseLock();
  }
}

function readSheetAsObjects_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
    out.push(obj);
  }
  return out;
}

function appendObject_(ss, sheetName, obj) {
  var sheet = ss.getSheetByName(sheetName);
  var headers = SCHEMA_39_TABLES[sheetName];
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

function updateCellById_(ss, sheetName, id, colName, newValue) {
  var sheet = ss.getSheetByName(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  var targetCol = headers.indexOf(colName);
  if (idCol === -1 || targetCol === -1) return;
  for (var r = 1; r < values.length; r++) {
    if (values[r][idCol] === id) {
      sheet.getRange(r + 1, targetCol + 1).setValue(newValue);
      break;
    }
  }
}
