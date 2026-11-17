import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createInitialSeed } from './seed.js';

export interface DatabaseSchema {
  Users: any[];
  Roles: any[];
  Employees: any[];
  Customers: any[];
  Vehicles: any[];
  Service_Categories: any[];
  Services: any[];
  Suppliers: any[];
  Spareparts: any[];
  Sparepart_Categories: any[];
  Materials: any[];
  Material_Categories: any[];
  Service_Orders: any[];
  Work_Orders: any[];
  Work_Order_Details: any[];
  Work_Order_Parts: any[];
  Work_Order_Materials: any[];
  Service_History: any[];
  Purchases: any[];
  Purchase_Details: any[];
  Stock_Movements: any[];
  Material_Usages: any[];
  Appointments: any[];
  Queues: any[];
  Transactions: any[];
  Transaction_Details: any[];
  Payments: any[];
  Accounts_Payable: any[];
  Payable_Payments: any[];
  Accounts_Receivable: any[];
  Receivable_Payments: any[];
  Expenses: any[];
  Commissions: any[];
  Attendance: any[];
  Shifts: any[];
  Warranties: any[];
  Notifications: any[];
  Activity_Logs: any[];
  Settings: any[];
  Cash_Closings: any[];
  Sessions: Record<string, { userId: string; role: string; expiresAt: number }>;
  Idempotency_Keys: Record<string, { response: any; createdAt: string }>;
  Mechanic_Referrals: any[];
  Referral_Records: any[];
  Commission_Settings: any[];
  Mechanic_Commissions: any[];
  Queue_Records: any[];
  Service_Duration_Settings: any[];
  Service_Time_Records: any[];
  Estimation_History: any[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'bengkel_db.json');

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

export function uuid(): string {
  return crypto.randomUUID();
}

let dbCache: DatabaseSchema | null = null;
let writeQueue: Promise<any> = Promise.resolve();

export function loadDb(): DatabaseSchema {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(raw) as DatabaseSchema;
      if (!dbCache.Sessions) dbCache.Sessions = {};
      if (!dbCache.Idempotency_Keys) dbCache.Idempotency_Keys = {};
      if (!dbCache.Cash_Closings) dbCache.Cash_Closings = [];
      if (!dbCache.Mechanic_Referrals) dbCache.Mechanic_Referrals = [];
      if (!dbCache.Referral_Records) dbCache.Referral_Records = [];
      if (!dbCache.Commission_Settings) dbCache.Commission_Settings = [];
      if (!dbCache.Mechanic_Commissions) dbCache.Mechanic_Commissions = [];
      if (!dbCache.Queue_Records) dbCache.Queue_Records = [];
      if (!dbCache.Service_Duration_Settings) dbCache.Service_Duration_Settings = [];
      if (!dbCache.Service_Time_Records) dbCache.Service_Time_Records = [];
      if (!dbCache.Estimation_History) dbCache.Estimation_History = [];
      return dbCache;
    } catch {
      // fallback to reseed if corrupted
    }
  }
  dbCache = createInitialSeed(hashPassword);
  saveDb(dbCache);
  return dbCache;
}

export function saveDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
  dbCache = db;
}

/**
 * Mirrors GAS LockService.getScriptLock() to guarantee serialized writes
 * and prevent concurrent stock/transaction race conditions.
 */
export function withWriteLock<T>(fn: (db: DatabaseSchema) => Promise<T> | T): Promise<T> {
  const next = writeQueue.then(async () => {
    const db = loadDb();
    const result = await fn(db);
    saveDb(db);
    return result;
  });
  writeQueue = next.catch(() => {});
  return next;
}

export function resetDbToSeed(): DatabaseSchema {
  dbCache = createInitialSeed(hashPassword);
  saveDb(dbCache);
  return dbCache;
}
