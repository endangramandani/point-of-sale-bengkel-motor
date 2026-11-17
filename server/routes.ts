import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  loadDb,
  saveDb,
  withWriteLock,
  hashPassword,
  verifyPassword,
  uuid,
  resetDbToSeed,
  type DatabaseSchema,
} from './db.js';

interface AuthedRequest extends Request {
  user?: any;
  token?: string;
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function sanitizeUser(u: any) {
  if (!u) return null;
  const { passwordHash, passwordSalt, ...rest } = u;
  return rest;
}

function formatCodeDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function nextRunningNumber(prefix: string, existing: string[]): string {
  const datePart = formatCodeDate();
  const fullPrefix = `${prefix}-${datePart}-`;
  let max = 0;
  for (const code of existing) {
    if (typeof code === 'string' && code.startsWith(fullPrefix)) {
      const n = parseInt(code.slice(fullPrefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${fullPrefix}${String(max + 1).padStart(3, '0')}`;
}

function logActivity(
  db: DatabaseSchema,
  user: any,
  aksi: string,
  modul: string,
  referensiId: string,
  detail: string
) {
  db.Activity_Logs.unshift({
    id: uuid(),
    tanggal: new Date().toISOString(),
    userId: user?.id || 'system',
    userName: user?.nama || 'System',
    role: user?.roleName || 'System',
    aksi,
    modul,
    referensiId,
    detail,
    createdAt: new Date().toISOString(),
  });
  if (db.Activity_Logs.length > 500) {
    db.Activity_Logs = db.Activity_Logs.slice(0, 500);
  }
}

function pushNotification(
  db: DatabaseSchema,
  tipe: string,
  judul: string,
  pesan: string,
  referensiTipe: string,
  referensiId: string,
  targetRole = 'ALL'
) {
  db.Notifications.unshift({
    id: uuid(),
    tanggal: new Date().toISOString(),
    tipe,
    judul,
    pesan,
    targetRole,
    referensiTipe,
    referensiId,
    dibaca: false,
    createdAt: new Date().toISOString(),
  });
  if (db.Notifications.length > 200) {
    db.Notifications = db.Notifications.slice(0, 200);
  }
}

function checkLowStockNotifications(db: DatabaseSchema) {
  for (const p of db.Spareparts) {
    if (p.statusAktif && p.stok <= p.stokMinimum) {
      const already = db.Notifications.find(
        (n) => !n.dibaca && n.tipe === 'LOW_STOCK' && n.referensiId === p.id
      );
      if (!already) {
        pushNotification(
          db,
          'LOW_STOCK',
          'Stok Sparepart Menipis',
          `${p.nama} (${p.sku}) tersisa ${p.stok} ${p.satuan} (min ${p.stokMinimum}).`,
          'Sparepart',
          p.id,
          'ALL'
        );
      }
    }
  }
  for (const m of db.Materials) {
    if (m.statusAktif && m.stok <= m.stokMinimum) {
      const already = db.Notifications.find(
        (n) => !n.dibaca && n.tipe === 'LOW_MATERIAL' && n.referensiId === m.id
      );
      if (!already) {
        pushNotification(
          db,
          'LOW_MATERIAL',
          'Stok Bahan Operasional Menipis',
          `${m.nama} tersisa ${m.stok} ${m.satuan} (min ${m.stokMinimum}).`,
          'Material',
          m.id,
          'ALL'
        );
      }
    }
  }
}

function getUserRoleCode(db: DatabaseSchema, user: any): string {
  const role = db.Roles.find((r) => r.id === user.roleId);
  return role?.kode || 'PELANGGAN';
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : (req.headers['x-auth-token'] as string) || '';
  if (!token) {
    res.status(401).json({ error: 'Sesi login tidak ditemukan. Silakan masuk kembali.' });
    return;
  }
  const db = loadDb();
  const sess = db.Sessions[token];
  if (!sess || sess.expiresAt < Date.now()) {
    res.status(401).json({ error: 'Sesi telah berakhir. Silakan login ulang.' });
    return;
  }
  const user = db.Users.find((u) => u.id === sess.userId && u.statusAktif);
  if (!user) {
    res.status(401).json({ error: 'Akun pengguna tidak aktif atau tidak ditemukan.' });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

function requireRoles(...allowed: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    if (allowed.includes(roleCode)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Akses ditolak. Hak akses Anda (${req.user?.roleName || roleCode}) tidak diizinkan untuk aksi ini.`,
    });
  };
}

function generateWorkOrderCommissions(db: DatabaseSchema, wo: any, trxId: string | null) {
  if (wo.commissionGenerated) return;
  const now = new Date().toISOString();
  const details = db.Work_Order_Details.filter((d) => d.workOrderId === wo.id);
  const commSettings = db.Commission_Settings?.[0] || {
    defaultReferralNominal: 5000,
    defaultServiceCommissionPercent: 30,
  };

  // 1. Komisi pengerjaan jasa servis untuk mekanik pelaksana (strictly on service subtotal only)
  for (const d of details) {
    const mechId = d.mechanicId || wo.mechanicId;
    if (!mechId) continue;
    const emp = db.Employees.find((e) => e.id === mechId);
    if (!emp) continue;
    const pct = emp.tipeKomisi === 'PERSEN' ? Number(emp.nilaiKomisi || commSettings.defaultServiceCommissionPercent) : 0;
    const nominal =
      emp.tipeKomisi === 'PERSEN'
        ? Math.round((Number(d.subtotal || 0) * pct) / 100)
        : Number(emp.nilaiKomisi || 0);
    if (nominal <= 0) continue;

    const comId = uuid();
    const kodeKomisi = nextRunningNumber('KOM', (db.Mechanic_Commissions || []).map((c: any) => c.kodeKomisi));

    const comRecord = {
      id: comId,
      kodeKomisi,
      employeeId: emp.id,
      mechanicName: emp.nama,
      workOrderId: wo.id,
      noWo: wo.noWo,
      transactionId: trxId,
      noTransaksi: null,
      tipeKomisi: 'PENGERJAAN_SERVIS',
      dasarPerhitungan: Number(d.subtotal || 0),
      rate: emp.tipeKomisi === 'PERSEN' ? `${pct}%` : 'Nominal',
      nominalKomisi: nominal,
      status: 'MENUNGGU',
      tanggalPengerjaan: now,
      tanggalVerifikasi: null,
      verifikator: null,
      tanggalPembayaran: null,
      referensiPembayaran: null,
      keterangan: `Komisi servis ${d.namaLayanan || 'jasa'} (${wo.noWo})`,
      createdAt: now,
    };

    if (!db.Mechanic_Commissions) db.Mechanic_Commissions = [];
    db.Mechanic_Commissions.unshift(comRecord);

    // Sync legacy Commissions table
    db.Commissions.unshift({
      id: comId,
      tanggal: now,
      mechanicId: emp.id,
      mechanicName: emp.nama,
      workOrderId: wo.id,
      noWo: wo.noWo,
      transactionId: trxId,
      dasarJasa: Number(d.subtotal || 0),
      persentaseAtauTipe: emp.tipeKomisi === 'PERSEN' ? `${pct}%` : 'Nominal',
      nominalKomisi: nominal,
      status: 'BELUM_DIBAYAR',
      createdAt: now,
    });
  }

  // 2. Komisi referral pelanggan untuk mekanik pereferensi (jika ada kode referral terpasang)
  if (wo.referralCode) {
    const ref = db.Mechanic_Referrals?.find(
      (r: any) => r.kodeReferral?.toUpperCase() === String(wo.referralCode).trim().toUpperCase() && r.isActive
    );
    if (ref) {
      const refNominal = Number(commSettings.defaultReferralNominal || 5000);
      const refComId = uuid();
      const refKodeKomisi = nextRunningNumber('KOM', (db.Mechanic_Commissions || []).map((c: any) => c.kodeKomisi));

      const refComRecord = {
        id: refComId,
        kodeKomisi: refKodeKomisi,
        employeeId: ref.employeeId,
        mechanicName: ref.mechanicName,
        workOrderId: wo.id,
        noWo: wo.noWo,
        transactionId: trxId,
        noTransaksi: null,
        tipeKomisi: 'REFERRAL_PELANGGAN',
        dasarPerhitungan: refNominal,
        rate: `Flat Rp ${refNominal.toLocaleString('id-ID')}`,
        nominalKomisi: refNominal,
        status: 'TERVERIFIKASI',
        tanggalPengerjaan: now,
        tanggalVerifikasi: now,
        verifikator: 'Sistem Referral',
        tanggalPembayaran: null,
        referensiPembayaran: null,
        keterangan: `Komisi referral pelanggan untuk WO ${wo.noWo} (Kode: ${ref.kodeReferral})`,
        createdAt: now,
      };

      if (!db.Mechanic_Commissions) db.Mechanic_Commissions = [];
      db.Mechanic_Commissions.unshift(refComRecord);

      db.Commissions.unshift({
        id: refComId,
        tanggal: now,
        mechanicId: ref.employeeId,
        mechanicName: ref.mechanicName,
        workOrderId: wo.id,
        noWo: wo.noWo,
        transactionId: trxId,
        dasarJasa: refNominal,
        persentaseAtauTipe: 'Flat Referral',
        nominalKomisi: refNominal,
        status: 'BELUM_DIBAYAR',
        createdAt: now,
      });

      ref.totalReferralsCount = (Number(ref.totalReferralsCount) || 0) + 1;
      ref.totalKomisiEarned = (Number(ref.totalKomisiEarned) || 0) + refNominal;
    }
  }

  wo.commissionGenerated = true;
}

export function registerApiRoutes(app: Express) {
  // Static uploaded files
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'BENGKEL MOTOR', time: new Date().toISOString() });
  });

  // AUTH
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: 'Username dan password wajib diisi.' });
      return;
    }
    const result = await withWriteLock((db) => {
      const user = db.Users.find(
        (u) =>
          u.username.toLowerCase() === String(username).trim().toLowerCase() ||
          (u.email && u.email.toLowerCase() === String(username).trim().toLowerCase())
      );
      if (!user) {
        return { error: 'Username atau password salah.', status: 401 };
      }
      if (!user.statusAktif) {
        return { error: 'Akun Anda dinonaktifkan. Hubungi Super Admin.', status: 403 };
      }
      if (!verifyPassword(String(password), user.passwordHash, user.passwordSalt)) {
        return { error: 'Username atau password salah.', status: 401 };
      }
      const token = crypto.randomBytes(32).toString('hex');
      const roleCode = getUserRoleCode(db, user);
      db.Sessions[token] = {
        userId: user.id,
        role: roleCode,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      user.lastLogin = new Date().toISOString();
      logActivity(db, user, 'LOGIN', 'Autentikasi', user.id, `Login berhasil sebagai ${user.roleName}`);
      const role = db.Roles.find((r) => r.id === user.roleId);
      return {
        status: 200,
        data: {
          token,
          user: sanitizeUser(user),
          roleCode,
          permissions: role?.permissions || [],
          settings: db.Settings[0],
        },
      };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
    await withWriteLock((db) => {
      if (req.token && db.Sessions[req.token]) {
        delete db.Sessions[req.token];
      }
      logActivity(db, req.user, 'LOGOUT', 'Autentikasi', req.user.id, 'Logout dari sistem');
    });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const role = db.Roles.find((r) => r.id === req.user.roleId);
    const roleCode = role?.kode || 'PELANGGAN';
    res.json({
      user: sanitizeUser(req.user),
      roleCode,
      permissions: role?.permissions || [],
      settings: db.Settings[0],
      unreadNotifications: db.Notifications.filter((n) => !n.dibaca).length,
    });
  });

  // FILE UPLOAD (Mirrors Google Drive upload in GAS)
  app.post('/api/upload', requireAuth, (req: AuthedRequest, res) => {
    const { dataUrl, fileName } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'Data file tidak valid.' });
      return;
    }
    const match = dataUrl.match(/^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Format file ditolak. Hanya JPG, PNG, WEBP, atau PDF yang diizinkan.' });
      return;
    }
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Ukuran file maksimal 5 MB.' });
      return;
    }
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${extMap[mime]}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
    res.json({ url: `/uploads/${safeName}`, fileName: fileName || safeName, size: buffer.length, mime });
  });

  // BOOTSTRAP DATA FOR APP (Role-filtered)
  app.get('/api/bootstrap', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    const isStaff = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'KASIR'].includes(roleCode);
    const isMechanic = roleCode === 'MEKANIK';
    const isCustomer = roleCode === 'PELANGGAN';

    const custId = req.user.customerId;
    const empId = req.user.employeeId;

    const workOrders = isCustomer
      ? db.Work_Orders.filter((w) => w.customerId === custId)
      : isMechanic
      ? db.Work_Orders.filter((w) => w.mechanicId === empId)
      : db.Work_Orders;

    const woIds = new Set(workOrders.map((w) => w.id));

    const transactions = isCustomer
      ? db.Transactions.filter((t) => t.customerId === custId)
      : isMechanic
      ? []
      : db.Transactions;

    const trxIds = new Set(transactions.map((t) => t.id));

    res.json({
      roleCode,
      user: sanitizeUser(req.user),
      Settings: db.Settings[0],
      Roles: isStaff ? db.Roles : [],
      Users: roleCode === 'SUPER_ADMIN' ? db.Users.map(sanitizeUser) : [],
      Employees: db.Employees,
      Customers: isCustomer
        ? db.Customers.filter((c) => c.id === custId)
        : db.Customers,
      Vehicles: isCustomer
        ? db.Vehicles.filter((v) => v.customerId === custId)
        : db.Vehicles,
      Service_Categories: db.Service_Categories,
      Services: db.Services,
      Suppliers: isStaff ? db.Suppliers : [],
      Sparepart_Categories: db.Sparepart_Categories,
      Spareparts: db.Spareparts,
      Material_Categories: db.Material_Categories,
      Materials: isCustomer ? [] : db.Materials,
      Service_Orders: isCustomer
        ? db.Service_Orders.filter((s) => s.customerId === custId)
        : isMechanic
        ? db.Service_Orders.filter((s) => s.mechanicId === empId)
        : db.Service_Orders,
      Work_Orders: workOrders,
      Work_Order_Details: db.Work_Order_Details.filter((d) => woIds.has(d.workOrderId)),
      Work_Order_Parts: db.Work_Order_Parts.filter((p) => woIds.has(p.workOrderId)),
      Work_Order_Materials: isCustomer
        ? []
        : db.Work_Order_Materials.filter((m) => woIds.has(m.workOrderId)),
      Service_History: isCustomer
        ? db.Service_History.filter((h) => h.customerId === custId)
        : db.Service_History,
      Purchases: isStaff ? db.Purchases : [],
      Purchase_Details: isStaff ? db.Purchase_Details : [],
      Stock_Movements: isStaff ? db.Stock_Movements : [],
      Material_Usages: isStaff || isMechanic ? db.Material_Usages : [],
      Appointments: isCustomer
        ? db.Appointments.filter((a) => a.customerId === custId)
        : db.Appointments,
      Queues: isCustomer
        ? db.Queues.filter((q) => q.customerId === custId)
        : db.Queues,
      Transactions: transactions,
      Transaction_Details: db.Transaction_Details.filter((d) => trxIds.has(d.transactionId)),
      Payments: db.Payments.filter((p) => trxIds.has(p.transactionId)),
      Accounts_Payable: isStaff ? db.Accounts_Payable : [],
      Payable_Payments: isStaff ? db.Payable_Payments : [],
      Accounts_Receivable: isCustomer
        ? db.Accounts_Receivable.filter((a) => a.customerId === custId)
        : isStaff
        ? db.Accounts_Receivable
        : [],
      Receivable_Payments: isStaff ? db.Receivable_Payments : [],
      Expenses: isStaff ? db.Expenses : [],
      Commissions: isMechanic
        ? db.Commissions.filter((c) => c.mechanicId === empId)
        : isStaff
        ? db.Commissions
        : [],
      Attendance: isMechanic
        ? db.Attendance.filter((a) => a.employeeId === empId)
        : isStaff
        ? db.Attendance
        : [],
      Shifts: isMechanic
        ? db.Shifts.filter((s) => s.employeeId === empId)
        : isStaff
        ? db.Shifts
        : [],
      Warranties: isCustomer
        ? db.Warranties.filter((w) => w.customerId === custId)
        : db.Warranties,
      Notifications: db.Notifications,
      Activity_Logs: roleCode === 'SUPER_ADMIN' || roleCode === 'OWNER' ? db.Activity_Logs : [],
      Cash_Closings: isStaff ? db.Cash_Closings : [],
      Mechanic_Referrals: isMechanic
        ? (db.Mechanic_Referrals || []).filter((r) => r.employeeId === empId)
        : db.Mechanic_Referrals || [],
      Referral_Records: isMechanic
        ? (db.Referral_Records || []).filter((r) => r.employeeId === empId)
        : db.Referral_Records || [],
      Commission_Settings: db.Commission_Settings?.[0] || {
        defaultReferralNominal: 5000,
        defaultServiceCommissionPercent: 30,
        monthlyServiceTarget: 35,
        targetBonusNominal: 150000,
      },
      Mechanic_Commissions: isMechanic
        ? (db.Mechanic_Commissions || []).filter((c) => c.employeeId === empId)
        : isStaff
        ? db.Mechanic_Commissions || []
        : [],
      Queue_Records: isCustomer
        ? (db.Queue_Records || []).filter((q) => q.customerId === custId)
        : db.Queue_Records || [],
      Service_Duration_Settings: db.Service_Duration_Settings || [],
      Service_Time_Records: isCustomer
        ? (db.Service_Time_Records || []).filter((r) => {
            const wo = db.Work_Orders.find((w) => w.id === r.workOrderId);
            return wo && wo.customerId === custId;
          })
        : db.Service_Time_Records || [],
      Estimation_History: isCustomer
        ? (db.Estimation_History || []).filter((h) => {
            const wo = db.Work_Orders.find((w) => w.id === h.workOrderId);
            return wo && wo.customerId === custId;
          })
        : db.Estimation_History || [],
    });
  });

  // DASHBOARD ANALYTICS
  app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    const today = new Date().toISOString().slice(0, 10);
    const validTrx = db.Transactions.filter((t) => t.statusPembayaran !== 'DIBATALKAN');
    const todayTrx = validTrx.filter((t) => t.tanggal.slice(0, 10) === today);

    const pendapatanHariIni = todayTrx.reduce((s, t) => s + Number(t.total || 0), 0);
    const transaksiHariIni = todayTrx.length;
    const kendaraanMasukHariIni = db.Service_Orders.filter(
      (s) => s.tanggalMasuk.slice(0, 10) === today
    ).length;

    const servisSelesai = db.Work_Orders.filter((w) =>
      ['Selesai', 'Sudah diserahkan'].includes(w.status)
    ).length;
    const servisDikerjakan = db.Work_Orders.filter((w) =>
      ['Sedang diperiksa', 'Sedang dikerjakan', 'Menunggu pengujian'].includes(w.status)
    ).length;
    const antreanServis = db.Queues.filter((q) =>
      ['Menunggu', 'Dikonfirmasi', 'Dalam antrean', 'Sedang diperiksa'].includes(q.status)
    ).length;

    const totalPenjualanSparepart = validTrx.reduce(
      (s, t) => s + Number(t.subtotalSparepart || 0),
      0
    );
    const totalPendapatanJasa = validTrx.reduce((s, t) => s + Number(t.subtotalJasa || 0), 0);
    const mekanikAktif = db.Employees.filter(
      (e) => e.statusAktif && e.jabatan.toLowerCase().includes('mekanik')
    ).length;
    const totalPelanggan = db.Customers.length;
    const totalStokSparepart = db.Spareparts.reduce((s, p) => s + Number(p.stok || 0), 0);
    const lowStockList = db.Spareparts.filter((p) => p.statusAktif && p.stok <= p.stokMinimum);
    const totalUtangSupplier = db.Accounts_Payable.reduce(
      (s, a) => s + Number(a.sisaUtang || 0),
      0
    );
    const totalPiutangPelanggan = db.Accounts_Receivable.reduce(
      (s, a) => s + Number(a.sisaPiutang || 0),
      0
    );

    // Chart Series: Harian (7 hari terakhir), Mingguan (4 minggu), Bulanan (6 bulan), Tahunan (3 tahun)
    const dailyLabels: string[] = [];
    const dailyJasa: number[] = [];
    const dailyParts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      dailyLabels.push(label);
      const dayTrx = validTrx.filter((t) => t.tanggal.slice(0, 10) === key);
      dailyJasa.push(dayTrx.reduce((s, t) => s + Number(t.subtotalJasa || 0), 0));
      dailyParts.push(dayTrx.reduce((s, t) => s + Number(t.subtotalSparepart || 0), 0));
    }

    const weeklyLabels = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'];
    const weeklyJasa = [820000, 1150000, 960000, dailyJasa.reduce((a, b) => a + b, 0)];
    const weeklyParts = [1340000, 1780000, 1520000, dailyParts.reduce((a, b) => a + b, 0)];

    const monthlyLabels = ['Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov'];
    const monthlyJasa = [4200000, 4850000, 5100000, 4950000, 5400000, weeklyJasa.reduce((a, b) => a + b, 0)];
    const monthlyParts = [6800000, 7200000, 7950000, 7400000, 8100000, weeklyParts.reduce((a, b) => a + b, 0)];

    const yearlyLabels = ['2024', '2025', '2026'];
    const yearlyJasa = [48500000, 56200000, monthlyJasa.reduce((a, b) => a + b, 0) + 28000000];
    const yearlyParts = [74200000, 83900000, monthlyParts.reduce((a, b) => a + b, 0) + 42000000];

    res.json({
      roleCode,
      kpis: {
        pendapatanHariIni,
        transaksiHariIni,
        kendaraanMasukHariIni,
        servisSelesai,
        servisDikerjakan,
        antreanServis,
        totalPenjualanSparepart,
        totalPendapatanJasa,
        mekanikAktif,
        totalPelanggan,
        totalStokSparepart,
        stokHampirHabis: lowStockList.length,
        totalUtangSupplier,
        totalPiutangPelanggan,
      },
      charts: {
        harian: { labels: dailyLabels, jasa: dailyJasa, sparepart: dailyParts },
        mingguan: { labels: weeklyLabels, jasa: weeklyJasa, sparepart: weeklyParts },
        bulanan: { labels: monthlyLabels, jasa: monthlyJasa, sparepart: monthlyParts },
        tahunan: { labels: yearlyLabels, jasa: yearlyJasa, sparepart: yearlyParts },
      },
      lowStockList,
      recentWorkOrders: db.Work_Orders.slice(0, 6),
      recentTransactions: db.Transactions.slice(0, 6),
    });
  });

  // =========================================================================
  // PENERIMAAN SERVIS & WORK ORDER
  // =========================================================================
  app.post(
    '/api/service-orders',
    requireAuth,
    requireRoles('ADMIN', 'KASIR'),
    async (req: AuthedRequest, res) => {
      const b = req.body || {};
      if (!b.customerId || !b.vehicleId || !b.keluhan) {
        res.status(400).json({ error: 'Pelanggan, kendaraan, dan keluhan wajib diisi.' });
        return;
      }
      const result = await withWriteLock((db) => {
        const noOrder = nextRunningNumber(
          'SO',
          db.Service_Orders.map((s) => s.noOrder)
        );
        const noWo = nextRunningNumber(
          'WO',
          db.Work_Orders.map((w) => w.noWo)
        );
        const now = new Date().toISOString();
        const so = {
          id: uuid(),
          noOrder,
          tanggalMasuk: b.tanggalMasuk || now,
          customerId: b.customerId,
          vehicleId: b.vehicleId,
          kmMasuk: Number(b.kmMasuk || 0),
          keluhan: String(b.keluhan).trim(),
          kondisiDiterima: String(b.kondisiDiterima || 'Baik').trim(),
          bahanBakar: String(b.bahanBakar || '50%'),
          barangBawaan: String(b.barangBawaan || '-').trim(),
          fotoKendaraan: b.fotoKendaraan || '',
          fotoKerusakan: b.fotoKerusakan || '',
          mechanicId: b.mechanicId || null,
          estimasiBiaya: Number(b.estimasiBiaya || 0),
          estimasiSelesai: b.estimasiSelesai || now,
          status: 'Menunggu pemeriksaan',
          createdBy: req.user.id,
          createdAt: now,
        };
        const wo = {
          id: uuid(),
          noWo,
          serviceOrderId: so.id,
          customerId: b.customerId,
          vehicleId: b.vehicleId,
          mechanicId: b.mechanicId || null,
          keluhan: so.keluhan,
          hasilPemeriksaan: '',
          diagnosis: '',
          catatanMekanik: '',
          estimasiBiaya: Number(b.estimasiBiaya || 0),
          estimasiDisetujui: false,
          tanggalDisetujui: null,
          estimasiSelesai: so.estimasiSelesai,
          status: 'Menunggu pemeriksaan',
          riwayatStatus: [{ status: 'Menunggu pemeriksaan', waktu: now, oleh: req.user.nama }],
          billedTransactionId: null,
          commissionGenerated: false,
          createdBy: req.user.id,
          createdAt: now,
          updatedAt: now,
        };

        // Add initial selected services if any
        if (Array.isArray(b.serviceIds)) {
          let totalEst = 0;
          for (const srvId of b.serviceIds) {
            const srv = db.Services.find((s) => s.id === srvId);
            if (!srv) continue;
            totalEst += Number(srv.hargaJasa || 0);
            db.Work_Order_Details.push({
              id: uuid(),
              workOrderId: wo.id,
              serviceId: srv.id,
              namaLayanan: srv.nama,
              hargaJasa: Number(srv.hargaJasa || 0),
              qty: 1,
              subtotal: Number(srv.hargaJasa || 0),
              mechanicId: wo.mechanicId,
              komisi: 0,
              status: 'Menunggu pemeriksaan',
              createdAt: now,
            });
          }
          if (totalEst > 0 && wo.estimasiBiaya === 0) {
            wo.estimasiBiaya = totalEst;
            so.estimasiBiaya = totalEst;
          }
        }

        // Update vehicle KM
        const veh = db.Vehicles.find((v) => v.id === b.vehicleId);
        if (veh && so.kmMasuk > Number(veh.kilometerTerakhir || 0)) {
          veh.kilometerTerakhir = so.kmMasuk;
        }

        const today = now.slice(0, 10);
        const todayQueues = db.Queues.filter((q) => q.tanggal === today);
        const queueNum = `A-${String(todayQueues.length + 1).padStart(2, '0')}`;
        const queue = {
          id: uuid(),
          nomorAntrean: queueNum,
          tanggal: today,
          appointmentId: b.appointmentId || null,
          serviceOrderId: so.id,
          workOrderId: wo.id,
          customerId: b.customerId,
          vehicleId: b.vehicleId,
          keluhan: so.keluhan,
          estimasiTungguMenit: todayQueues.length * 20,
          status: 'Dalam antrean',
          createdAt: now,
        };

        db.Service_Orders.unshift(so);
        db.Work_Orders.unshift(wo);
        db.Queues.push(queue);

        const cust = db.Customers.find((c) => c.id === b.customerId);
        pushNotification(
          db,
          'NEW_SERVICE',
          'Servis Baru Masuk',
          `${veh?.noPolisi || ''} (${cust?.nama || ''}) masuk dengan ${wo.noWo}.`,
          'WorkOrder',
          wo.id
        );
        logActivity(
          db,
          req.user,
          'CREATE_SERVICE_ORDER',
          'Penerimaan Kendaraan',
          wo.id,
          `Membuat ${so.noOrder} & ${wo.noWo}`
        );

        return { so, wo, queue };
      });
      res.status(201).json(result);
    }
  );

  // Update Work Order (Status, diagnosis, mechanic assignment, customer approval)
  app.patch(
    '/api/work-orders/:id',
    requireAuth,
    requireRoles('ADMIN', 'KASIR', 'MEKANIK', 'PELANGGAN'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const b = req.body || {};
      const result = await withWriteLock((db) => {
        const wo = db.Work_Orders.find((w) => w.id === id);
        if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };

        const roleCode = getUserRoleCode(db, req.user);
        if (roleCode === 'MEKANIK' && wo.mechanicId !== req.user.employeeId) {
          return { error: 'Anda hanya dapat memperbarui Work Order yang ditugaskan kepada Anda.', status: 403 };
        }
        if (roleCode === 'PELANGGAN') {
          if (wo.customerId !== req.user.customerId) {
            return { error: 'Akses ditolak.', status: 403 };
          }
          // Customer can only approve cost estimate
          if (typeof b.estimasiDisetujui === 'boolean') {
            wo.estimasiDisetujui = b.estimasiDisetujui;
            wo.tanggalDisetujui = b.estimasiDisetujui ? new Date().toISOString() : null;
            if (b.estimasiDisetujui && wo.status === 'Menunggu persetujuan pelanggan') {
              wo.status = 'Siap dikerjakan';
              wo.riwayatStatus.push({
                status: 'Siap dikerjakan',
                waktu: new Date().toISOString(),
                oleh: `${req.user.nama} (Persetujuan Pelanggan)`,
              });
            }
            wo.updatedAt = new Date().toISOString();
            return { status: 200, data: wo };
          }
          return { error: 'Pelanggan hanya dapat menyetujui estimasi biaya.', status: 403 };
        }

        const now = new Date().toISOString();
        if (b.hasilPemeriksaan !== undefined) wo.hasilPemeriksaan = b.hasilPemeriksaan;
        if (b.diagnosis !== undefined) wo.diagnosis = b.diagnosis;
        if (b.catatanMekanik !== undefined) wo.catatanMekanik = b.catatanMekanik;
        if (b.mechanicId !== undefined && roleCode !== 'MEKANIK') wo.mechanicId = b.mechanicId;
        if (b.estimasiSelesai !== undefined) wo.estimasiSelesai = b.estimasiSelesai;

        if (typeof b.estimasiDisetujui === 'boolean') {
          wo.estimasiDisetujui = b.estimasiDisetujui;
          wo.tanggalDisetujui = b.estimasiDisetujui ? now : null;
        }

        if (b.status && b.status !== wo.status) {
          wo.status = b.status;
          wo.riwayatStatus.push({ status: b.status, waktu: now, oleh: req.user.nama });

          const so = db.Service_Orders.find((s) => s.id === wo.serviceOrderId);
          if (so) so.status = b.status;

          const q = db.Queues.find((qu) => qu.workOrderId === wo.id);
          if (q) q.status = b.status;

          if (b.status === 'Menunggu persetujuan pelanggan') {
            pushNotification(
              db,
              'APPROVAL',
              'Persetujuan Pelanggan Diperlukan',
              `${wo.noWo} membutuhkan persetujuan estimasi biaya.`,
              'WorkOrder',
              wo.id
            );
          }

          if (b.status === 'Selesai' || b.status === 'Sudah diserahkan') {
            // Confirm & deduct un-deducted WO spareparts ONCE
            const woParts = db.Work_Order_Parts.filter((p) => p.workOrderId === wo.id);
            for (const wp of woParts) {
              wp.dikonfirmasi = true;
              if (!wp.stockDeducted) {
                const sp = db.Spareparts.find((s) => s.id === wp.sparepartId);
                if (sp) {
                  const before = Number(sp.stok || 0);
                  const after = Math.max(0, before - Number(wp.qty || 0));
                  sp.stok = after;
                  wp.stockDeducted = true;
                  db.Stock_Movements.unshift({
                    id: uuid(),
                    tanggal: now,
                    itemType: 'sparepart',
                    itemId: sp.id,
                    namaItem: sp.nama,
                    tipe: 'KELUAR',
                    qty: Number(wp.qty || 0),
                    stokSebelum: before,
                    stokSesudah: after,
                    referensiTipe: 'WorkOrder',
                    referensiId: wo.noWo,
                    keterangan: `Pemakaian sparepart dikonfirmasi (${wo.noWo})`,
                    idempotencyKey: `wo-part-${wp.id}`,
                    createdBy: req.user.id,
                    createdAt: now,
                  });
                }
              }
            }

            // Generate mechanic commissions
            generateWorkOrderCommissions(db, wo, wo.billedTransactionId);

            // Create Service History if not exists
            const histExists = db.Service_History.some((h) => h.workOrderId === wo.id);
            if (!histExists) {
              const details = db.Work_Order_Details.filter((d) => d.workOrderId === wo.id);
              const mech = db.Employees.find((e) => e.id === wo.mechanicId);
              const veh = db.Vehicles.find((v) => v.id === wo.vehicleId);
              const totalJasa = details.reduce((s, d) => s + Number(d.subtotal || 0), 0);
              const totalPart = woParts.reduce((s, p) => s + Number(p.subtotal || 0), 0);
              db.Service_History.unshift({
                id: uuid(),
                vehicleId: wo.vehicleId,
                customerId: wo.customerId,
                workOrderId: wo.id,
                noWo: wo.noWo,
                tanggal: now,
                kmSaatServis: veh?.kilometerTerakhir || 0,
                mechanicId: wo.mechanicId,
                mechanicName: mech?.nama || '-',
                keluhan: wo.keluhan,
                diagnosis: wo.diagnosis || wo.hasilPemeriksaan || '-',
                tindakan: details.map((d) => d.namaLayanan).join(', ') || 'Pemeriksaan Teknis',
                sparepartDiganti: woParts.map((p) => `${p.namaSparepart} (${p.qty})`).join(', ') || '-',
                totalBiaya: totalJasa + totalPart,
                fotoKendaraan: so?.fotoKendaraan || '',
                catatanTeknisi: wo.catatanMekanik || '-',
                createdAt: now,
              });

              // Create Warranty automatically if configured
              const settings = db.Settings[0];
              const days = Number(settings?.garansiDefaultHari || 14);
              if (days > 0) {
                const end = new Date();
                end.setDate(end.getDate() + days);
                db.Warranties.unshift({
                  id: uuid(),
                  noGaransi: nextRunningNumber('GRN', db.Warranties.map((g) => g.noGaransi)),
                  workOrderId: wo.id,
                  transactionId: wo.billedTransactionId || null,
                  customerId: wo.customerId,
                  vehicleId: wo.vehicleId,
                  tanggalMulai: now.slice(0, 10),
                  tanggalBerakhir: end.toISOString().slice(0, 10),
                  jenisGaransi: `Garansi Servis ${days} Hari`,
                  itemDijamin: details.map((d) => d.namaLayanan).join(', ') || 'Jasa Servis',
                  syarat: 'Berlaku untuk keluhan yang sama dengan menunjukkan nota/WO.',
                  status: 'AKTIF',
                  createdAt: now,
                });
              }
            }

            pushNotification(
              db,
              'SERVICE_DONE',
              'Servis Selesai',
              `${wo.noWo} telah berstatus ${b.status}. Siap ditagihkan di kasir.`,
              'WorkOrder',
              wo.id
            );
            checkLowStockNotifications(db);
          }
        }

        // Recompute estimasiBiaya from details + parts
        const detSum = db.Work_Order_Details.filter((d) => d.workOrderId === wo.id).reduce(
          (s, d) => s + Number(d.subtotal || 0),
          0
        );
        const partSum = db.Work_Order_Parts.filter((p) => p.workOrderId === wo.id).reduce(
          (s, p) => s + Number(p.subtotal || 0),
          0
        );
        if (detSum + partSum > 0) {
          wo.estimasiBiaya = detSum + partSum;
        }
        wo.updatedAt = now;
        logActivity(db, req.user, 'UPDATE_WORK_ORDER', 'Work Order', wo.id, `Update ${wo.noWo} -> ${wo.status}`);
        return { status: 200, data: wo };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.data);
    }
  );

  // Add service line to Work Order
  app.post(
    '/api/work-orders/:id/details',
    requireAuth,
    requireRoles('ADMIN', 'KASIR', 'MEKANIK'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { serviceId, namaLayanan, hargaJasa, qty } = req.body || {};
      const result = await withWriteLock((db) => {
        const wo = db.Work_Orders.find((w) => w.id === id);
        if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };
        const roleCode = getUserRoleCode(db, req.user);
        if (roleCode === 'MEKANIK' && wo.mechanicId !== req.user.employeeId) {
          return { error: 'Work Order ini bukan tugas Anda.', status: 403 };
        }
        const srv = serviceId ? db.Services.find((s) => s.id === serviceId) : null;
        const unitPrice = Number(hargaJasa ?? srv?.hargaJasa ?? 0);
        const count = Math.max(1, Number(qty || 1));
        const item = {
          id: uuid(),
          workOrderId: wo.id,
          serviceId: srv?.id || null,
          namaLayanan: namaLayanan || srv?.nama || 'Jasa Tambahan',
          hargaJasa: unitPrice,
          qty: count,
          subtotal: unitPrice * count,
          mechanicId: wo.mechanicId,
          komisi: 0,
          status: wo.status,
          createdAt: new Date().toISOString(),
        };
        db.Work_Order_Details.push(item);
        const detSum = db.Work_Order_Details.filter((d) => d.workOrderId === wo.id).reduce(
          (s, d) => s + Number(d.subtotal || 0),
          0
        );
        const partSum = db.Work_Order_Parts.filter((p) => p.workOrderId === wo.id).reduce(
          (s, p) => s + Number(p.subtotal || 0),
          0
        );
        wo.estimasiBiaya = detSum + partSum;
        wo.updatedAt = new Date().toISOString();
        return { status: 201, data: item };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // Add sparepart to Work Order
  app.post(
    '/api/work-orders/:id/parts',
    requireAuth,
    requireRoles('ADMIN', 'KASIR', 'MEKANIK'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { sparepartId, qty, confirmImmediately } = req.body || {};
      const result = await withWriteLock((db) => {
        const wo = db.Work_Orders.find((w) => w.id === id);
        if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };
        const roleCode = getUserRoleCode(db, req.user);
        if (roleCode === 'MEKANIK' && wo.mechanicId !== req.user.employeeId) {
          return { error: 'Work Order ini bukan tugas Anda.', status: 403 };
        }
        const sp = db.Spareparts.find((s) => s.id === sparepartId);
        if (!sp) return { error: 'Sparepart tidak ditemukan.', status: 404 };
        const count = Math.max(1, Number(qty || 1));
        if (confirmImmediately && sp.stok < count) {
          return { error: `Stok ${sp.nama} tidak mencukupi (tersedia ${sp.stok}).`, status: 400 };
        }
        const now = new Date().toISOString();
        let deducted = false;
        if (confirmImmediately) {
          const before = Number(sp.stok);
          sp.stok = before - count;
          deducted = true;
          db.Stock_Movements.unshift({
            id: uuid(),
            tanggal: now,
            itemType: 'sparepart',
            itemId: sp.id,
            namaItem: sp.nama,
            tipe: 'KELUAR',
            qty: count,
            stokSebelum: before,
            stokSesudah: sp.stok,
            referensiTipe: 'WorkOrder',
            referensiId: wo.noWo,
            keterangan: `Pemakaian part terkonfirmasi pada ${wo.noWo}`,
            idempotencyKey: `wo-part-add-${uuid()}`,
            createdBy: req.user.id,
            createdAt: now,
          });
          checkLowStockNotifications(db);
        }
        const wp = {
          id: uuid(),
          workOrderId: wo.id,
          sparepartId: sp.id,
          sku: sp.sku,
          namaSparepart: sp.nama,
          qty: count,
          hargaBeli: Number(sp.hargaBeli),
          hargaJual: Number(sp.hargaJual),
          subtotal: Number(sp.hargaJual) * count,
          dikonfirmasi: Boolean(confirmImmediately),
          stockDeducted: deducted,
          createdAt: now,
        };
        db.Work_Order_Parts.push(wp);
        const detSum = db.Work_Order_Details.filter((d) => d.workOrderId === wo.id).reduce(
          (s, d) => s + Number(d.subtotal || 0),
          0
        );
        const partSum = db.Work_Order_Parts.filter((p) => p.workOrderId === wo.id).reduce(
          (s, p) => s + Number(p.subtotal || 0),
          0
        );
        wo.estimasiBiaya = detSum + partSum;
        wo.updatedAt = now;
        return { status: 201, data: wp };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // Confirm single Work Order sparepart usage (deducts stock once)
  app.post(
    '/api/work-orders/:id/parts/:partId/confirm',
    requireAuth,
    requireRoles('ADMIN', 'KASIR', 'MEKANIK'),
    async (req: AuthedRequest, res) => {
      const { id, partId } = req.params;
      const result = await withWriteLock((db) => {
        const wo = db.Work_Orders.find((w) => w.id === id);
        if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };
        const wp = db.Work_Order_Parts.find((p) => p.id === partId && p.workOrderId === id);
        if (!wp) return { error: 'Item sparepart WO tidak ditemukan.', status: 404 };
        if (wp.stockDeducted) {
          return { status: 200, data: wp };
        }
        const sp = db.Spareparts.find((s) => s.id === wp.sparepartId);
        if (!sp) return { error: 'Data master sparepart tidak ditemukan.', status: 404 };
        if (sp.stok < wp.qty) {
          return { error: `Stok ${sp.nama} kurang (${sp.stok} < ${wp.qty}).`, status: 400 };
        }
        const now = new Date().toISOString();
        const before = Number(sp.stok);
        sp.stok = before - Number(wp.qty);
        wp.dikonfirmasi = true;
        wp.stockDeducted = true;
        db.Stock_Movements.unshift({
          id: uuid(),
          tanggal: now,
          itemType: 'sparepart',
          itemId: sp.id,
          namaItem: sp.nama,
          tipe: 'KELUAR',
          qty: Number(wp.qty),
          stokSebelum: before,
          stokSesudah: sp.stok,
          referensiTipe: 'WorkOrder',
          referensiId: wo.noWo,
          keterangan: `Konfirmasi penggunaan part pada ${wo.noWo}`,
          idempotencyKey: `wo-part-${wp.id}`,
          createdBy: req.user.id,
          createdAt: now,
        });
        checkLowStockNotifications(db);
        return { status: 200, data: wp };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.data);
    }
  );

  // Record Operational Material usage on Work Order (deducts material stock)
  app.post(
    '/api/work-orders/:id/materials',
    requireAuth,
    requireRoles('ADMIN', 'KASIR', 'MEKANIK'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { materialId, qty, catatan } = req.body || {};
      const result = await withWriteLock((db) => {
        const wo = db.Work_Orders.find((w) => w.id === id);
        if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };
        const mat = db.Materials.find((m) => m.id === materialId);
        if (!mat) return { error: 'Bahan operasional tidak ditemukan.', status: 404 };
        const count = Number(qty || 1);
        if (count <= 0 || mat.stok < count) {
          return { error: `Stok bahan ${mat.nama} tidak mencukupi (tersedia ${mat.stok}).`, status: 400 };
        }
        const now = new Date().toISOString();
        const before = Number(mat.stok);
        mat.stok = before - count;
        const wom = {
          id: uuid(),
          workOrderId: wo.id,
          materialId: mat.id,
          namaBahan: mat.nama,
          qty: count,
          satuan: mat.satuan,
          hargaBeli: Number(mat.hargaBeli),
          subtotal: Number(mat.hargaBeli) * count,
          createdAt: now,
        };
        db.Work_Order_Materials.push(wom);
        db.Material_Usages.unshift({
          id: uuid(),
          tanggal: now,
          workOrderId: wo.id,
          noWo: wo.noWo,
          materialId: mat.id,
          namaBahan: mat.nama,
          qty: count,
          satuan: mat.satuan,
          hargaBeli: Number(mat.hargaBeli),
          totalBiaya: Number(mat.hargaBeli) * count,
          mechanicId: wo.mechanicId || req.user.employeeId,
          catatan: catatan || `Pemakaian pada ${wo.noWo}`,
          createdBy: req.user.id,
          createdAt: now,
        });
        db.Stock_Movements.unshift({
          id: uuid(),
          tanggal: now,
          itemType: 'material',
          itemId: mat.id,
          namaItem: mat.nama,
          tipe: 'KELUAR',
          qty: count,
          stokSebelum: before,
          stokSesudah: mat.stok,
          referensiTipe: 'WorkOrder',
          referensiId: wo.noWo,
          keterangan: `Pemakaian bahan operasional (${wo.noWo})`,
          idempotencyKey: `wo-mat-${wom.id}`,
          createdBy: req.user.id,
          createdAt: now,
        });
        checkLowStockNotifications(db);
        return { status: 201, data: wom };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // =========================================================================
  // =========================================================================
  // KASIR / POS & QRIS / TUNAI (EKSKLUSIF ROLE KASIR)
  // =========================================================================
  app.post(
    '/api/pos/checkout',
    requireAuth,
    requireRoles('KASIR'),
    async (req: AuthedRequest, res) => {
      const b = req.body || {};
      const idempKey = b.idempotencyKey || uuid();
      if (!['TUNAI', 'QRIS'].includes(b.metodePembayaran)) {
        res.status(400).json({ error: 'Metode pembayaran hanya diizinkan TUNAI atau QRIS.' });
        return;
      }
      const namaPetugasKasir = (b.namaPetugasKasir || '').trim();
      if (!namaPetugasKasir) {
        res.status(400).json({ error: 'Nama Petugas Kasir wajib diisi.' });
        return;
      }
      const itemsList = Array.isArray(b.items) ? b.items : [];
      const biayaPasang = Math.max(0, Number(b.biayaPasang || 0));
      if (itemsList.length === 0 && biayaPasang <= 0) {
        res.status(400).json({ error: 'Pilih minimal satu layanan, sparepart, atau biaya pasang.' });
        return;
      }

      const result = await withWriteLock((db) => {
        if (db.Idempotency_Keys[idempKey]) {
          return { status: 200, data: db.Idempotency_Keys[idempKey].response };
        }

        const settings = db.Settings[0] || {
          pajakAktif: false,
          pajakPersen: 11,
          izinkanPembayaranSebagian: true,
        };
        const commSettings = db.Commission_Settings?.[0] || {
          defaultReferralNominal: 5000,
          defaultServiceCommissionPercent: 30,
        };
        const now = new Date().toISOString();

        let subtotalJasa = 0;
        let subtotalSparepart = 0;
        const resolvedItems: any[] = [];

        // Validate stock for standalone spareparts first
        for (const item of itemsList) {
          const qty = Math.max(1, Number(item.qty || 1));
          if (item.itemType === 'service') {
            const srv = db.Services.find((s) => s.id === item.itemId);
            const price = Number(item.hargaSatuan ?? srv?.hargaJasa ?? 0);
            const sub = price * qty;
            subtotalJasa += sub;
            resolvedItems.push({
              itemType: 'service',
              itemId: srv?.id || item.itemId,
              namaItem: item.namaItem || srv?.nama || 'Layanan Servis',
              qty,
              hargaSatuan: price,
              hargaPokok: 0,
              subtotal: sub,
              mechanicId: item.mechanicId || b.mechanicId || null,
              fromWorkOrder: Boolean(item.fromWorkOrder),
            });
          } else if (item.itemType === 'sparepart') {
            const sp = db.Spareparts.find((s) => s.id === item.itemId);
            if (!sp) return { error: `Sparepart ${item.namaItem || item.itemId} tidak ditemukan.`, status: 404 };
            // Check if already deducted on Work Order
            let alreadyDeducted = false;
            if (b.workOrderId && item.workOrderPartId) {
              const wp = db.Work_Order_Parts.find((p) => p.id === item.workOrderPartId);
              if (wp?.stockDeducted) alreadyDeducted = true;
            }
            if (!alreadyDeducted && sp.stok < qty) {
              return { error: `Stok ${sp.nama} tidak mencukupi (tersedia ${sp.stok}).`, status: 400 };
            }
            const price = Number(item.hargaSatuan ?? sp.hargaJual);
            const sub = price * qty;
            subtotalSparepart += sub;
            resolvedItems.push({
              itemType: 'sparepart',
              itemId: sp.id,
              namaItem: sp.nama,
              qty,
              hargaSatuan: price,
              hargaPokok: Number(sp.hargaBeli),
              subtotal: sub,
              mechanicId: null,
              fromWorkOrder: Boolean(item.fromWorkOrder),
              workOrderPartId: item.workOrderPartId || null,
              alreadyDeducted,
            });
          }
        }

        if (biayaPasang > 0) {
          subtotalJasa += biayaPasang;
          resolvedItems.push({
            itemType: 'service',
            itemId: 'biaya-pasang',
            namaItem: (b.biayaPasangKeterangan || '').trim() || 'Biaya Pasang',
            qty: 1,
            hargaSatuan: biayaPasang,
            hargaPokok: 0,
            subtotal: biayaPasang,
            mechanicId: b.mechanicId || null,
            fromWorkOrder: false,
          });
        }

        const diskon = Math.max(0, Number(b.diskon || 0));
        const afterDiscount = Math.max(0, subtotalJasa + subtotalSparepart - diskon);
        const pajakPersen = settings.pajakAktif ? Number(settings.pajakPersen || 0) : 0;
        const pajakNominal = Math.round((afterDiscount * pajakPersen) / 100);
        const total = afterDiscount + pajakNominal;

        const isPartialRequested = Boolean(b.pembayaranSebagian);
        let statusPembayaran = 'LUNAS';
        let uangDiterima = Number(b.uangDiterima || 0);
        let kembalian = 0;
        let jumlahDibayar = 0;
        let sisaPiutang = 0;

        if (b.metodePembayaran === 'TUNAI') {
          if (uangDiterima <= 0 && !isPartialRequested) {
            return { error: 'Masukkan nominal uang tunai diterima.', status: 400 };
          }
          if (uangDiterima < total) {
            if (!settings.izinkanPembayaranSebagian || !isPartialRequested) {
              return { error: 'Uang tunai diterima kurang dari total tagihan.', status: 400 };
            }
            if (!b.customerId) {
              return { error: 'Pelanggan wajib dipilih untuk transaksi pembayaran sebagian (piutang).', status: 400 };
            }
            statusPembayaran = 'SEBAGIAN';
            jumlahDibayar = uangDiterima;
            sisaPiutang = total - uangDiterima;
            kembalian = 0;
          } else {
            statusPembayaran = 'LUNAS';
            jumlahDibayar = total;
            kembalian = uangDiterima - total;
            sisaPiutang = 0;
          }
        } else {
          // QRIS: MUST NOT auto-mark as LUNAS! Starts as MENUNGGU_PEMBAYARAN
          statusPembayaran = 'MENUNGGU_PEMBAYARAN';
          const payTarget = isPartialRequested && Number(b.nominalBayarQris || 0) > 0 && Number(b.nominalBayarQris) < total
            ? Number(b.nominalBayarQris)
            : total;
          if (payTarget < total && (!settings.izinkanPembayaranSebagian || !b.customerId)) {
            return { error: 'Pembayaran sebagian memerlukan pelanggan terdaftar dan izin pengaturan.', status: 400 };
          }
          uangDiterima = payTarget;
          jumlahDibayar = 0;
          sisaPiutang = total;
          kembalian = 0;
        }

        const noTransaksi = nextRunningNumber(
          'TRX',
          db.Transactions.map((t) => t.noTransaksi)
        );
        const trxId = uuid();

        // Check referral
        let refObj: any = null;
        const refCodeInput = (b.kodeReferral || '').trim().toUpperCase();
        if (refCodeInput) {
          refObj = (db.Mechanic_Referrals || []).find((r: any) => r.kodeReferral?.toUpperCase() === refCodeInput && r.isActive);
        }

        const trx = {
          id: trxId,
          noTransaksi,
          tanggal: now,
          customerId: b.customerId || null,
          pembeliNama: (b.pembeliNama || '').trim(),
          vehicleId: b.vehicleId || null,
          workOrderId: b.workOrderId || null,
          subtotalJasa,
          subtotalSparepart,
          biayaPasang,
          diskon,
          pajakPersen,
          pajakNominal,
          total,
          metodePembayaran: b.metodePembayaran,
          qrisMode: b.metodePembayaran === 'QRIS' ? b.qrisMode || 'STATIS' : null,
          statusPembayaran,
          uangDiterima,
          kembalian,
          jumlahDibayar,
          sisaPiutang,
          namaPetugasKasir,
          akunKasir: 'Kasir',
          kasirId: req.user.id,
          kasirName: 'Kasir',
          referralCode: refObj?.kodeReferral || null,
          referralMechanicId: refObj?.employeeId || null,
          referralMechanicName: refObj?.mechanicName || null,
          catatan: b.catatan || '',
          idempotencyKey: idempKey,
          alasanBatal: '',
          createdAt: now,
        };
        db.Transactions.unshift(trx);

        // Record Referral if applied
        if (refObj) {
          const refNominal = Number(commSettings.defaultReferralNominal || 5000);
          const custObj = b.customerId ? db.Customers.find((c: any) => c.id === b.customerId) : null;
          const custName = custObj?.nama || (b.pembeliNama || '').trim() || 'Pelanggan Umum';
          const vehObj = b.vehicleId ? db.Vehicles.find((v: any) => v.id === b.vehicleId) : null;

          if (!db.Referral_Records) db.Referral_Records = [];
          db.Referral_Records.unshift({
            id: uuid(),
            kodeReferral: refObj.kodeReferral,
            employeeId: refObj.employeeId,
            mechanicName: refObj.mechanicName,
            customerId: b.customerId || null,
            customerName: custName,
            vehiclePlate: vehObj?.noPolisi || null,
            source: 'POS',
            workOrderId: b.workOrderId || null,
            transactionId: trxId,
            serviceSubtotal: subtotalJasa,
            commissionNominal: refNominal,
            status: 'TERPAKAI',
            tanggal: now.slice(0, 10),
            createdAt: now,
          });

          const refComId = uuid();
          const refKodeKomisi = nextRunningNumber('KOM', (db.Mechanic_Commissions || []).map((c: any) => c.kodeKomisi));
          const refComRecord = {
            id: refComId,
            kodeKomisi: refKodeKomisi,
            employeeId: refObj.employeeId,
            mechanicName: refObj.mechanicName,
            workOrderId: b.workOrderId || null,
            noWo: b.workOrderId ? db.Work_Orders.find((w: any) => w.id === b.workOrderId)?.noWo : 'POS',
            transactionId: trxId,
            noTransaksi,
            tipeKomisi: 'REFERRAL_PELANGGAN',
            dasarPerhitungan: refNominal,
            rate: `Flat Rp ${refNominal.toLocaleString('id-ID')}`,
            nominalKomisi: refNominal,
            status: 'TERVERIFIKASI',
            tanggalPengerjaan: now,
            tanggalVerifikasi: now,
            verifikator: 'Sistem Kasir POS',
            tanggalPembayaran: null,
            referensiPembayaran: null,
            keterangan: `Komisi referral pelanggan transaksi kasir ${noTransaksi} (${refObj.kodeReferral})`,
            createdAt: now,
          };

          if (!db.Mechanic_Commissions) db.Mechanic_Commissions = [];
          db.Mechanic_Commissions.unshift(refComRecord);

          db.Commissions.unshift({
            id: refComId,
            tanggal: now,
            mechanicId: refObj.employeeId,
            mechanicName: refObj.mechanicName,
            workOrderId: b.workOrderId || null,
            noWo: 'POS',
            transactionId: trxId,
            dasarJasa: refNominal,
            persentaseAtauTipe: 'Flat Referral',
            nominalKomisi: refNominal,
            status: 'BELUM_DIBAYAR',
            createdAt: now,
          });

          refObj.totalReferralsCount = (Number(refObj.totalReferralsCount) || 0) + 1;
          refObj.totalKomisiEarned = (Number(refObj.totalKomisiEarned) || 0) + refNominal;
        }

        // Save details & deduct stock ONLY where not already deducted by WO
        for (const ri of resolvedItems) {
          db.Transaction_Details.push({
            id: uuid(),
            transactionId: trxId,
            itemType: ri.itemType,
            itemId: ri.itemId,
            namaItem: ri.namaItem,
            qty: ri.qty,
            hargaSatuan: ri.hargaSatuan,
            hargaPokok: ri.hargaPokok,
            subtotal: ri.subtotal,
            mechanicId: ri.mechanicId,
            fromWorkOrder: ri.fromWorkOrder,
            createdAt: now,
          });
          if (ri.itemType === 'sparepart' && !ri.alreadyDeducted) {
            const sp = db.Spareparts.find((s) => s.id === ri.itemId);
            if (sp) {
              const before = Number(sp.stok);
              sp.stok = before - ri.qty;
              if (ri.workOrderPartId) {
                const wp = db.Work_Order_Parts.find((p) => p.id === ri.workOrderPartId);
                if (wp) {
                  wp.dikonfirmasi = true;
                  wp.stockDeducted = true;
                }
              }
              db.Stock_Movements.unshift({
                id: uuid(),
                tanggal: now,
                itemType: 'sparepart',
                itemId: sp.id,
                namaItem: sp.nama,
                tipe: 'KELUAR',
                qty: ri.qty,
                stokSebelum: before,
                stokSesudah: sp.stok,
                referensiTipe: 'POS',
                referensiId: noTransaksi,
                keterangan: `Penjualan kasir POS (${noTransaksi})`,
                idempotencyKey: `${idempKey}-${sp.id}`,
                createdBy: req.user.id,
                createdAt: now,
              });
            }
          }
        }

        // Link Work Order if billed
        if (b.workOrderId) {
          const wo = db.Work_Orders.find((w) => w.id === b.workOrderId);
          if (wo) {
            wo.billedTransactionId = trxId;
            if (statusPembayaran === 'LUNAS') {
              wo.status = 'Sudah diserahkan';
              wo.riwayatStatus.push({
                status: 'Sudah diserahkan',
                waktu: now,
                oleh: `${namaPetugasKasir} (Kasir)`,
              });
              const q = (db.Queue_Records || []).find((qu: any) => qu.workOrderId === wo.id) || db.Queues.find((qu) => qu.workOrderId === wo.id);
              if (q) q.status = 'Selesai';
            }
            if (!wo.commissionGenerated) {
              generateWorkOrderCommissions(db, wo, trxId);
            }
          }
        } else if (statusPembayaran === 'LUNAS' || statusPembayaran === 'SEBAGIAN') {
          // Standalone service commissions
          for (const ri of resolvedItems) {
            if (ri.itemType === 'service' && ri.mechanicId) {
              const emp = db.Employees.find((e) => e.id === ri.mechanicId);
              if (emp && emp.tipeKomisi === 'PERSEN' && emp.nilaiKomisi > 0) {
                const comNom = Math.round((ri.subtotal * emp.nilaiKomisi) / 100);
                const sComId = uuid();
                const sKode = nextRunningNumber('KOM', (db.Mechanic_Commissions || []).map((c: any) => c.kodeKomisi));

                if (!db.Mechanic_Commissions) db.Mechanic_Commissions = [];
                db.Mechanic_Commissions.unshift({
                  id: sComId,
                  kodeKomisi: sKode,
                  employeeId: emp.id,
                  mechanicName: emp.nama,
                  workOrderId: null,
                  noWo: 'POS',
                  transactionId: trxId,
                  noTransaksi,
                  tipeKomisi: 'PENGERJAAN_SERVIS',
                  dasarPerhitungan: ri.subtotal,
                  rate: `${emp.nilaiKomisi}%`,
                  nominalKomisi: comNom,
                  status: 'MENUNGGU',
                  tanggalPengerjaan: now,
                  tanggalVerifikasi: null,
                  verifikator: null,
                  tanggalPembayaran: null,
                  referensiPembayaran: null,
                  keterangan: `Komisi jasa langsung POS (${ri.namaItem})`,
                  createdAt: now,
                });

                db.Commissions.unshift({
                  id: sComId,
                  tanggal: now,
                  mechanicId: emp.id,
                  mechanicName: emp.nama,
                  workOrderId: null,
                  noWo: 'POS',
                  transactionId: trxId,
                  dasarJasa: ri.subtotal,
                  persentaseAtauTipe: `${emp.nilaiKomisi}%`,
                  nominalKomisi: comNom,
                  status: 'BELUM_DIBAYAR',
                  createdAt: now,
                });
              }
            }
          }
        }

        // Payment record
        const qrisRef =
          b.metodePembayaran === 'QRIS'
            ? `QR-${b.qrisMode === 'DINAMIS' ? 'DYN' : 'STC'}-${Date.now().toString().slice(-6)}`
            : '';
        const payment = {
          id: uuid(),
          transactionId: trxId,
          noTransaksi,
          tanggal: now,
          metode: b.metodePembayaran,
          qrisMode: trx.qrisMode,
          qrisRef,
          nominal: b.metodePembayaran === 'TUNAI' ? jumlahDibayar : uangDiterima,
          status: b.metodePembayaran === 'TUNAI' ? 'TERKONFIRMASI' : 'MENUNGGU_KONFIRMASI',
          verifiedBy: b.metodePembayaran === 'TUNAI' ? req.user.nama : '',
          verifiedAt: b.metodePembayaran === 'TUNAI' ? now : null,
          idempotencyKey: `${idempKey}-pay`,
          createdAt: now,
        };
        db.Payments.unshift(payment);

        // Create Accounts Receivable if partial cash payment
        if (b.metodePembayaran === 'TUNAI' && statusPembayaran === 'SEBAGIAN' && sisaPiutang > 0) {
          const cust = db.Customers.find((c) => c.id === b.customerId);
          const veh = db.Vehicles.find((v) => v.id === b.vehicleId);
          const due = new Date();
          due.setDate(due.getDate() + 14);
          db.Accounts_Receivable.unshift({
            id: uuid(),
            transactionId: trxId,
            noTransaksi,
            workOrderId: b.workOrderId || null,
            customerId: b.customerId,
            customerName: cust?.nama || '-',
            vehicleId: b.vehicleId || null,
            noPolisi: veh?.noPolisi || '-',
            totalPiutang: sisaPiutang,
            jumlahDibayar: 0,
            sisaPiutang,
            jatuhTempo: due.toISOString().slice(0, 10),
            status: 'BELUM_LUNAS',
            createdAt: now,
          });
        }

        checkLowStockNotifications(db);
        logActivity(
          db,
          req.user,
          'CREATE_POS_TRANSACTION',
          'Kasir / POS',
          trxId,
          `${noTransaksi} (${b.metodePembayaran}) Rp ${total} - ${statusPembayaran}`
        );

        const responsePayload = { transaction: trx, payment };
        db.Idempotency_Keys[idempKey] = { response: responsePayload, createdAt: now };
        return { status: 201, data: responsePayload };
      });

      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // Confirm QRIS payment (Static manual verification by Cashier OR Dynamic gateway verification)
  app.post(
    '/api/transactions/:id/confirm-qris',
    requireAuth,
    requireRoles('KASIR', 'ADMIN'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { qrisRef, nominalDiterima } = req.body || {};
      const result = await withWriteLock((db) => {
        const trx = db.Transactions.find((t) => t.id === id);
        if (!trx) return { error: 'Transaksi tidak ditemukan.', status: 404 };
        if (trx.metodePembayaran !== 'QRIS') {
          return { error: 'Transaksi ini bukan pembayaran QRIS.', status: 400 };
        }
        if (trx.statusPembayaran === 'LUNAS') {
          return { status: 200, data: trx };
        }

        const now = new Date().toISOString();
        const pay = db.Payments.find((p) => p.transactionId === trx.id && p.status === 'MENUNGGU_KONFIRMASI');
        const paidAmount = Number(nominalDiterima ?? pay?.nominal ?? trx.uangDiterima ?? trx.total);

        if (pay) {
          pay.status = 'TERKONFIRMASI';
          pay.qrisRef = qrisRef || pay.qrisRef;
          pay.verifiedBy =
            trx.qrisMode === 'DINAMIS' ? `Payment Gateway (${req.user.nama})` : req.user.nama;
          pay.verifiedAt = now;
        }

        trx.jumlahDibayar = paidAmount;
        trx.sisaPiutang = Math.max(0, trx.total - paidAmount);
        trx.statusPembayaran = trx.sisaPiutang > 0 ? 'SEBAGIAN' : 'LUNAS';

        if (trx.sisaPiutang > 0 && trx.customerId) {
          const cust = db.Customers.find((c) => c.id === trx.customerId);
          const veh = db.Vehicles.find((v) => v.id === trx.vehicleId);
          const due = new Date();
          due.setDate(due.getDate() + 14);
          db.Accounts_Receivable.unshift({
            id: uuid(),
            transactionId: trx.id,
            noTransaksi: trx.noTransaksi,
            workOrderId: trx.workOrderId,
            customerId: trx.customerId,
            customerName: cust?.nama || '-',
            vehicleId: trx.vehicleId,
            noPolisi: veh?.noPolisi || '-',
            totalPiutang: trx.sisaPiutang,
            jumlahDibayar: 0,
            sisaPiutang: trx.sisaPiutang,
            jatuhTempo: due.toISOString().slice(0, 10),
            status: 'BELUM_LUNAS',
            createdAt: now,
          });
        }

        if (trx.workOrderId && trx.statusPembayaran === 'LUNAS') {
          const wo = db.Work_Orders.find((w) => w.id === trx.workOrderId);
          if (wo) {
            wo.status = 'Sudah diserahkan';
            wo.riwayatStatus.push({ status: 'Sudah diserahkan', waktu: now, oleh: req.user.nama });
            const q = db.Queues.find((qu) => qu.workOrderId === wo.id);
            if (q) q.status = 'Selesai';
          }
        } else if (!trx.workOrderId) {
          const details = db.Transaction_Details.filter(
            (d) => d.transactionId === trx.id && d.itemType === 'service' && d.mechanicId
          );
          for (const d of details) {
            const emp = db.Employees.find((e) => e.id === d.mechanicId);
            if (emp && emp.tipeKomisi === 'PERSEN' && emp.nilaiKomisi > 0) {
              db.Commissions.unshift({
                id: uuid(),
                tanggal: now,
                mechanicId: emp.id,
                mechanicName: emp.nama,
                workOrderId: null,
                noWo: 'POS',
                transactionId: trx.id,
                dasarJasa: d.subtotal,
                persentaseAtauTipe: `${emp.nilaiKomisi}%`,
                nominalKomisi: Math.round((d.subtotal * emp.nilaiKomisi) / 100),
                status: 'BELUM_DIBAYAR',
                createdAt: now,
              });
            }
          }
        }

        logActivity(
          db,
          req.user,
          'CONFIRM_QRIS',
          'Kasir / POS',
          trx.id,
          `QRIS ${trx.qrisMode} terkonfirmasi untuk ${trx.noTransaksi}`
        );
        return { status: 200, data: trx };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.data);
    }
  );

  // Cancel transaction (with reversal stock & audit log, never hard-delete)
  app.post(
    '/api/transactions/:id/cancel',
    requireAuth,
    requireRoles('KASIR', 'ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { alasan } = req.body || {};
      const result = await withWriteLock((db) => {
        const trx = db.Transactions.find((t) => t.id === id);
        if (!trx) return { error: 'Transaksi tidak ditemukan.', status: 404 };
        if (trx.statusPembayaran === 'DIBATALKAN') {
          return { error: 'Transaksi sudah dibatalkan sebelumnya.', status: 400 };
        }
        const now = new Date().toISOString();
        trx.statusPembayaran = 'DIBATALKAN';
        trx.alasanBatal = alasan || 'Dibatalkan oleh pengguna berwenang';

        // Reversal stock for standalone sparepart items
        const details = db.Transaction_Details.filter((d) => d.transactionId === trx.id);
        for (const d of details) {
          if (d.itemType === 'sparepart' && !d.fromWorkOrder) {
            const sp = db.Spareparts.find((s) => s.id === d.itemId);
            if (sp) {
              const before = Number(sp.stok);
              sp.stok = before + Number(d.qty);
              db.Stock_Movements.unshift({
                id: uuid(),
                tanggal: now,
                itemType: 'sparepart',
                itemId: sp.id,
                namaItem: sp.nama,
                tipe: 'PEMBALIKAN',
                qty: Number(d.qty),
                stokSebelum: before,
                stokSesudah: sp.stok,
                referensiTipe: 'ReversalPOS',
                referensiId: trx.noTransaksi,
                keterangan: `Pembalikan stok pembatalan ${trx.noTransaksi}: ${trx.alasanBatal}`,
                idempotencyKey: `rev-${trx.id}-${d.id}`,
                createdBy: req.user.id,
                createdAt: now,
              });
            }
          }
        }

        // Reversal payment record
        db.Payments.unshift({
          id: uuid(),
          transactionId: trx.id,
          noTransaksi: trx.noTransaksi,
          tanggal: now,
          metode: trx.metodePembayaran,
          qrisMode: trx.qrisMode,
          qrisRef: 'REVERSAL',
          nominal: -Number(trx.jumlahDibayar || 0),
          status: 'REVERSAL',
          verifiedBy: req.user.nama,
          verifiedAt: now,
          idempotencyKey: `rev-pay-${trx.id}`,
          createdAt: now,
        });

        logActivity(
          db,
          req.user,
          'CANCEL_TRANSACTION',
          'Riwayat Transaksi',
          trx.id,
          `Membatalkan ${trx.noTransaksi}: ${trx.alasanBatal}`
        );
        return { status: 200, data: trx };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.data);
    }
  );

  // =========================================================================
  // TUTUP KAS HARIAN
  // =========================================================================
  app.post(
    '/api/cash-closings',
    requireAuth,
    requireRoles('KASIR', 'ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const b = req.body || {};
      const result = await withWriteLock((db) => {
        const now = new Date().toISOString();
        const today = b.tanggal || now.slice(0, 10);
        const todayTrx = db.Transactions.filter(
          (t) => t.tanggal.slice(0, 10) === today && t.statusPembayaran !== 'DIBATALKAN'
        );
        const totalTunai = todayTrx
          .filter((t) => t.metodePembayaran === 'TUNAI')
          .reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
        const totalQris = todayTrx
          .filter((t) => t.metodePembayaran === 'QRIS' && t.statusPembayaran !== 'MENUNGGU_PEMBAYARAN')
          .reduce((s, t) => s + Number(t.jumlahDibayar || 0), 0);
        const modalAwal = Number(b.modalAwal || 0);
        const seharusnya = modalAwal + totalTunai;
        const aktual = Number(b.uangTunaiAktual || 0);
        const closing = {
          id: uuid(),
          tanggal: today,
          kasirId: req.user.id,
          kasirName: req.user.nama,
          waktuBuka: b.waktuBuka || `${today} 08:00`,
          waktuTutup: now,
          totalTransaksi: todayTrx.length,
          totalTunai,
          totalQris,
          totalPendapatan: totalTunai + totalQris,
          modalAwal,
          uangTunaiSeharusnya: seharusnya,
          uangTunaiAktual: aktual,
          selisihKas: aktual - seharusnya,
          catatan: b.catatan || '',
          createdAt: now,
        };
        db.Cash_Closings.unshift(closing);
        logActivity(
          db,
          req.user,
          'CASH_CLOSING',
          'Tutup Kas',
          closing.id,
          `Tutup kas ${today} oleh ${req.user.nama}, selisih Rp ${closing.selisihKas}`
        );
        return closing;
      });
      res.status(201).json(result);
    }
  );

  // =========================================================================
  // PURCHASES & RECEIVING STOCK
  // =========================================================================
  app.post(
    '/api/purchases',
    requireAuth,
    requireRoles('ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const b = req.body || {};
      const namaPetugasPembelian = (b.namaPetugasPembelian || '').trim();
      if (!namaPetugasPembelian) {
        res.status(400).json({ error: 'Nama Petugas Pembelian wajib diisi.' });
        return;
      }
      if (!b.supplierId || !Array.isArray(b.items) || b.items.length === 0) {
        res.status(400).json({ error: 'Supplier dan daftar barang pembelian wajib diisi.' });
        return;
      }
      const result = await withWriteLock((db) => {
        const sup = db.Suppliers.find((s) => s.id === b.supplierId);
        if (!sup) return { error: 'Supplier tidak ditemukan.', status: 404 };
        const now = new Date().toISOString();
        const noPembelian = nextRunningNumber(
          'PO',
          db.Purchases.map((p) => p.noPembelian)
        );
        const purId = uuid();
        let subtotal = 0;
        const details: any[] = [];
        for (const it of b.items) {
          const qty = Math.max(1, Number(it.qtyPesan || 1));
          const price = Number(it.hargaBeli || 0);
          const sub = qty * price;
          subtotal += sub;
          details.push({
            id: uuid(),
            purchaseId: purId,
            itemType: it.itemType || 'sparepart',
            itemId: it.itemId,
            namaItem: it.namaItem,
            qtyPesan: qty,
            qtyDiterima: 0,
            hargaBeli: price,
            subtotal: sub,
            createdAt: now,
          });
        }
        const diskon = Number(b.diskon || 0);
        const total = Math.max(0, subtotal - diskon);
        const paid = Number(b.jumlahDibayar || 0);
        const statusPembayaran =
          paid >= total ? 'LUNAS' : paid > 0 ? 'SEBAGIAN' : 'BELUM_LUNAS';

        const purchase = {
          id: purId,
          noPembelian,
          tanggal: b.tanggal || now,
          supplierId: sup.id,
          supplierName: sup.nama,
          namaPetugasPembelian,
          diskon,
          total,
          statusPembayaran,
          jumlahDibayar: Math.min(paid, total),
          jatuhTempo: b.jatuhTempo || now.slice(0, 10),
          statusPenerimaan: b.statusPenerimaan === 'Draft' ? 'Draft' : 'Dipesan',
          buktiPembelian: b.buktiPembelian || '',
          catatan: b.catatan || '',
          createdBy: req.user.id,
          createdAt: now,
        };
        db.Purchases.unshift(purchase);
        db.Purchase_Details.push(...details);

        // Credit / partial purchase creates Accounts_Payable
        if (total - purchase.jumlahDibayar > 0) {
          db.Accounts_Payable.unshift({
            id: uuid(),
            purchaseId: purId,
            noPembelian,
            supplierId: sup.id,
            supplierName: sup.nama,
            totalUtang: total,
            jumlahDibayar: purchase.jumlahDibayar,
            sisaUtang: total - purchase.jumlahDibayar,
            jatuhTempo: purchase.jatuhTempo,
            status: purchase.jumlahDibayar > 0 ? 'SEBAGIAN' : 'BELUM_LUNAS',
            createdAt: now,
          });
        }

        logActivity(
          db,
          req.user,
          'CREATE_PURCHASE',
          'Pembelian',
          purId,
          `Membuat pesanan pembelian ${noPembelian} (${purchase.statusPenerimaan})`
        );
        return { status: 201, data: { purchase, details } };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // Receive purchased goods -> increases stock by actually received quantity ONLY
  app.post(
    '/api/purchases/:id/receive',
    requireAuth,
    requireRoles('ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { receivedItems } = req.body || {};
      const result = await withWriteLock((db) => {
        const pur = db.Purchases.find((p) => p.id === id);
        if (!pur) return { error: 'Pembelian tidak ditemukan.', status: 404 };
        if (pur.statusPenerimaan === 'Dibatalkan') {
          return { error: 'Pembelian sudah dibatalkan.', status: 400 };
        }
        const details = db.Purchase_Details.filter((d) => d.purchaseId === id);
        const now = new Date().toISOString();

        for (const rec of receivedItems || []) {
          const det = details.find((d) => d.id === rec.detailId);
          if (!det) continue;
          const addQty = Math.max(0, Number(rec.qtyBaruDiterima || 0));
          const maxAdd = Math.max(0, Number(det.qtyPesan) - Number(det.qtyDiterima));
          const actualAdd = Math.min(addQty, maxAdd);
          if (actualAdd <= 0) continue;

          det.qtyDiterima = Number(det.qtyDiterima) + actualAdd;
          if (det.itemType === 'material') {
            const mat = db.Materials.find((m) => m.id === det.itemId);
            if (mat) {
              const before = Number(mat.stok);
              mat.stok = before + actualAdd;
              db.Stock_Movements.unshift({
                id: uuid(),
                tanggal: now,
                itemType: 'material',
                itemId: mat.id,
                namaItem: mat.nama,
                tipe: 'MASUK',
                qty: actualAdd,
                stokSebelum: before,
                stokSesudah: mat.stok,
                referensiTipe: 'Purchase',
                referensiId: pur.noPembelian,
                keterangan: `Penerimaan barang pembelian ${pur.noPembelian}`,
                idempotencyKey: `rec-${det.id}-${det.qtyDiterima}`,
                createdBy: req.user.id,
                createdAt: now,
              });
            }
          } else {
            const sp = db.Spareparts.find((s) => s.id === det.itemId);
            if (sp) {
              const before = Number(sp.stok);
              sp.stok = before + actualAdd;
              db.Stock_Movements.unshift({
                id: uuid(),
                tanggal: now,
                itemType: 'sparepart',
                itemId: sp.id,
                namaItem: sp.nama,
                tipe: 'MASUK',
                qty: actualAdd,
                stokSebelum: before,
                stokSesudah: sp.stok,
                referensiTipe: 'Purchase',
                referensiId: pur.noPembelian,
                keterangan: `Penerimaan barang pembelian ${pur.noPembelian}`,
                idempotencyKey: `rec-${det.id}-${det.qtyDiterima}`,
                createdBy: req.user.id,
                createdAt: now,
              });
            }
          }
        }

        const allDone = details.every((d) => Number(d.qtyDiterima) >= Number(d.qtyPesan));
        const anyReceived = details.some((d) => Number(d.qtyDiterima) > 0);
        pur.statusPenerimaan = allDone ? 'Diterima' : anyReceived ? 'Sebagian diterima' : pur.statusPenerimaan;

        logActivity(
          db,
          req.user,
          'RECEIVE_PURCHASE',
          'Pembelian',
          pur.id,
          `Penerimaan barang ${pur.noPembelian} (${pur.statusPenerimaan})`
        );
        return { status: 200, data: { purchase: pur, details } };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.data);
    }
  );

  // =========================================================================
  // UTANG & PIUTANG PAYMENTS
  // =========================================================================
  app.post(
    '/api/payables/:id/pay',
    requireAuth,
    requireRoles('ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { nominal, metode, referensi, catatan } = req.body || {};
      const result = await withWriteLock((db) => {
        const ap = db.Accounts_Payable.find((a) => a.id === id);
        if (!ap) return { error: 'Catatan utang tidak ditemukan.', status: 404 };
        const amount = Number(nominal || 0);
        if (amount <= 0 || amount > ap.sisaUtang) {
          return { error: `Nominal pembayaran harus antara Rp 1 dan Rp ${ap.sisaUtang}.`, status: 400 };
        }
        const now = new Date().toISOString();
        ap.jumlahDibayar = Number(ap.jumlahDibayar) + amount;
        ap.sisaUtang = Math.max(0, Number(ap.totalUtang) - ap.jumlahDibayar);
        ap.status = ap.sisaUtang === 0 ? 'LUNAS' : 'SEBAGIAN';

        const pur = db.Purchases.find((p) => p.id === ap.purchaseId);
        if (pur) {
          pur.jumlahDibayar = ap.jumlahDibayar;
          pur.statusPembayaran = ap.status;
        }

        const pay = {
          id: uuid(),
          payableId: ap.id,
          tanggal: now,
          nominal: amount,
          metode: metode || 'TUNAI',
          referensi: referensi || '',
          catatan: catatan || '',
          createdBy: req.user.id,
          idempotencyKey: uuid(),
          createdAt: now,
        };
        db.Payable_Payments.unshift(pay);
        logActivity(db, req.user, 'PAY_PAYABLE', 'Utang Supplier', ap.id, `Bayar utang ${ap.noPembelian} Rp ${amount}`);
        return { status: 201, data: { payable: ap, payment: pay } };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  app.post(
    '/api/receivables/:id/pay',
    requireAuth,
    requireRoles('KASIR', 'ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const { nominal, metode, qrisMode, qrisVerified, catatan } = req.body || {};
      if (!['TUNAI', 'QRIS'].includes(metode)) {
        res.status(400).json({ error: 'Pembayaran piutang pelanggan hanya diizinkan menggunakan TUNAI atau QRIS.' });
        return;
      }
      if (metode === 'QRIS' && !qrisVerified) {
        res.status(400).json({ error: 'Pembayaran QRIS piutang wajib dikonfirmasi terlebih dahulu.' });
        return;
      }
      const result = await withWriteLock((db) => {
        const ar = db.Accounts_Receivable.find((a) => a.id === id);
        if (!ar) return { error: 'Catatan piutang tidak ditemukan.', status: 404 };
        const amount = Number(nominal || 0);
        if (amount <= 0 || amount > ar.sisaPiutang) {
          return { error: `Nominal cicilan harus antara Rp 1 dan Rp ${ar.sisaPiutang}.`, status: 400 };
        }
        const now = new Date().toISOString();
        ar.jumlahDibayar = Number(ar.jumlahDibayar) + amount;
        ar.sisaPiutang = Math.max(0, Number(ar.totalPiutang) - ar.jumlahDibayar);
        ar.status = ar.sisaPiutang === 0 ? 'LUNAS' : 'SEBAGIAN';

        const trx = db.Transactions.find((t) => t.id === ar.transactionId);
        if (trx) {
          trx.jumlahDibayar = Number(trx.jumlahDibayar) + amount;
          trx.sisaPiutang = ar.sisaPiutang;
          if (ar.sisaPiutang === 0) trx.statusPembayaran = 'LUNAS';
        }

        const pay = {
          id: uuid(),
          receivableId: ar.id,
          tanggal: now,
          nominal: amount,
          metode,
          qrisMode: metode === 'QRIS' ? qrisMode || 'STATIS' : null,
          status: 'TERKONFIRMASI',
          catatan: catatan || '',
          createdBy: req.user.id,
          idempotencyKey: uuid(),
          createdAt: now,
        };
        db.Receivable_Payments.unshift(pay);
        logActivity(db, req.user, 'PAY_RECEIVABLE', 'Piutang Pelanggan', ar.id, `Cicilan piutang ${ar.noTransaksi} (${metode}) Rp ${amount}`);
        return { status: 201, data: { receivable: ar, payment: pay } };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // =========================================================================
  // STOCK OPNAME
  // =========================================================================
  app.post(
    '/api/inventory/opname',
    requireAuth,
    requireRoles('ADMIN', 'OWNER'),
    async (req: AuthedRequest, res) => {
      const { itemType, itemId, stokFisik, keterangan } = req.body || {};
      const result = await withWriteLock((db) => {
        const list = itemType === 'material' ? db.Materials : db.Spareparts;
        const item = list.find((i) => i.id === itemId);
        if (!item) return { error: 'Item tidak ditemukan.', status: 404 };
        const fisik = Math.max(0, Number(stokFisik));
        const before = Number(item.stok);
        const diff = fisik - before;
        item.stok = fisik;
        const now = new Date().toISOString();
        const mov = {
          id: uuid(),
          tanggal: now,
          itemType: itemType === 'material' ? 'material' : 'sparepart',
          itemId: item.id,
          namaItem: item.nama,
          tipe: 'PENYESUAIAN',
          qty: Math.abs(diff),
          stokSebelum: before,
          stokSesudah: fisik,
          referensiTipe: 'StokOpname',
          referensiId: `OPN-${formatCodeDate()}`,
          keterangan: keterangan || `Stok opname (selisih ${diff >= 0 ? '+' : ''}${diff})`,
          idempotencyKey: uuid(),
          createdBy: req.user.id,
          createdAt: now,
        };
        db.Stock_Movements.unshift(mov);
        checkLowStockNotifications(db);
        logActivity(db, req.user, 'STOCK_OPNAME', 'Stok Opname', item.id, `${item.nama}: ${before} -> ${fisik}`);
        return { status: 201, data: { item, movement: mov } };
      });
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    }
  );

  // =========================================================================
  // =========================================================================
  // GENERIC CRUD FOR MASTER & OPERATIONAL TABLES WITH STRICT RBAC
  // =========================================================================
  const crudTableConfig: Record<string, { readRoles: string[]; writeRoles: string[] }> = {
    Services: { readRoles: ['*'], writeRoles: ['OWNER', 'ADMIN'] },
    Customers: { readRoles: ['ADMIN', 'KASIR', 'OWNER', 'MEKANIK'], writeRoles: ['ADMIN', 'KASIR', 'OWNER'] },
    Vehicles: { readRoles: ['*'], writeRoles: ['ADMIN', 'KASIR', 'PELANGGAN', 'OWNER'] },
    Employees: { readRoles: ['ADMIN', 'OWNER', 'KASIR', 'MEKANIK'], writeRoles: ['ADMIN', 'OWNER'] },
    Spareparts: { readRoles: ['*'], writeRoles: ['ADMIN', 'OWNER'] },
    Materials: { readRoles: ['ADMIN', 'OWNER', 'MEKANIK', 'KASIR'], writeRoles: ['ADMIN', 'OWNER'] },
    Suppliers: { readRoles: ['ADMIN', 'OWNER'], writeRoles: ['ADMIN', 'OWNER'] },
    Expenses: { readRoles: ['ADMIN', 'OWNER', 'KASIR'], writeRoles: ['ADMIN', 'OWNER', 'KASIR'] },
    Appointments: { readRoles: ['*'], writeRoles: ['*'] },
    Queues: { readRoles: ['*'], writeRoles: ['ADMIN', 'KASIR'] },
    Shifts: { readRoles: ['ADMIN', 'OWNER', 'MEKANIK', 'KASIR'], writeRoles: ['ADMIN', 'OWNER'] },
    Attendance: { readRoles: ['ADMIN', 'OWNER', 'MEKANIK', 'KASIR'], writeRoles: ['ADMIN', 'OWNER', 'MEKANIK', 'KASIR'] },
    Warranties: { readRoles: ['*'], writeRoles: ['ADMIN', 'KASIR'] },
    Commissions: { readRoles: ['ADMIN', 'OWNER', 'MEKANIK'], writeRoles: ['OWNER'] },
    Mechanic_Referrals: { readRoles: ['ADMIN', 'OWNER', 'MEKANIK'], writeRoles: ['ADMIN', 'OWNER'] },
    Commission_Settings: { readRoles: ['ADMIN', 'OWNER'], writeRoles: ['OWNER'] },
    Service_Duration_Settings: { readRoles: ['*'], writeRoles: ['OWNER', 'ADMIN'] },
  };

  app.post('/api/tables/:table', requireAuth, async (req: AuthedRequest, res) => {
    const { table } = req.params;
    const cfg = crudTableConfig[table];
    if (!cfg) {
      res.status(400).json({ error: 'Tabel tidak diizinkan untuk operasi CRUD langsung.' });
      return;
    }
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    if (!cfg.writeRoles.includes('*') && !cfg.writeRoles.includes(roleCode)) {
      res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk menambah data di modul ini.' });
      return;
    }

    const result = await withWriteLock((d) => {
      const arr = (d as any)[table] as any[];
      const now = new Date().toISOString();
      const payload = { ...(req.body || {}) };
      if (!payload.id) payload.id = uuid();
      payload.createdAt = now;

      if (table === 'Appointments') {
        payload.noBooking = nextRunningNumber('RSV', d.Appointments.map((a) => a.noBooking));
        payload.status = payload.status || 'Menunggu';
        payload.createdBy = req.user.id;
        if (roleCode === 'PELANGGAN' && req.user.customerId) {
          payload.customerId = req.user.customerId;
        }
        pushNotification(
          d,
          'NEW_BOOKING',
          'Booking Servis Baru',
          `Reservasi ${payload.noBooking} untuk tanggal ${payload.tanggalBooking} ${payload.jamBooking}.`,
          'Appointment',
          payload.id
        );
      }
      if (table === 'Vehicles' && roleCode === 'PELANGGAN' && req.user.customerId) {
        payload.customerId = req.user.customerId;
      }
      if (table === 'Expenses') {
        payload.createdBy = req.user.id;
        payload.createdByName = req.user.nama;
      }
      if (table === 'Customers' && !payload.kode) {
        payload.kode = `PLG-${String(d.Customers.length + 1).padStart(3, '0')}`;
        payload.tanggalBergabung = now.slice(0, 10);
      }
      if (table === 'Employees' && !payload.kode) {
        payload.kode = `PEG-${String(d.Employees.length + 1).padStart(3, '0')}`;
      }
      if (table === 'Services') {
        if (!String(payload.nama || '').trim()) {
          return { error: 'Nama layanan servis wajib diisi.', status: 400 };
        }
        if (!payload.kode) {
          let maxNum = d.Services.length;
          for (const s of d.Services) {
            if (typeof s.kode === 'string' && s.kode.startsWith('SRV-')) {
              const n = parseInt(s.kode.slice(4), 10);
              if (!isNaN(n) && n > maxNum) maxNum = n;
            }
          }
          payload.kode = `SRV-${String(maxNum + 1).padStart(3, '0')}`;
        }
        // Auto-create Service_Duration_Settings entry
        if (!d.Service_Duration_Settings) d.Service_Duration_Settings = [];
        d.Service_Duration_Settings.push({
          id: `sds-${payload.id}`,
          serviceId: payload.id,
          serviceCode: payload.kode,
          serviceName: payload.nama,
          categoryName: payload.categoryName || 'Layanan Servis',
          durasiStandarMenit: Number(payload.durasiStandarMenit || payload.estimasiMenit || 45),
          toleransiMenit: Number(payload.toleransiMenit || 15),
          keterangan: payload.keterangan || `Durasi standar ${payload.nama}`,
          updatedAt: now,
        });
      }
      if (table === 'Suppliers' && !payload.kode) {
        payload.kode = `SUP-${String(d.Suppliers.length + 1).padStart(3, '0')}`;
      }

      arr.unshift(payload);
      logActivity(d, req.user, `CREATE_${table.toUpperCase()}`, table, payload.id, `Menambahkan data pada ${table}`);
      return payload;
    });

    if (result?.error) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.put('/api/tables/:table/:id', requireAuth, async (req: AuthedRequest, res) => {
    const { table, id } = req.params;
    const cfg = crudTableConfig[table];
    if (!cfg) {
      res.status(400).json({ error: 'Tabel tidak diizinkan.' });
      return;
    }
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    if (!cfg.writeRoles.includes('*') && !cfg.writeRoles.includes(roleCode)) {
      res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk mengubah data ini.' });
      return;
    }
    const result = await withWriteLock((d) => {
      const arr = (d as any)[table] as any[];
      const idx = arr.findIndex((item) => item.id === id);
      if (idx === -1) return { error: 'Data tidak ditemukan.', status: 404 };
      const existing = arr[idx];
      if (table === 'Appointments' && roleCode === 'PELANGGAN' && existing.customerId !== req.user.customerId) {
        return { error: 'Akses ditolak.', status: 403 };
      }
      arr[idx] = { ...existing, ...(req.body || {}), id };

      if (table === 'Services') {
        const sds = (d.Service_Duration_Settings || []).find((s: any) => s.serviceId === id);
        if (sds) {
          if (req.body.nama) sds.serviceName = req.body.nama;
          if (req.body.durasiStandarMenit || req.body.estimasiMenit) {
            sds.durasiStandarMenit = Number(req.body.durasiStandarMenit || req.body.estimasiMenit);
          }
          if (req.body.toleransiMenit) sds.toleransiMenit = Number(req.body.toleransiMenit);
          sds.updatedAt = new Date().toISOString();
        }
      }

      logActivity(d, req.user, `UPDATE_${table.toUpperCase()}`, table, id, `Memperbarui data pada ${table}`);
      return { status: 200, data: arr[idx] };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.delete('/api/tables/:table/:id', requireAuth, async (req: AuthedRequest, res) => {
    const { table, id } = req.params;
    const cfg = crudTableConfig[table];
    if (!cfg) {
      res.status(400).json({ error: 'Tabel tidak diizinkan.' });
      return;
    }
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    if (!cfg.writeRoles.includes('*') && !cfg.writeRoles.includes(roleCode)) {
      res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk menghapus data ini.' });
      return;
    }
    if (table === 'Services' && roleCode === 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Admin tidak memiliki kewenangan menghapus layanan servis operasional.' });
      return;
    }
    const result = await withWriteLock((d) => {
      const arr = (d as any)[table] as any[];
      const idx = arr.findIndex((item) => item.id === id);
      if (idx === -1) return { error: 'Data tidak ditemukan.', status: 404 };
      arr.splice(idx, 1);
      if (table === 'Services') {
        const sdsIdx = (d.Service_Duration_Settings || []).findIndex((s: any) => s.serviceId === id);
        if (sdsIdx !== -1) d.Service_Duration_Settings.splice(sdsIdx, 1);
      }
      logActivity(d, req.user, `DELETE_${table.toUpperCase()}`, table, id, `Menghapus data pada ${table}`);
      return { status: 200, success: true };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ success: true });
  });

  // =========================================================================
  // FITUR 1: SISTEM KODE REFERRAL MEKANIK
  // =========================================================================
  app.post('/api/referrals/validate', requireAuth, async (req: AuthedRequest, res) => {
    const { kode } = req.body || {};
    if (!kode || !String(kode).trim()) {
      res.status(400).json({ valid: false, message: 'Masukkan kode referral mekanik.' });
      return;
    }
    const clean = String(kode).trim().toUpperCase();
    const db = loadDb();
    const ref = (db.Mechanic_Referrals || []).find((r: any) => r.kodeReferral?.toUpperCase() === clean);
    if (!ref) {
      res.status(404).json({ valid: false, message: `Kode referral "${clean}" tidak ditemukan.` });
      return;
    }
    if (!ref.isActive) {
      res.status(400).json({ valid: false, message: `Kode referral "${clean}" saat ini dinonaktifkan oleh Admin.` });
      return;
    }
    const emp = db.Employees.find((e) => e.id === ref.employeeId);
    res.json({
      valid: true,
      referral: {
        id: ref.id,
        kodeReferral: ref.kodeReferral,
        employeeId: ref.employeeId,
        mechanicName: ref.mechanicName,
        keahlian: emp?.keahlian || 'Mekanik Bengkel',
        jabatan: emp?.jabatan || 'Teknisi',
      },
    });
  });

  app.get('/api/referrals/mechanics', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const roleCode = getUserRoleCode(db, req.user);
    if (roleCode === 'MEKANIK') {
      const own = (db.Mechanic_Referrals || []).filter((r: any) => r.employeeId === req.user.employeeId);
      res.json(own);
      return;
    }
    res.json(db.Mechanic_Referrals || []);
  });

  app.patch('/api/referrals/:id/toggle', requireAuth, requireRoles('OWNER', 'ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { isActive } = req.body || {};
    const result = await withWriteLock((db) => {
      const ref = (db.Mechanic_Referrals || []).find((r: any) => r.id === id);
      if (!ref) return { error: 'Data referral tidak ditemukan.', status: 404 };
      ref.isActive = typeof isActive === 'boolean' ? isActive : !ref.isActive;
      ref.updatedAt = new Date().toISOString();
      logActivity(db, req.user, 'TOGGLE_REFERRAL', 'Referral Mekanik', ref.id, `Status referral ${ref.kodeReferral} diubah menjadi ${ref.isActive ? 'Aktif' : 'Nonaktif'}`);
      return { status: 200, data: ref };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  // =========================================================================
  // FITUR 2: SISTEM KOMISI MEKANIK (SETTINGS & PAYOUT WORKFLOW)
  // =========================================================================
  app.get('/api/commissions/settings', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    res.json(db.Commission_Settings?.[0] || {
      defaultReferralNominal: 5000,
      defaultServiceCommissionPercent: 30,
      monthlyServiceTarget: 35,
      targetBonusNominal: 150000,
      syaratPencairanMinimal: 50000,
    });
  });

  app.put('/api/commissions/settings', requireAuth, requireRoles('OWNER'), async (req: AuthedRequest, res) => {
    const b = req.body || {};
    const result = await withWriteLock((db) => {
      if (!db.Commission_Settings || db.Commission_Settings.length === 0) {
        db.Commission_Settings = [{ id: 'cset-1' }];
      }
      const s = db.Commission_Settings[0];
      if (b.defaultReferralNominal !== undefined) s.defaultReferralNominal = Math.max(0, Number(b.defaultReferralNominal));
      if (b.defaultServiceCommissionPercent !== undefined) s.defaultServiceCommissionPercent = Math.min(100, Math.max(0, Number(b.defaultServiceCommissionPercent)));
      if (b.monthlyServiceTarget !== undefined) s.monthlyServiceTarget = Math.max(0, Number(b.monthlyServiceTarget));
      if (b.targetBonusNominal !== undefined) s.targetBonusNominal = Math.max(0, Number(b.targetBonusNominal));
      if (b.syaratPencairanMinimal !== undefined) s.syaratPencairanMinimal = Math.max(0, Number(b.syaratPencairanMinimal));
      s.updatedBy = req.user.nama;
      s.updatedAt = new Date().toISOString();
      logActivity(db, req.user, 'UPDATE_COMMISSION_SETTINGS', 'Komisi', s.id, 'Memperbarui aturan komisi bengkel');
      return { status: 200, data: s };
    });
    res.json(result.data);
  });

  app.post('/api/commissions/:id/verify', requireAuth, requireRoles('OWNER'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const result = await withWriteLock((db) => {
      const c = (db.Mechanic_Commissions || []).find((x: any) => x.id === id);
      if (!c) return { error: 'Komisi tidak ditemukan.', status: 404 };
      c.status = 'SIAP_DIBAYARKAN';
      c.tanggalVerifikasi = new Date().toISOString();
      c.verifikator = req.user.nama;
      logActivity(db, req.user, 'VERIFY_COMMISSION', 'Komisi', c.id, `Verifikasi komisi ${c.kodeKomisi} Rp ${c.nominalKomisi}`);
      return { status: 200, data: c };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/commissions/:id/pay', requireAuth, requireRoles('OWNER'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { referensiPembayaran } = req.body || {};
    const result = await withWriteLock((db) => {
      const c = (db.Mechanic_Commissions || []).find((x: any) => x.id === id);
      if (!c) return { error: 'Komisi tidak ditemukan.', status: 404 };
      const now = new Date().toISOString();
      c.status = 'SUDAH_DIBAYARKAN';
      c.tanggalPembayaran = now;
      c.referensiPembayaran = referensiPembayaran || `PAY-KOM-${Date.now()}`;

      // sync legacy
      const leg = db.Commissions.find((x) => x.id === id);
      if (leg) leg.status = 'DIBAYAR';

      logActivity(db, req.user, 'PAY_COMMISSION', 'Komisi', c.id, `Membayar komisi ${c.kodeKomisi} Rp ${c.nominalKomisi}`);
      return { status: 200, data: c };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/commissions/batch-pay', requireAuth, requireRoles('OWNER'), async (req: AuthedRequest, res) => {
    const { ids, referensiPembayaran } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Pilih minimal satu komisi untuk dibayarkan.' });
      return;
    }
    const result = await withWriteLock((db) => {
      const now = new Date().toISOString();
      const ref = referensiPembayaran || `BATCH-PAY-${Date.now()}`;
      let paidCount = 0;
      let totalAmount = 0;
      for (const id of ids) {
        const c = (db.Mechanic_Commissions || []).find((x: any) => x.id === id);
        if (c && c.status !== 'SUDAH_DIBAYARKAN') {
          c.status = 'SUDAH_DIBAYARKAN';
          c.tanggalPembayaran = now;
          c.referensiPembayaran = ref;
          paidCount++;
          totalAmount += Number(c.nominalKomisi || 0);

          const leg = db.Commissions.find((x) => x.id === id);
          if (leg) leg.status = 'DIBAYAR';
        }
      }
      logActivity(db, req.user, 'BATCH_PAY_COMMISSIONS', 'Komisi', ref, `Bayar ${paidCount} komisi total Rp ${totalAmount}`);
      return { status: 200, data: { paidCount, totalAmount, ref } };
    });
    res.json(result.data);
  });

  // =========================================================================
  // FITUR 3: ESTIMASI WAKTU ANTREAN SERVIS (DYNAMIC CAPACITY)
  // =========================================================================
  app.get('/api/queues/active-estimates', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const activeMechanics = db.Employees.filter((e) => e.statusAktif && e.jabatan.toLowerCase().includes('mekanik')).length || 1;
    const activeQueues = (db.Queue_Records || []).filter((q: any) => !['Selesai', 'Dibatalkan'].includes(q.status));

    const sorted = [...activeQueues].sort((a: any, b: any) => {
      const pMap: Record<string, number> = { DARURAT: 3, TINGGI: 2, NORMAL: 1 };
      const diffP = (pMap[b.priority] || 1) - (pMap[a.priority] || 1);
      if (diffP !== 0) return diffP;
      return new Date(a.waktuAmbil || a.createdAt).getTime() - new Date(b.waktuAmbil || b.createdAt).getTime();
    });

    let cumulativeMinutes = 0;
    const now = new Date();
    const estimates = sorted.map((q: any, idx: number) => {
      const waitMinutes = Math.round(cumulativeMinutes / activeMechanics);
      const estStartTime = new Date(now.getTime() + waitMinutes * 60000);
      const dur = Number(q.estimatedDurationMinutes || 45);
      const estEndTime = new Date(estStartTime.getTime() + dur * 60000);
      cumulativeMinutes += dur;

      const formatTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return {
        ...q,
        vehiclesAhead: idx,
        estimatedStartTimeFormatted: formatTime(estStartTime),
        estimatedEndTimeFormatted: formatTime(estEndTime),
      };
    });

    res.json({
      activeMechanics,
      totalActiveQueues: sorted.length,
      disclaimer: 'Estimasi waktu dapat berubah tergantung kompleksitas pengerjaan motor di depan Anda.',
      queues: estimates,
    });
  });

  app.post('/api/queues/:id/call', requireAuth, requireRoles('KASIR', 'ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const result = await withWriteLock((db) => {
      const q = (db.Queue_Records || []).find((x: any) => x.id === id);
      if (!q) return { error: 'Antrean tidak ditemukan.', status: 404 };
      const now = new Date().toISOString();
      q.callCount = (Number(q.callCount) || 0) + 1;
      q.lastCalledAt = now;
      q.status = 'Dipanggil';

      const leg = db.Queues.find((x) => x.id === id);
      if (leg) leg.status = 'Dipanggil';

      pushNotification(
        db,
        'QUEUE_CALLED',
        'Panggilan Antrean',
        `Antrean ${q.nomorAntrean} (${q.vehiclePlate}) dipanggil ke Pit Servis (Panggilan ke-${q.callCount}).`,
        'Queue',
        q.id
      );
      return { status: 200, data: q };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/queues/:id/start', requireAuth, requireRoles('KASIR', 'ADMIN', 'MEKANIK'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const result = await withWriteLock((db) => {
      const q = (db.Queue_Records || []).find((x: any) => x.id === id);
      if (!q) return { error: 'Antrean tidak ditemukan.', status: 404 };
      const now = new Date().toISOString();
      q.status = 'Sedang diservis';

      const leg = db.Queues.find((x) => x.id === id);
      if (leg) leg.status = 'Sedang dikerjakan';

      if (q.workOrderId) {
        const wo = db.Work_Orders.find((w) => w.id === q.workOrderId);
        if (wo && wo.status === 'Menunggu pemeriksaan') {
          wo.status = 'Sedang dikerjakan';
          wo.riwayatStatus.push({ status: 'Sedang dikerjakan', waktu: now, oleh: req.user.nama });
        }
        let str = (db.Service_Time_Records || []).find((r: any) => r.workOrderId === q.workOrderId);
        if (str && !str.waktuMulaiAktual) {
          str.waktuMulaiAktual = now;
        }
      }
      return { status: 200, data: q };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/queues/:id/priority', requireAuth, requireRoles('KASIR', 'ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { priority } = req.body || {};
    if (!['NORMAL', 'TINGGI', 'DARURAT'].includes(priority)) {
      res.status(400).json({ error: 'Prioritas harus NORMAL, TINGGI, atau DARURAT.' });
      return;
    }
    const result = await withWriteLock((db) => {
      const q = (db.Queue_Records || []).find((x: any) => x.id === id);
      if (!q) return { error: 'Antrean tidak ditemukan.', status: 404 };
      q.priority = priority;
      return { status: 200, data: q };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  // =========================================================================
  // FITUR 4: ESTIMASI DURASI & SERVICE TIME TRACKER (PAUSE/RESUME & EXTENSION)
  // =========================================================================
  app.post('/api/work-orders/:id/time-pause', requireAuth, requireRoles('MEKANIK', 'ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    const result = await withWriteLock((db) => {
      const wo = db.Work_Orders.find((w) => w.id === id);
      if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };
      if (!db.Service_Time_Records) db.Service_Time_Records = [];
      let str = db.Service_Time_Records.find((r: any) => r.workOrderId === wo.id);
      const now = new Date().toISOString();
      if (!str) {
        str = {
          id: uuid(),
          workOrderId: wo.id,
          noWo: wo.noWo,
          waktuMasuk: wo.createdAt,
          waktuAntrean: wo.createdAt,
          waktuDipanggil: now,
          waktuMulaiAktual: now,
          waktuSelesaiAktual: null,
          waktuDiserahkan: null,
          durasiTotalAktualMenit: 0,
          isPaused: false,
          pauseIntervals: [],
          createdAt: now,
          updatedAt: now,
        };
        db.Service_Time_Records.push(str);
      }
      str.isPaused = true;
      if (!str.pauseIntervals) str.pauseIntervals = [];
      str.pauseIntervals.push({
        pauseStart: now,
        pauseEnd: null,
        reason: reason || 'Istirahat / Menunggu persetujuan part',
      });
      str.updatedAt = now;
      logActivity(db, req.user, 'PAUSE_SERVICE', 'Servis', wo.id, `Mekanik menjeda servis ${wo.noWo}: ${reason}`);
      return { status: 200, data: str };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/work-orders/:id/time-resume', requireAuth, requireRoles('MEKANIK', 'ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const result = await withWriteLock((db) => {
      const str = (db.Service_Time_Records || []).find((r: any) => r.workOrderId === id);
      if (!str) return { error: 'Catatan waktu belum dibuat.', status: 404 };
      const now = new Date().toISOString();
      str.isPaused = false;
      if (Array.isArray(str.pauseIntervals) && str.pauseIntervals.length > 0) {
        const last = str.pauseIntervals[str.pauseIntervals.length - 1];
        if (!last.pauseEnd) last.pauseEnd = now;
      }
      str.updatedAt = now;
      logActivity(db, req.user, 'RESUME_SERVICE', 'Servis', id, `Servis dilanjutkan kembali`);
      return { status: 200, data: str };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/work-orders/:id/request-estimation-change', requireAuth, requireRoles('MEKANIK', 'ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { tambahanMenit, alasan } = req.body || {};
    const addMinutes = Number(tambahanMenit || 0);
    if (addMinutes <= 0 || !alasan?.trim()) {
      res.status(400).json({ error: 'Tambahan durasi (menit) dan alasan perubahan wajib diisi.' });
      return;
    }
    const result = await withWriteLock((db) => {
      const wo = db.Work_Orders.find((w) => w.id === id);
      if (!wo) return { error: 'Work Order tidak ditemukan.', status: 404 };
      const now = new Date().toISOString();
      if (!db.Estimation_History) db.Estimation_History = [];

      const currentEst = wo.estimasiSelesai || '12:00';
      const historyItem = {
        id: uuid(),
        workOrderId: wo.id,
        noWo: wo.noWo,
        requestedBy: `${req.user.nama} (${req.user.roleName})`,
        estimasiAwalSelesai: currentEst,
        tambahanMenit: addMinutes,
        estimasiBaruSelesai: `+${addMinutes} menit`,
        alasan: alasan.trim(),
        status: 'PENDING',
        reviewedBy: null,
        reviewedAt: null,
        catatanReview: null,
        notifikasiPelangganTerkirim: false,
        createdAt: now,
      };
      db.Estimation_History.unshift(historyItem);

      pushNotification(
        db,
        'ESTIMATION_CHANGE_REQUEST',
        'Pengajuan Perubahan Waktu Servis',
        `Mekanik mengajukan perpanjangan durasi +${addMinutes} mnt untuk ${wo.noWo}. Alasan: ${alasan.trim()}`,
        'WorkOrder',
        wo.id,
        'ADMIN'
      );

      return { status: 201, data: historyItem };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json(result.data);
  });

  app.post('/api/work-orders/:id/approve-estimation-change', requireAuth, requireRoles('ADMIN', 'OWNER'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { estimationHistoryId, approved, catatan } = req.body || {};
    const result = await withWriteLock((db) => {
      const hist = (db.Estimation_History || []).find((h: any) => h.id === estimationHistoryId && h.workOrderId === id);
      if (!hist) return { error: 'Data pengajuan estimasi tidak ditemukan.', status: 404 };
      const wo = db.Work_Orders.find((w) => w.id === id);
      const now = new Date().toISOString();
      hist.status = approved ? 'DISETUJUI' : 'DITOLAK';
      hist.reviewedBy = req.user.nama;
      hist.reviewedAt = now;
      hist.catatanReview = catatan || '';
      hist.notifikasiPelangganTerkirim = true;

      if (approved && wo) {
        const dur = Number(hist.tambahanMenit || 0);
        wo.estimasiSelesai = `${wo.estimasiSelesai || '12:00'} (+${dur}m)`;
        wo.riwayatStatus.push({
          status: wo.status,
          waktu: now,
          oleh: `${req.user.nama} (Perpanjangan Estimasi +${dur} mnt disetujui)`,
        });

        pushNotification(
          db,
          'ESTIMATION_APPROVED',
          'Estimasi Servis Diperpanjang',
          `Perpanjangan estimasi waktu servis motor Anda (${wo.noWo}) disetujui: +${dur} menit. Terima kasih atas pengertian Anda.`,
          'WorkOrder',
          wo.id,
          'PELANGGAN'
        );
      }
      return { status: 200, data: hist };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  // =========================================================================
  // USERS, ROLES, NOTIFICATIONS, SETTINGS & BACKUP
  // =========================================================================
  app.post('/api/users', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res) => {
    const { username, nama, email, noHp, roleId, employeeId, customerId, password } = req.body || {};
    if (!username || !nama || !roleId || !password) {
      res.status(400).json({ error: 'Username, nama, role, dan password wajib diisi.' });
      return;
    }
    const result = await withWriteLock((db) => {
      if (db.Users.some((u) => u.username.toLowerCase() === String(username).toLowerCase())) {
        return { error: 'Username sudah digunakan.', status: 400 };
      }
      const role = db.Roles.find((r) => r.id === roleId);
      if (!role) return { error: 'Role tidak valid.', status: 400 };
      const { hash, salt } = hashPassword(String(password));
      const newUser = {
        id: uuid(),
        username: String(username).trim(),
        nama: String(nama).trim(),
        email: email || '',
        noHp: noHp || '',
        roleId: role.id,
        roleName: role.nama,
        employeeId: employeeId || null,
        customerId: customerId || null,
        passwordHash: hash,
        passwordSalt: salt,
        statusAktif: true,
        lastLogin: null,
        createdAt: new Date().toISOString(),
      };
      db.Users.unshift(newUser);
      logActivity(db, req.user, 'CREATE_USER', 'Pengguna & Hak Akses', newUser.id, `Membuat user ${newUser.username} (${role.nama})`);
      return { status: 201, data: sanitizeUser(newUser) };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json(result.data);
  });

  app.patch('/api/users/:id', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { nama, email, noHp, roleId, statusAktif, password } = req.body || {};
    const result = await withWriteLock((db) => {
      const user = db.Users.find((u) => u.id === id);
      if (!user) return { error: 'User tidak ditemukan.', status: 404 };
      if (nama !== undefined) user.nama = nama;
      if (email !== undefined) user.email = email;
      if (noHp !== undefined) user.noHp = noHp;
      if (typeof statusAktif === 'boolean') user.statusAktif = statusAktif;
      if (roleId) {
        const role = db.Roles.find((r) => r.id === roleId);
        if (role) {
          user.roleId = role.id;
          user.roleName = role.nama;
        }
      }
      if (password) {
        const { hash, salt } = hashPassword(String(password));
        user.passwordHash = hash;
        user.passwordSalt = salt;
      }
      logActivity(db, req.user, 'UPDATE_USER', 'Pengguna & Hak Akses', user.id, `Update user ${user.username}`);
      return { status: 200, data: sanitizeUser(user) };
    });
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req: AuthedRequest, res) => {
    await withWriteLock((db) => {
      if (req.params.id === 'all') {
        db.Notifications.forEach((n) => (n.dibaca = true));
      } else {
        const n = db.Notifications.find((x) => x.id === req.params.id);
        if (n) n.dibaca = true;
      }
    });
    res.json({ ok: true });
  });

  app.put('/api/settings', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER'), async (req: AuthedRequest, res) => {
    const result = await withWriteLock((db) => {
      db.Settings[0] = {
        ...db.Settings[0],
        ...(req.body || {}),
        updatedAt: new Date().toISOString(),
      };
      logActivity(db, req.user, 'UPDATE_SETTINGS', 'Pengaturan', 'set-default', 'Memperbarui pengaturan sistem');
      return db.Settings[0];
    });
    res.json(result);
  });

  // Full 39-table Backup Export
  app.get('/api/backup/export', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER'), (_req, res) => {
    const db = loadDb();
    const { Sessions, Idempotency_Keys, ...tables } = db;
    const sanitizedTables = {
      ...tables,
      Users: db.Users.map(sanitizeUser),
    };
    res.json({
      exportedAt: new Date().toISOString(),
      app: 'BENGKEL MOTOR',
      tableCount: Object.keys(sanitizedTables).length,
      tables: sanitizedTables,
    });
  });

  app.post('/api/backup/reset-demo', requireAuth, requireRoles('SUPER_ADMIN'), (_req, res) => {
    resetDbToSeed();
    res.json({ ok: true, message: 'Database berhasil dikembalikan ke data awal.' });
  });

  // Serve generated GAS / Android Studio WebView / Documentation deliverables for direct copy/download in UI
  app.get('/api/deliverables', requireAuth, (_req, res) => {
    const root = process.cwd();
    const filesToRead = [
      { key: 'gas_code', title: 'Google Apps Script — Code.gs (39 Sheet + LockService + Drive + Auth)', path: 'gas/Code.gs' },
      { key: 'gas_manifest', title: 'Google Apps Script — appsscript.json', path: 'gas/appsscript.json' },
      { key: 'gas_index', title: 'Google Apps Script — Index.html', path: 'gas/Index.html' },
      { key: 'android_manifest', title: 'Android Studio — AndroidManifest.xml', path: 'android-webview/AndroidManifest.xml' },
      { key: 'android_gradle', title: 'Android Studio — app/build.gradle', path: 'android-webview/build.gradle' },
      { key: 'android_activity', title: 'Android Studio — MainActivity.java (WebView + Upload + PDF Print)', path: 'android-webview/MainActivity.java' },
      { key: 'android_layout', title: 'Android Studio — res/layout/activity_main.xml', path: 'android-webview/activity_main.xml' },
      { key: 'guide_md', title: 'Panduan Konfigurasi, Deployment GAS, Pengujian & Build APK Android', path: 'docs/PANDUAN_LENGKAP.md' },
    ];
    const deliverables = filesToRead.map((f) => {
      const full = path.join(root, f.path);
      return {
        ...f,
        content: fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : '',
      };
    });
    res.json({ deliverables });
  });
}
