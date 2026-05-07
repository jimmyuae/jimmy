require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const cron = require('node-cron');
const dayjs = require('dayjs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ROOT = __dirname;
const LOGO_PATH = path.join(ROOT, 'public', 'assets', 'jimmy-logo-wordmark.png');
const STORE_RADIUS_M = Number(process.env.STORE_RADIUS_M || 500);
const FACE_VERIFY_MODE = process.env.FACE_VERIFY_MODE || 'manual';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'jimmy-attendance';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required for the permanent-storage version. Use your Supabase Postgres connection string.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for persistent file storage.');
  process.exit(1);
}

globalThis.WebSocket = WebSocket;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 6)
});
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(ROOT, 'public')));

function nowIso() { return new Date().toISOString(); }
function slugCode(value) {
  return String(value || 'store').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || `STORE-${Date.now()}`;
}
async function q(text, params = []) { return pool.query(text, params); }
async function one(text, params = []) { const r = await q(text, params); return r.rows[0] || null; }
async function all(text, params = []) { const r = await q(text, params); return r.rows; }

async function ensureStorageBucket() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (!buckets.some(b => b.name === SUPABASE_STORAGE_BUCKET)) {
    const { error } = await supabase.storage.createBucket(SUPABASE_STORAGE_BUCKET, { public: false, fileSizeLimit: 1024 * 1024 * 15 });
    if (error) throw error;
  }
}

async function ensureSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      store_group TEXT NOT NULL DEFAULT 'General',
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
      longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
      radius_m INTEGER NOT NULL DEFAULT 500,
      location_locked INTEGER NOT NULL DEFAULT 0,
      location_captured_by INTEGER,
      location_captured_at TEXT,
      opening_time TEXT NOT NULL DEFAULT '10:00',
      closing_time TEXT NOT NULL DEFAULT '22:00',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      employee_code TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','manager','worker')),
      active INTEGER NOT NULL DEFAULT 1,
      assigned_store_id INTEGER REFERENCES stores(id),
      face_image_path TEXT,
      profile_image_path TEXT,
      last_login_at TEXT,
      last_logout_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      model TEXT NOT NULL,
      name TEXT,
      category TEXT,
      default_price NUMERIC NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      worker_id INTEGER NOT NULL REFERENCES users(id),
      store_id INTEGER NOT NULL REFERENCES stores(id),
      check_in_time TEXT NOT NULL,
      check_out_time TEXT,
      check_in_lat DOUBLE PRECISION,
      check_in_lng DOUBLE PRECISION,
      check_in_accuracy DOUBLE PRECISION,
      check_out_lat DOUBLE PRECISION,
      check_out_lng DOUBLE PRECISION,
      check_out_accuracy DOUBLE PRECISION,
      in_face_score DOUBLE PRECISION,
      out_face_score DOUBLE PRECISION,
      in_location_status TEXT,
      out_location_status TEXT,
      check_in_distance_m INTEGER,
      check_out_distance_m INTEGER,
      in_location_warning INTEGER NOT NULL DEFAULT 0,
      out_location_warning INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      total_work_minutes INTEGER DEFAULT 0,
      in_face_image_path TEXT,
      out_face_image_path TEXT,
      in_face_review_status TEXT NOT NULL DEFAULT 'pending',
      out_face_review_status TEXT,
      in_face_reviewed_by INTEGER,
      out_face_reviewed_by INTEGER,
      in_face_reviewed_at TEXT,
      out_face_reviewed_at TEXT,
      face_review_notes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_sales_reports (
      id SERIAL PRIMARY KEY,
      attendance_id INTEGER UNIQUE NOT NULL REFERENCES attendance(id),
      worker_id INTEGER NOT NULL REFERENCES users(id),
      store_id INTEGER NOT NULL REFERENCES stores(id),
      report_date TEXT NOT NULL,
      total_customers INTEGER NOT NULL DEFAULT 0,
      converted_customers INTEGER NOT NULL DEFAULT 0,
      conversion_rate NUMERIC NOT NULL DEFAULT 0,
      total_qty INTEGER NOT NULL DEFAULT 0,
      total_value NUMERIC NOT NULL DEFAULT 0,
      no_sale_reason TEXT,
      logout_time TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_sales_report_items (
      id SERIAL PRIMARY KEY,
      daily_sales_report_id INTEGER NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name_snapshot TEXT NOT NULL,
      unit_price_snapshot NUMERIC NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      value NUMERIC NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_attendance_reports (
      id SERIAL PRIMARY KEY,
      report_id TEXT UNIQUE NOT NULL,
      worker_id INTEGER NOT NULL REFERENCES users(id),
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_present_days INTEGER NOT NULL DEFAULT 0,
      total_absent_days INTEGER NOT NULL DEFAULT 0,
      late_count INTEGER NOT NULL DEFAULT 0,
      early_checkout_count INTEGER NOT NULL DEFAULT 0,
      total_work_minutes INTEGER NOT NULL DEFAULT 0,
      overtime_minutes INTEGER NOT NULL DEFAULT 0,
      total_sales_qty INTEGER NOT NULL DEFAULT 0,
      total_sales_value NUMERIC NOT NULL DEFAULT 0,
      location_warning_count INTEGER NOT NULL DEFAULT 0,
      pdf_url TEXT NOT NULL,
      pdf_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'locked',
      generated_at TEXT NOT NULL,
      locked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(worker_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS attendance_correction_requests (
      id SERIAL PRIMARY KEY,
      worker_id INTEGER NOT NULL REFERENCES users(id),
      attendance_id INTEGER NOT NULL REFERENCES attendance(id),
      requested_reason TEXT NOT NULL,
      requested_check_in TEXT,
      requested_check_out TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      event_type TEXT NOT NULL CHECK(event_type IN ('login','logout')),
      event_time TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

async function seedDb() {
  const ts = nowIso();
  const storeCount = Number((await one('SELECT COUNT(*)::int AS count FROM stores')).count || 0);
  if (storeCount === 0) {
    const stores = [
      ['OASIS MALL', 'EMAX OASIS MALL', 'EMAX-OASIS-MALL'],
      ['OASIS MALL', 'Sharaf DG Oasis Mall', 'SHARAFDG-OASIS-MALL'],
      ['General', 'Jimmy Demo Store', 'JIMMY-DEMO']
    ];
    for (const s of stores) await q('INSERT INTO stores (store_group,name,code,latitude,longitude,radius_m,opening_time,closing_time,active,created_at,updated_at) VALUES ($1,$2,$3,0,0,$4,$5,$6,1,$7,$8)', [s[0], s[1], s[2], STORE_RADIUS_M, '10:00', '22:00', ts, ts]);
  }
  const productCount = Number((await one('SELECT COUNT(*)::int AS count FROM products')).count || 0);
  if (productCount === 0) {
    const products = [
      ['PW 11 Pro Max','PW 11 Pro Max','Vacuum / Washer',0,1], ['PW 11 Pro','PW 11 Pro','Vacuum / Washer',0,2], ['PW 11','PW 11','Vacuum / Washer',0,3],
      ['JV9 Pro Aqua','JV9 Pro Aqua','Vacuum Cleaner',0,4], ['H10 Flex','H10 Flex','Vacuum Cleaner',0,5], ['H9 Pro','H9 Pro','Vacuum Cleaner',0,6], ['JV 35','JV 35','Vacuum Cleaner',0,7],
      ['BX6 Lite','BX6 Lite','Cleaning Product',0,8], ['BX8','BX8','Cleaning Product',0,9], ['BX7 Pro','BX7 Pro','Cleaning Product',0,10], ['F8 Hair Dryer','F8 Hair Dryer','Hair Care',0,11], ['HF9','HF9 Hair Multi Styler','Hair Care',0,12], ['F7','F7','Hair Care',0,13]
    ];
    for (const p of products) await q('INSERT INTO products (model,name,category,default_price,active,display_order,created_at,updated_at) VALUES ($1,$2,$3,$4,1,$5,$6,$7)', [p[0], p[1], p[2], p[3], p[4], ts, ts]);
  }
  const userCount = Number((await one('SELECT COUNT(*)::int AS count FROM users')).count || 0);
  if (userCount === 0) {
    const firstStore = await one('SELECT id FROM stores ORDER BY id LIMIT 1');
    await q('INSERT INTO users (name,email,phone,employee_code,password_hash,role,active,assigned_store_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9)', ['Jimmy Admin', process.env.ADMIN_EMAIL || `admin-${crypto.randomBytes(4).toString('hex')}@local.invalid`, '', process.env.ADMIN_ID || 'ADMIN-001', bcrypt.hashSync(process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString('hex'), 10), 'admin', firstStore.id, ts, ts]);
    await q('INSERT INTO users (name,email,phone,employee_code,password_hash,role,active,assigned_store_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9)', ['Demo Merchandiser', process.env.WORKER_EMAIL || `merchandiser-${crypto.randomBytes(4).toString('hex')}@local.invalid`, '', process.env.WORKER_ID || 'EMP-001', bcrypt.hashSync(process.env.WORKER_PASSWORD || crypto.randomBytes(24).toString('hex'), 10), 'worker', firstStore.id, ts, ts]);
  }
}

function signToken(user) { return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '12h' }); }
async function locationWarningCountForUser(userId) {
  const row = await one('SELECT COALESCE(SUM(COALESCE(in_location_warning,0) + COALESCE(out_location_warning,0)),0)::int AS count FROM attendance WHERE worker_id = $1', [userId]);
  return Number(row?.count || 0);
}
async function signedUrl(storagePath, expiresIn = 60 * 60 * 12) {
  if (!storagePath) return null;
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
async function serializeUser(user) {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, employee_code: user.employee_code,
    assigned_store_id: user.assigned_store_id, face_enrolled: Boolean(user.face_image_path),
    profile_image_path: await signedUrl(user.profile_image_path), last_login_at: user.last_login_at || null, last_logout_at: user.last_logout_at || null,
    location_warning_count: user.role === 'worker' ? await locationWarningCountForUser(user.id) : 0
  };
}
async function recordLoginEvent(userId, type, req) {
  const ts = nowIso();
  await q('INSERT INTO login_events (user_id,event_type,event_time,ip_address,user_agent,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [userId, type, ts, req.ip || '', req.headers['user-agent'] || '', ts]);
  if (type === 'login') await q('UPDATE users SET last_login_at=$1, updated_at=$2 WHERE id=$3', [ts, ts, userId]);
  if (type === 'logout') await q('UPDATE users SET last_logout_at=$1, updated_at=$2 WHERE id=$3', [ts, ts, userId]);
  return ts;
}
async function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing authorization token.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await one('SELECT * FROM users WHERE id=$1', [payload.id]);
    if (!user || !Number(user.active)) return res.status(401).json({ error: 'User is not active or does not exist.' });
    req.user = user; next();
  } catch (error) { return res.status(401).json({ error: 'Invalid or expired token.' }); }
}
function requireAdmin(req, res, next) { if (!['admin','manager'].includes(req.user.role)) return res.status(403).json({ error: 'Admin or manager permission required.' }); next(); }
function haversineMeters(lat1, lon1, lat2, lon2) { const R=6371000; const toRad=v=>(Number(v)*Math.PI)/180; const dLat=toRad(lat2-lat1); const dLon=toRad(lon2-lon1); const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2; return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
function storeNeedsLocation(store) { return !Number(store.location_locked) || (Number(store.latitude || 0) === 0 && Number(store.longitude || 0) === 0); }
async function captureStoreLocationIfNeeded(store, userId, lat, lng) {
  if (!storeNeedsLocation(store)) return { store, captured: false };
  const ts = nowIso();
  await q('UPDATE stores SET latitude=$1, longitude=$2, radius_m=$3, location_locked=1, location_captured_by=$4, location_captured_at=$5, updated_at=$6 WHERE id=$7', [Number(lat), Number(lng), STORE_RADIUS_M, userId, ts, ts, store.id]);
  return { store: { ...store, latitude: Number(lat), longitude: Number(lng), radius_m: STORE_RADIUS_M, location_locked: 1, location_captured_by: userId, location_captured_at: ts }, captured: true };
}
function calculateLocation(store, lat, lng, accuracy) {
  const safeLat=Number(lat), safeLng=Number(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) throw new Error('Current location is required. Please allow GPS/location permission.');
  const radius=Number(store.radius_m || STORE_RADIUS_M);
  const distance = haversineMeters(store.latitude, store.longitude, safeLat, safeLng);
  const warning = distance > radius;
  return { passed: !warning, warning, status: warning ? 'warning' : 'approved', distance_m: Math.round(distance), radius_m: radius, accuracy_m: accuracy ? Math.round(Number(accuracy)) : null };
}
async function uploadBuffer(buffer, objectPath, contentType) {
  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(objectPath, buffer, { contentType, upsert: true });
  if (error) throw error;
  return objectPath;
}
async function saveDataUrlImage(dataUrl, prefix) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('A valid camera image is required.');
  const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!matches) throw new Error('Only PNG or JPG images are accepted.');
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const folder = prefix.startsWith('profile') ? 'profiles' : 'faces';
  const objectPath = `${folder}/${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await uploadBuffer(Buffer.from(matches[2], 'base64'), objectPath, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  return objectPath;
}

async function removeStorageObjects(paths) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean).map(p => String(p).trim()).filter(p => p && !/^https?:\/\//.test(p)))];
  let removed = 0;
  for (let i = 0; i < uniquePaths.length; i += 100) {
    const batch = uniquePaths.slice(i, i + 100);
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(batch);
    if (error) {
      console.warn('Storage delete warning:', error.message || error);
      continue;
    }
    removed += batch.length;
  }
  return removed;
}

function manualSelfieSubmission() { return { passed: true, score: null, provider: FACE_VERIFY_MODE, review_status: 'pending', message: 'Selfie submitted for manual admin review.' }; }
function minutesBetween(startIso, endIso) { return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000)); }
function statusBadgeText(status) { const s=status || 'pending'; return s.charAt(0).toUpperCase()+s.slice(1); }
function isLate(checkInIso, openingTime) { const d=dayjs(checkInIso); const [h,m]=String(openingTime||'10:00').split(':').map(Number); return d.isAfter(d.hour(h).minute(m).second(0).millisecond(0).add(15,'minute')); }
function isEarlyCheckout(checkOutIso, closingTime) { if(!checkOutIso) return false; const d=dayjs(checkOutIso); const [h,m]=String(closingTime||'22:00').split(':').map(Number); return d.isBefore(d.hour(h).minute(m).second(0).millisecond(0).subtract(15,'minute')); }
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function formatMinutes(mins) { const h=Math.floor(Number(mins||0)/60); const m=Number(mins||0)%60; return `${h}h ${m}m`; }
function hashBuffer(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function pdfBufferFromDoc(build) { return new Promise((resolve,reject)=>{ const doc=new PDFDocument({size:'A4', margin:38}); const chunks=[]; doc.on('data', c=>chunks.push(c)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject); build(doc); doc.end(); }); }

async function attachSignedAttendance(rows) {
  return Promise.all(rows.map(async r => ({ ...r, in_face_image_path: await signedUrl(r.in_face_image_path), out_face_image_path: await signedUrl(r.out_face_image_path) })));
}
async function attachSignedUsers(rows) {
  return Promise.all(rows.map(async u => ({ ...u, profile_image_path: await signedUrl(u.profile_image_path), location_warning_count: Number(u.location_warning_count || 0) })));
}

function reportDateLabel(dateValue) { return dayjs(dateValue).format('DD-MMM-YY'); }
function reportTimeLabel(dateValue) { return dateValue ? dayjs(dateValue).format('h:mm A') : 'No Record'; }
function reportDayLabel(dateValue) { return dayjs(dateValue).format('ddd'); }
function buildMonthDateList(start, end) {
  const days = [];
  let cursor = start.startOf('day');
  const finalDay = end.startOf('day');
  while (cursor.isBefore(finalDay) || cursor.isSame(finalDay)) {
    days.push(cursor);
    cursor = cursor.add(1, 'day');
  }
  return days;
}

async function generateWorkerMonthlyReport(workerId, month, year, throughDate = null) {
  const worker = await one('SELECT * FROM users WHERE id=$1', [workerId]);
  if (!worker) throw new Error('Staff member not found.');

  const start = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).startOf('month');
  const monthEnd = start.endOf('month');
  const requestedEnd = throughDate ? dayjs(throughDate).endOf('day') : dayjs().endOf('day');
  let end = requestedEnd.isAfter(monthEnd) ? monthEnd : requestedEnd;
  if (end.isBefore(start)) end = monthEnd;

  const rows = await all(`
    SELECT a.*, s.name AS store_name, s.store_group, s.opening_time, s.closing_time, ds.total_customers, ds.converted_customers, ds.total_qty, ds.total_value, ds.conversion_rate, ds.no_sale_reason
    FROM attendance a JOIN stores s ON s.id=a.store_id LEFT JOIN daily_sales_reports ds ON ds.attendance_id=a.id
    WHERE a.worker_id=$1 AND a.check_in_time >= $2 AND a.check_in_time <= $3 ORDER BY a.check_in_time ASC`, [workerId, start.toISOString(), end.toISOString()]);

  const dayRows = new Map();
  for (const r of rows) {
    const key = dayjs(r.check_in_time).format('YYYY-MM-DD');
    if (!dayRows.has(key)) dayRows.set(key, r);
  }

  const presentDates = new Set(rows.map(r => dayjs(r.check_in_time).format('YYYY-MM-DD')));
  const presentDays = presentDates.size;
  const scheduledDays = buildMonthDateList(start, end).length;
  const absentDays = Math.max(0, scheduledDays - presentDays);
  const lateCount = rows.filter(r => isLate(r.check_in_time, r.opening_time)).length;
  const earlyCount = rows.filter(r => isEarlyCheckout(r.check_out_time, r.closing_time)).length;
  const totalWorkMinutes = rows.reduce((s,r)=>s+Number(r.total_work_minutes||0),0);
  const overtimeMinutes = Math.max(0, totalWorkMinutes - presentDays*8*60);
  const totalSalesQty = rows.reduce((s,r)=>s+Number(r.total_qty||0),0);
  const totalSalesValue = rows.reduce((s,r)=>s+Number(r.total_value||0),0);
  const locationWarningCount = rows.reduce((s,r)=>s+Number(r.in_location_warning||0)+Number(r.out_location_warning||0),0);
  const reportId = `ATT-${year}-${String(month).padStart(2,'0')}-${String(end.date()).padStart(2,'0')}-${String(workerId).padStart(5,'0')}`;
  const verifyUrl = `${APP_URL}/verify-report/${reportId}`;
  const periodText = `${start.format('MMMM YYYY')} (${reportDateLabel(start)} to ${reportDateLabel(end)})`;
  const allDays = buildMonthDateList(start, end);

  const pdfBuffer = await pdfBufferFromDoc(doc => {
    try { doc.image(LOGO_PATH, 38, 22, { width: 135 }); } catch {}
    doc.fontSize(18).fillColor('#111827').text('Attendance Sheet', 38, 74, { align: 'center' });
    doc.fontSize(10).fillColor('#111827').text(`Employee: ${worker.name} | Brand: Jimmy | Period: ${periodText}`, 38, 104, { align: 'center' });
    doc.fontSize(9).fillColor('#374151').text(`Prepared: ${reportDateLabel(dayjs())}`, 38, 121, { align: 'center' });

    const cols = [38, 66, 130, 176, 318, 380, 445];
    const widths = [28, 64, 46, 142, 62, 65, 82];
    let y = 154;
    const drawHeader = () => {
      doc.rect(38, y, 515, 22).fillAndStroke('#f3f6fb', '#d8e0ee');
      doc.fillColor('#111827').fontSize(8).font('Helvetica-Bold');
      ['S.N','Date','Day','Name','Time In','Time Out','Signature'].forEach((h,i)=>doc.text(h, cols[i]+4, y+7, { width: widths[i]-6 }));
      doc.font('Helvetica');
      y += 22;
    };
    drawHeader();
    allDays.forEach((d, idx) => {
      if (y > 730) { doc.addPage(); y = 48; drawHeader(); }
      const key = d.format('YYYY-MM-DD');
      const r = dayRows.get(key);
      const isPresent = Boolean(r);
      const rowHeight = 22;
      doc.rect(38, y, 515, rowHeight).stroke('#e5e7eb');
      doc.fillColor('#111827').fontSize(8);
      const values = [
        String(idx + 1),
        reportDateLabel(d),
        reportDayLabel(d),
        worker.name,
        isPresent ? reportTimeLabel(r.check_in_time) : 'No Record',
        isPresent && r.check_out_time ? reportTimeLabel(r.check_out_time) : (isPresent ? 'Pending' : 'No Record'),
        ''
      ];
      values.forEach((v,i)=>doc.text(String(v), cols[i]+4, y+7, { width: widths[i]-6 }));
      y += rowHeight;
    });

    y += 12;
    if (y > 690) { doc.addPage(); y = 48; }
    doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold').text('Summary', 38, y);
    doc.font('Helvetica');
    y += 16;
    const summary = [
      `Working Days: ${presentDays}`,
      `No Record Days: ${absentDays}`,
      `Total Hours: ${formatMinutes(totalWorkMinutes)}`,
      `Total Products Sold: ${totalSalesQty}`,
      `Total Sales Value: ${Number(totalSalesValue || 0).toFixed(2)}`,
      `Location Warnings: ${locationWarningCount}`,
      `Verification URL: ${verifyUrl}`
    ];
    summary.forEach(line => { doc.fontSize(8).fillColor('#374151').text(line, 38, y, { width: 515 }); y += 12; });
    doc.fontSize(8).fillColor('#444').text('Prepared on ' + reportDateLabel(dayjs()) + '   Checked by ____________________', 38, 765, { width: 520, align: 'center' });
  });

  const pdfHash = hashBuffer(pdfBuffer);
  const pdfPath = `reports/${reportId}.pdf`;
  await uploadBuffer(pdfBuffer, pdfPath, 'application/pdf');
  const ts = nowIso();
  const saved = await one(`INSERT INTO monthly_attendance_reports (report_id,worker_id,month,year,total_present_days,total_absent_days,late_count,early_checkout_count,total_work_minutes,overtime_minutes,total_sales_qty,total_sales_value,location_warning_count,pdf_url,pdf_hash,status,generated_at,locked_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'locked',$16,$17,$18,$19)
    ON CONFLICT(worker_id,month,year) DO UPDATE SET report_id=EXCLUDED.report_id,total_present_days=EXCLUDED.total_present_days,total_absent_days=EXCLUDED.total_absent_days,late_count=EXCLUDED.late_count,early_checkout_count=EXCLUDED.early_checkout_count,total_work_minutes=EXCLUDED.total_work_minutes,overtime_minutes=EXCLUDED.overtime_minutes,total_sales_qty=EXCLUDED.total_sales_qty,total_sales_value=EXCLUDED.total_sales_value,location_warning_count=EXCLUDED.location_warning_count,pdf_url=EXCLUDED.pdf_url,pdf_hash=EXCLUDED.pdf_hash,status='locked',generated_at=EXCLUDED.generated_at,locked_at=EXCLUDED.locked_at,updated_at=EXCLUDED.updated_at RETURNING *`, [reportId,workerId,month,year,presentDays,absentDays,lateCount,earlyCount,totalWorkMinutes,overtimeMinutes,totalSalesQty,totalSalesValue,locationWarningCount,pdfPath,pdfHash,ts,ts,ts,ts]);
  return saved;
}
async function generateMonthlyReports(month, year, workerId=null) { const workers = workerId ? await all("SELECT * FROM users WHERE id=$1 AND role='worker'", [workerId]) : await all("SELECT * FROM users WHERE role='worker' AND active=1"); const reports=[]; for (const w of workers) reports.push(await generateWorkerMonthlyReport(w.id, Number(month), Number(year))); return reports; }

app.post('/api/auth/login', async (req,res)=>{ try { const {identifier,email,password}=req.body||{}; const loginId=String(identifier||email||'').trim(); if(!loginId||!password) return res.status(400).json({error:'Staff/Admin ID and password are required.'}); const user = await one('SELECT * FROM users WHERE lower(email)=lower($1) OR lower(employee_code)=lower($1) LIMIT 1', [loginId]); if(!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({error:'Invalid login details.'}); if(!Number(user.active)) return res.status(403).json({error:'This account is inactive.'}); await recordLoginEvent(user.id,'login',req); const fresh=await one('SELECT * FROM users WHERE id=$1',[user.id]); res.json({token:signToken(fresh), user: await serializeUser(fresh)}); } catch(e){ res.status(500).json({error:e.message}); }});
app.post('/api/auth/logout', auth, async (req,res)=>{ const loggedOutAt=await recordLoginEvent(req.user.id,'logout',req); res.json({ok:true, logged_out_at:loggedOutAt}); });
app.get('/api/me', auth, async (req,res)=>{ const user=await one('SELECT * FROM users WHERE id=$1',[req.user.id]); res.json({user: await serializeUser(user)}); });
app.post('/api/profile/photo', auth, async (req,res)=>{ try { const imagePath=await saveDataUrlImage(req.body.image, `profile-user-${req.user.id}`); await q('UPDATE users SET profile_image_path=$1, updated_at=$2 WHERE id=$3',[imagePath,nowIso(),req.user.id]); res.json({ok:true, profile_image_path: await signedUrl(imagePath)}); } catch(e){ res.status(400).json({error:e.message}); }});
app.get('/api/products', auth, async (req,res)=>{ res.json({products: await all('SELECT * FROM products WHERE active=1 ORDER BY display_order ASC, model ASC')}); });
app.get('/api/stores', auth, async (req,res)=>{ const stores = req.user.role==='worker' && req.user.assigned_store_id ? await all('SELECT * FROM stores WHERE active=1 AND id=$1',[req.user.assigned_store_id]) : await all('SELECT * FROM stores WHERE active=1 ORDER BY store_group ASC, name ASC'); res.json({stores}); });

app.get('/api/worker/attendance/open', auth, async (req,res)=>{ const open=await one('SELECT a.*,s.name AS store_name FROM attendance a JOIN stores s ON s.id=a.store_id WHERE a.worker_id=$1 AND a.status=$2 ORDER BY a.id DESC LIMIT 1',[req.user.id,'open']); res.json({attendance:open||null}); });
app.get('/api/worker/attendance', auth, async (req,res)=>{ const rows=await all(`SELECT a.*,s.name AS store_name,s.store_group,ds.total_customers,ds.converted_customers,ds.total_qty,ds.total_value,ds.no_sale_reason FROM attendance a JOIN stores s ON s.id=a.store_id LEFT JOIN daily_sales_reports ds ON ds.attendance_id=a.id WHERE a.worker_id=$1 ORDER BY a.check_in_time DESC LIMIT 80`,[req.user.id]); res.json({attendance: await attachSignedAttendance(rows)}); });
function monthFilterSql(alias, month, year) {
  return `EXTRACT(MONTH FROM ${alias}::date) = ${Number(month)} AND EXTRACT(YEAR FROM ${alias}::date) = ${Number(year)}`;
}

app.get('/api/worker/summary', auth, async (req,res)=>{
  if(req.user.role!=='worker') return res.status(403).json({error:'Only staff can view this summary.'});
  const row = await one(`SELECT
    COUNT(DISTINCT (a.check_in_time::timestamptz)::date)::int AS total_working_days,
    COUNT(DISTINCT to_char(a.check_in_time::timestamptz, 'YYYY-MM'))::int AS total_working_months,
    COALESCE(SUM(ds.total_qty),0)::int AS total_products_sold,
    COALESCE(SUM(ds.total_value),0)::numeric AS total_sales_value
    FROM attendance a
    LEFT JOIN daily_sales_reports ds ON ds.attendance_id=a.id
    WHERE a.worker_id=$1`, [req.user.id]);
  res.json({summary:{
    total_working_days:Number(row?.total_working_days||0),
    total_working_months:Number(row?.total_working_months||0),
    total_products_sold:Number(row?.total_products_sold||0),
    total_sales_value:Number(row?.total_sales_value||0)
  }});
});
app.get('/api/worker/top-sellers', auth, async (req,res)=>{
  try {
    if(req.user.role!=='worker') return res.status(403).json({error:'Only staff can view top sellers.'});
    const now = dayjs();
    const month = now.month() + 1;
    const year = now.year();
    const monthLabel = now.format('MMMM YYYY');
    const ranked = await all(`WITH ranked AS (
      SELECT u.id,u.name,u.employee_code,
        COALESCE(SUM(ds.total_qty),0)::int AS total_qty,
        COALESCE(SUM(ds.total_value),0)::numeric AS total_value,
        COUNT(DISTINCT ds.report_date::date)::int AS active_days,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(ds.total_value),0) DESC, COALESCE(SUM(ds.total_qty),0) DESC, lower(u.name) ASC) AS rank
      FROM users u
      LEFT JOIN daily_sales_reports ds ON ds.worker_id=u.id
        AND EXTRACT(MONTH FROM ds.report_date::date)=$1
        AND EXTRACT(YEAR FROM ds.report_date::date)=$2
      WHERE u.role='worker' AND u.active=1
      GROUP BY u.id,u.name,u.employee_code
    )
    SELECT * FROM ranked ORDER BY rank ASC`, [month, year]);
    const rankings = ranked.filter(r => Number(r.total_qty || 0) > 0 || Number(r.total_value || 0) > 0 || Number(r.active_days || 0) > 0).slice(0,10).map(r => ({
      rank:Number(r.rank), id:Number(r.id), name:r.name, employee_code:r.employee_code, total_qty:Number(r.total_qty||0), total_value:Number(r.total_value||0), active_days:Number(r.active_days||0), is_me:Number(r.id)===Number(req.user.id)
    }));
    const myRankRow = ranked.find(r => Number(r.id)===Number(req.user.id));
    const my_rank = myRankRow && (Number(myRankRow.total_qty || 0) > 0 || Number(myRankRow.total_value || 0) > 0 || Number(myRankRow.active_days || 0) > 0) ? {
      rank:Number(myRankRow.rank),
      total_qty:Number(myRankRow.total_qty||0),
      total_value:Number(myRankRow.total_value||0),
      active_days:Number(myRankRow.active_days||0)
    } : null;
    res.json({month:month, year:year, month_label:monthLabel, rankings, my_rank});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.get('/api/worker/sales-trend', auth, async (req,res)=>{
  try {
    if(req.user.role!=='worker') return res.status(403).json({error:'Only staff can view sales trend.'});
    const now = dayjs();
    const previous = now.subtract(1,'month');
    const currentRow = await one(`SELECT COALESCE(SUM(total_value),0)::numeric AS total_value, COALESCE(SUM(total_qty),0)::int AS total_qty FROM daily_sales_reports WHERE worker_id=$1 AND EXTRACT(MONTH FROM report_date::date)=$2 AND EXTRACT(YEAR FROM report_date::date)=$3`, [req.user.id, now.month()+1, now.year()]);
    const previousRow = await one(`SELECT COALESCE(SUM(total_value),0)::numeric AS total_value, COALESCE(SUM(total_qty),0)::int AS total_qty FROM daily_sales_reports WHERE worker_id=$1 AND EXTRACT(MONTH FROM report_date::date)=$2 AND EXTRACT(YEAR FROM report_date::date)=$3`, [req.user.id, previous.month()+1, previous.year()]);
    const currentTotal = Number(currentRow?.total_value || 0);
    const previousTotal = Number(previousRow?.total_value || 0);
    res.json({
      current_month_label: now.format('MMMM YYYY'),
      previous_month_label: previous.format('MMMM YYYY'),
      current_month_total: currentTotal,
      previous_month_total: previousTotal,
      current_month_qty: Number(currentRow?.total_qty || 0),
      previous_month_qty: Number(previousRow?.total_qty || 0),
      difference: currentTotal - previousTotal,
      direction: currentTotal > previousTotal ? 'higher' : currentTotal < previousTotal ? 'lower' : 'equal'
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/worker/reports/monthly/generate', auth, async (req,res)=>{
  try{
    if(req.user.role!=='worker') return res.status(403).json({error:'Only staff can generate their own report.'});
    const now = dayjs();
    const month = Number(req.body?.month || now.month()+1);
    const year = Number(req.body?.year || now.year());
    if(!month||!year||month<1||month>12) return res.status(400).json({error:'Valid month and year are required.'});
    const report = await generateWorkerMonthlyReport(req.user.id, month, year, req.body?.through_date || now.toISOString());
    res.json({ok:true, report});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/attendance/check-in', auth, async (req,res)=>{ if(req.user.role!=='worker') return res.status(403).json({error:'Only merchandisers can check in.'}); try { const {store_id,latitude,longitude,accuracy,image}=req.body||{}; const open=await one("SELECT id FROM attendance WHERE worker_id=$1 AND status='open'",[req.user.id]); if(open) return res.status(409).json({error:'You already have an open check-in. Please check out first.'}); const store=await one('SELECT * FROM stores WHERE id=$1 AND active=1',[store_id]); if(!store) return res.status(400).json({error:'Invalid store.'}); if(req.user.assigned_store_id && Number(req.user.assigned_store_id)!==Number(store.id)) return res.status(403).json({error:'This merchandiser is not assigned to the selected store.'}); const imagePath=await saveDataUrlImage(image,`checkin-worker-${req.user.id}`); const capture=await captureStoreLocationIfNeeded(store,req.user.id,latitude,longitude); const location=calculateLocation(capture.store,latitude,longitude,accuracy); if(capture.captured){ location.status='captured'; location.warning=false; location.passed=true; location.distance_m=0; location.store_location_captured=true; } const face=manualSelfieSubmission(); const ts=nowIso(); const row=await one(`INSERT INTO attendance (worker_id,store_id,check_in_time,check_in_lat,check_in_lng,check_in_accuracy,in_face_score,in_location_status,check_in_distance_m,in_location_warning,status,in_face_image_path,in_face_review_status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,'pending',$12,$13) RETURNING id`,[req.user.id,store.id,ts,latitude,longitude,accuracy||null,face.score,location.status,location.distance_m,location.warning?1:0,imagePath,ts,ts]); res.json({ok:true, attendance_id:row.id, check_in_time:ts, face, location}); } catch(e){ res.status(400).json({error:e.message}); }});
app.post('/api/attendance/check-out', auth, async (req,res)=>{ if(req.user.role!=='worker') return res.status(403).json({error:'Only merchandisers can check out.'}); const client=await pool.connect(); try { const {latitude,longitude,accuracy,image,total_customers,converted_customers,items,no_sale_reason}=req.body||{}; const openRes=await client.query(`SELECT a.*,s.latitude AS store_lat,s.longitude AS store_lng,s.radius_m,s.name AS store_name,s.location_locked,s.location_captured_by,s.location_captured_at FROM attendance a JOIN stores s ON s.id=a.store_id WHERE a.worker_id=$1 AND a.status='open' ORDER BY a.id DESC LIMIT 1`,[req.user.id]); const open=openRes.rows[0]; if(!open) return res.status(404).json({error:'No open check-in found.'}); const store={id:open.store_id,latitude:open.store_lat,longitude:open.store_lng,radius_m:open.radius_m,location_locked:open.location_locked,location_captured_by:open.location_captured_by,location_captured_at:open.location_captured_at}; const imagePath=await saveDataUrlImage(image,`checkout-worker-${req.user.id}`); const capture=await captureStoreLocationIfNeeded(store,req.user.id,latitude,longitude); const location=calculateLocation(capture.store,latitude,longitude,accuracy); if(capture.captured){location.status='captured';location.warning=false;location.passed=true;location.distance_m=0;location.store_location_captured=true;} const face=manualSelfieSubmission(); const safeItems=Array.isArray(items)?items:[]; let totalQty=0,totalValue=0; const prepared=[]; for(const item of safeItems){ const product=(await client.query('SELECT * FROM products WHERE id=$1',[item.product_id])).rows[0]; if(!product) continue; const qty=Math.max(0,parseInt(item.quantity||0,10)); const unitPrice=Number(item.unit_price ?? product.default_price ?? 0); const value=Number((qty*unitPrice).toFixed(2)); totalQty+=qty; totalValue+=value; prepared.push({product,qty,unitPrice,value}); } const customers=Math.max(0,parseInt(total_customers||0,10)); const converted=Math.max(0,parseInt(converted_customers||0,10)); const conversionRate=customers>0?Number(((converted/customers)*100).toFixed(2)):0; const noSaleReason=String(no_sale_reason||'').trim().slice(0,1000); if(totalQty===0&&!noSaleReason) return res.status(400).json({error:'No sale reason is required when no product quantity is sold.'}); const checkoutTime=nowIso(); const workMinutes=minutesBetween(open.check_in_time,checkoutTime); await client.query('BEGIN'); await client.query(`UPDATE attendance SET check_out_time=$1,check_out_lat=$2,check_out_lng=$3,check_out_accuracy=$4,out_face_score=$5,out_location_status=$6,check_out_distance_m=$7,out_location_warning=$8,status='closed',total_work_minutes=$9,out_face_image_path=$10,out_face_review_status='pending',updated_at=$11 WHERE id=$12`,[checkoutTime,latitude,longitude,accuracy||null,face.score,location.status,location.distance_m,location.warning?1:0,workMinutes,imagePath,checkoutTime,open.id]); const report=(await client.query(`INSERT INTO daily_sales_reports (attendance_id,worker_id,store_id,report_date,total_customers,converted_customers,conversion_rate,total_qty,total_value,no_sale_reason,logout_time,submitted_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[open.id,req.user.id,open.store_id,dayjs(checkoutTime).format('YYYY-MM-DD'),customers,converted,conversionRate,totalQty,totalValue,noSaleReason||null,dayjs(checkoutTime).format('HH:mm'),checkoutTime,checkoutTime,checkoutTime])).rows[0]; for(const row of prepared){ await client.query('INSERT INTO daily_sales_report_items (daily_sales_report_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,value,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[report.id,row.product.id,row.product.model,row.unitPrice,row.qty,row.value,checkoutTime,checkoutTime]); } await client.query('COMMIT'); res.json({ok:true,check_out_time:checkoutTime,total_work_minutes:workMinutes,total_qty:totalQty,total_value:totalValue,conversion_rate:conversionRate,face,location}); } catch(e){ try{await client.query('ROLLBACK')}catch{} res.status(400).json({error:e.message}); } finally { client.release(); }});
app.get('/api/worker/reports/monthly', auth, async (req,res)=>{ const reports=await all('SELECT * FROM monthly_attendance_reports WHERE worker_id=$1 ORDER BY year DESC, month DESC',[req.user.id]); res.json({reports}); });

app.get('/api/admin/work-status', auth, requireAdmin, async (req,res)=>{
  try {
    const working = await one(`SELECT COUNT(DISTINCT worker_id)::int AS count FROM attendance WHERE status='open'`);
    const finished = await one(`SELECT COUNT(DISTINCT worker_id)::int AS count FROM attendance WHERE status='closed' AND (check_out_time::timestamptz)::date = CURRENT_DATE`);
    res.json({
      working_now: Number(working?.count || 0),
      finished_today: Number(finished?.count || 0)
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.get('/api/admin/users', auth, requireAdmin, async (req,res)=>{ const rows=await all(`SELECT u.id,u.name,u.email,u.phone,u.employee_code,u.role,u.active,u.assigned_store_id,u.profile_image_path,u.last_login_at,u.last_logout_at,s.name AS store_name,s.store_group,COALESCE(SUM(COALESCE(a.in_location_warning,0)+COALESCE(a.out_location_warning,0)),0)::int AS location_warning_count FROM users u LEFT JOIN stores s ON s.id=u.assigned_store_id LEFT JOIN attendance a ON a.worker_id=u.id GROUP BY u.id,s.name,s.store_group ORDER BY u.active DESC,u.role ASC,u.name ASC`); res.json({users: await attachSignedUsers(rows)}); });
app.post('/api/admin/users', auth, requireAdmin, async (req,res)=>{ try { const {name,email,password,phone,employee_code,role,assigned_store_id,profile_image}=req.body||{}; if(!name||!email||!password) return res.status(400).json({error:'Name, email, and password are required.'}); const imagePath = profile_image ? await saveDataUrlImage(profile_image, `profile-user-new`) : null; const ts=nowIso(); const row=await one('INSERT INTO users (name,email,phone,employee_code,password_hash,role,active,assigned_store_id,profile_image_path,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10) RETURNING id',[name,email,phone||'',employee_code||null,bcrypt.hashSync(password,10),role||'worker',assigned_store_id||null,imagePath,ts,ts]); res.json({ok:true,id:row.id}); } catch(e){ res.status(400).json({error:e.message}); }});
app.patch('/api/admin/users/:id', auth, requireAdmin, async (req,res)=>{ try { const fields=[], params=[]; let i=1; for(const key of ['name','phone','employee_code','role','assigned_store_id','active']) if(req.body[key]!==undefined){fields.push(`${key}=$${i++}`); params.push(req.body[key]||null);} if(req.body.password){fields.push(`password_hash=$${i++}`);params.push(bcrypt.hashSync(req.body.password,10));} if(req.body.profile_image){fields.push(`profile_image_path=$${i++}`);params.push(await saveDataUrlImage(req.body.profile_image,`profile-user-${req.params.id}`));} if(!fields.length) return res.json({ok:true}); fields.push(`updated_at=$${i++}`); params.push(nowIso(), req.params.id); await q(`UPDATE users SET ${fields.join(', ')} WHERE id=$${i}`,params); res.json({ok:true}); } catch(e){ res.status(400).json({error:e.message}); }});
app.delete('/api/admin/users/:id', auth, requireAdmin, async (req,res)=>{
  if ((req.body?.confirm || '').trim() !== 'Confirm') return res.status(400).json({error:'Deletion not confirmed. Please type Confirm to continue.'});
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) return res.status(400).json({error:'Invalid user ID.'});
  if (targetId === Number(req.user.id)) return res.status(400).json({error:'You cannot permanently delete your own account.'});

  const client = await pool.connect();
  let storagePaths = [];
  try {
    const targetRes = await client.query('SELECT * FROM users WHERE id=$1', [targetId]);
    const target = targetRes.rows[0];
    if (!target) return res.status(404).json({error:'User not found.'});

    const storageRes = await client.query(`
      SELECT profile_image_path AS path FROM users WHERE id=$1 AND profile_image_path IS NOT NULL
      UNION ALL SELECT face_image_path AS path FROM users WHERE id=$1 AND face_image_path IS NOT NULL
      UNION ALL SELECT in_face_image_path AS path FROM attendance WHERE worker_id=$1 AND in_face_image_path IS NOT NULL
      UNION ALL SELECT out_face_image_path AS path FROM attendance WHERE worker_id=$1 AND out_face_image_path IS NOT NULL
      UNION ALL SELECT pdf_url AS path FROM monthly_attendance_reports WHERE worker_id=$1 AND pdf_url IS NOT NULL
    `, [targetId]);
    storagePaths = storageRes.rows.map(r => r.path).filter(Boolean);

    await client.query('BEGIN');

    const attendanceIdsRes = await client.query('SELECT id FROM attendance WHERE worker_id=$1', [targetId]);
    const attendanceIds = attendanceIdsRes.rows.map(r => r.id);

    await client.query('DELETE FROM daily_sales_report_items WHERE daily_sales_report_id IN (SELECT id FROM daily_sales_reports WHERE worker_id=$1 OR attendance_id IN (SELECT id FROM attendance WHERE worker_id=$1))', [targetId]);
    await client.query('DELETE FROM daily_sales_reports WHERE worker_id=$1 OR attendance_id IN (SELECT id FROM attendance WHERE worker_id=$1)', [targetId]);
    await client.query('DELETE FROM attendance_correction_requests WHERE worker_id=$1 OR approved_by=$1 OR attendance_id IN (SELECT id FROM attendance WHERE worker_id=$1)', [targetId]);
    await client.query('DELETE FROM monthly_attendance_reports WHERE worker_id=$1', [targetId]);
    await client.query('DELETE FROM login_events WHERE user_id=$1', [targetId]);
    await client.query('UPDATE stores SET location_captured_by=NULL, updated_at=$1 WHERE location_captured_by=$2', [nowIso(), targetId]);
    await client.query('UPDATE attendance SET in_face_reviewed_by=NULL, in_face_reviewed_at=NULL WHERE in_face_reviewed_by=$1', [targetId]);
    await client.query('UPDATE attendance SET out_face_reviewed_by=NULL, out_face_reviewed_at=NULL WHERE out_face_reviewed_by=$1', [targetId]);
    await client.query('DELETE FROM attendance WHERE worker_id=$1', [targetId]);
    await client.query('DELETE FROM users WHERE id=$1', [targetId]);

    await client.query('COMMIT');

    const deletedStorageObjects = await removeStorageObjects(storagePaths);
    res.json({
      ok:true,
      message:'User and linked data permanently deleted.',
      deleted_user_id: targetId,
      deleted_attendance_records: attendanceIds.length,
      deleted_storage_objects: deletedStorageObjects
    });
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(400).json({error:e.message});
  } finally {
    client.release();
  }
});
app.get('/api/admin/stores', auth, requireAdmin, async (req,res)=>{ res.json({stores:await all('SELECT * FROM stores ORDER BY active DESC, store_group ASC, name ASC')}); });
app.post('/api/admin/stores', auth, requireAdmin, async (req,res)=>{ try { const {store_group,name,code,latitude,longitude,radius_m,opening_time,closing_time}=req.body||{}; if(!name) return res.status(400).json({error:'Store name is required. Use only the retailer/store name, for example Emax, Sharaf DG, or Carrefour.'}); const safeGroup=String(store_group||'General').trim()||'General'; const safeName=String(name||'').trim(); const safeCode=String(code||slugCode(`${safeGroup}-${safeName}`)).trim(); const hasLocation=latitude!==undefined&&longitude!==undefined&&String(latitude)!==''&&String(longitude)!==''; const ts=nowIso(); const row=await one('INSERT INTO stores (store_group,name,code,latitude,longitude,radius_m,location_locked,opening_time,closing_time,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11) RETURNING id',[safeGroup,safeName,safeCode,hasLocation?Number(latitude):0,hasLocation?Number(longitude):0,Number(radius_m||STORE_RADIUS_M),hasLocation?1:0,opening_time||'10:00',closing_time||'22:00',ts,ts]); res.json({ok:true,id:row.id}); } catch(e){ if(e.code==='23505' || /stores_code_key|duplicate key/i.test(e.message||'')) return res.status(409).json({error:'This store already exists for the selected location group. Please use a different store name or code.'}); res.status(400).json({error:e.message}); }});
app.patch('/api/admin/stores/:id', auth, requireAdmin, async (req,res)=>{ const fields=[],params=[]; let i=1; for(const key of ['store_group','name','code','latitude','longitude','radius_m','opening_time','closing_time','active','location_locked']) if(req.body[key]!==undefined){fields.push(`${key}=$${i++}`);params.push(req.body[key]);} if(!fields.length) return res.json({ok:true}); fields.push(`updated_at=$${i++}`); params.push(nowIso(),req.params.id); await q(`UPDATE stores SET ${fields.join(', ')} WHERE id=$${i}`,params); res.json({ok:true}); });
app.delete('/api/admin/stores/:id', auth, requireAdmin, async (req,res)=>{
  if ((req.body?.confirm || '').trim() !== 'Confirm') return res.status(400).json({error:'Deletion not confirmed. Please type Confirm to continue.'});
  const storeId = Number(req.params.id);
  if (!Number.isFinite(storeId)) return res.status(400).json({error:'Invalid store ID.'});

  const client = await pool.connect();
  let storagePaths = [];
  try {
    const storeRes = await client.query('SELECT * FROM stores WHERE id=$1', [storeId]);
    const store = storeRes.rows[0];
    if (!store) return res.status(404).json({error:'Store not found.'});

    const storageRes = await client.query(`
      SELECT in_face_image_path AS path FROM attendance WHERE store_id=$1 AND in_face_image_path IS NOT NULL
      UNION ALL SELECT out_face_image_path AS path FROM attendance WHERE store_id=$1 AND out_face_image_path IS NOT NULL
      UNION ALL
      SELECT mr.pdf_url AS path
      FROM monthly_attendance_reports mr
      WHERE mr.pdf_url IS NOT NULL AND EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.store_id=$1
          AND a.worker_id=mr.worker_id
          AND EXTRACT(MONTH FROM a.check_in_time::timestamptz)=mr.month
          AND EXTRACT(YEAR FROM a.check_in_time::timestamptz)=mr.year
      )
    `, [storeId]);
    storagePaths = storageRes.rows.map(r => r.path).filter(Boolean);

    await client.query('BEGIN');

    const attendanceIdsRes = await client.query('SELECT id FROM attendance WHERE store_id=$1', [storeId]);
    const attendanceCount = attendanceIdsRes.rows.length;

    const reportIdsRes = await client.query('SELECT id FROM daily_sales_reports WHERE store_id=$1 OR attendance_id IN (SELECT id FROM attendance WHERE store_id=$1)', [storeId]);
    const dailyReportCount = reportIdsRes.rows.length;

    const affectedMonthlyRes = await client.query(`
      SELECT id FROM monthly_attendance_reports mr
      WHERE EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.store_id=$1
          AND a.worker_id=mr.worker_id
          AND EXTRACT(MONTH FROM a.check_in_time::timestamptz)=mr.month
          AND EXTRACT(YEAR FROM a.check_in_time::timestamptz)=mr.year
      )
    `, [storeId]);
    const monthlyReportCount = affectedMonthlyRes.rows.length;

    await client.query('DELETE FROM attendance_correction_requests WHERE attendance_id IN (SELECT id FROM attendance WHERE store_id=$1)', [storeId]);
    await client.query('DELETE FROM daily_sales_report_items WHERE daily_sales_report_id IN (SELECT id FROM daily_sales_reports WHERE store_id=$1 OR attendance_id IN (SELECT id FROM attendance WHERE store_id=$1))', [storeId]);
    await client.query('DELETE FROM daily_sales_reports WHERE store_id=$1 OR attendance_id IN (SELECT id FROM attendance WHERE store_id=$1)', [storeId]);
    await client.query(`DELETE FROM monthly_attendance_reports mr WHERE EXISTS (
      SELECT 1 FROM attendance a
      WHERE a.store_id=$1
        AND a.worker_id=mr.worker_id
        AND EXTRACT(MONTH FROM a.check_in_time::timestamptz)=mr.month
        AND EXTRACT(YEAR FROM a.check_in_time::timestamptz)=mr.year
    )`, [storeId]);
    await client.query('UPDATE users SET assigned_store_id=NULL, updated_at=$1 WHERE assigned_store_id=$2', [nowIso(), storeId]);
    await client.query('DELETE FROM attendance WHERE store_id=$1', [storeId]);
    await client.query('DELETE FROM stores WHERE id=$1', [storeId]);

    await client.query('COMMIT');

    const deletedStorageObjects = await removeStorageObjects(storagePaths);
    res.json({
      ok:true,
      message:'Store and all linked data permanently deleted.',
      deleted_store_id: storeId,
      deleted_attendance_records: attendanceCount,
      deleted_daily_sales_reports: dailyReportCount,
      deleted_monthly_reports: monthlyReportCount,
      deleted_storage_objects: deletedStorageObjects
    });
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(400).json({error:e.message});
  } finally {
    client.release();
  }
});
app.get('/api/admin/products', auth, requireAdmin, async (req,res)=>{ res.json({products:await all('SELECT * FROM products ORDER BY active DESC, display_order ASC, model ASC')}); });
app.post('/api/admin/products', auth, requireAdmin, async (req,res)=>{ const {model,name,category,default_price,display_order}=req.body||{}; if(!model) return res.status(400).json({error:'Product model is required.'}); const ts=nowIso(); const row=await one('INSERT INTO products (model,name,category,default_price,active,display_order,created_at,updated_at) VALUES ($1,$2,$3,$4,1,$5,$6,$7) RETURNING id',[model,name||model,category||'',Number(default_price||0),Number(display_order||0),ts,ts]); res.json({ok:true,id:row.id}); });
app.patch('/api/admin/products/:id', auth, requireAdmin, async (req,res)=>{ const fields=[],params=[]; let i=1; for(const key of ['model','name','category','default_price','display_order','active']) if(req.body[key]!==undefined){fields.push(`${key}=$${i++}`);params.push(req.body[key]);} if(!fields.length) return res.json({ok:true}); fields.push(`updated_at=$${i++}`); params.push(nowIso(),req.params.id); await q(`UPDATE products SET ${fields.join(', ')} WHERE id=$${i}`,params); res.json({ok:true}); });
app.delete('/api/admin/products/:id', auth, requireAdmin, async (req,res)=>{ await q('UPDATE products SET active=0,updated_at=$1 WHERE id=$2',[nowIso(),req.params.id]); res.json({ok:true,message:'Product disabled. Old report history is preserved.'}); });
app.get('/api/admin/attendance', auth, requireAdmin, async (req,res)=>{ const rows=await all(`SELECT a.*,u.name AS worker_name,u.employee_code,s.name AS store_name,s.store_group,ds.total_customers,ds.converted_customers,ds.total_qty,ds.total_value,ds.no_sale_reason FROM attendance a JOIN users u ON u.id=a.worker_id JOIN stores s ON s.id=a.store_id LEFT JOIN daily_sales_reports ds ON ds.attendance_id=a.id ORDER BY a.check_in_time DESC LIMIT 300`); res.json({attendance: await attachSignedAttendance(rows)}); });
app.patch('/api/admin/attendance/:id/face-review', auth, requireAdmin, async (req,res)=>{ const {check_type,status,note}=req.body||{}; const side=check_type==='out'?'out':'in'; const safe=['pending','approved','rejected','expired'].includes(status)?status:null; if(!safe) return res.status(400).json({error:'Status must be pending, approved, rejected, or expired.'}); const attendance=await one('SELECT * FROM attendance WHERE id=$1',[req.params.id]); if(!attendance) return res.status(404).json({error:'Attendance record not found.'}); const statusColumn=side==='in'?'in_face_review_status':'out_face_review_status'; const byColumn=side==='in'?'in_face_reviewed_by':'out_face_reviewed_by'; const atColumn=side==='in'?'in_face_reviewed_at':'out_face_reviewed_at'; const ts=nowIso(); const existing=attendance.face_review_notes?`${attendance.face_review_notes}\n`:''; const newNote=`${existing}${dayjs(ts).format('YYYY-MM-DD HH:mm')} ${side.toUpperCase()} selfie ${safe} by ${req.user.name}${note?`: ${note}`:''}`; await q(`UPDATE attendance SET ${statusColumn}=$1,${byColumn}=$2,${atColumn}=$3,face_review_notes=$4,updated_at=$5 WHERE id=$6`,[safe,req.user.id,ts,newNote,ts,req.params.id]); res.json({ok:true}); });
app.get('/api/admin/reports/monthly', auth, requireAdmin, async (req,res)=>{ const {month,year}=req.query; let rows; if(month&&year) rows=await all('SELECT mr.*,u.name AS worker_name,u.employee_code FROM monthly_attendance_reports mr JOIN users u ON u.id=mr.worker_id WHERE mr.month=$1 AND mr.year=$2 ORDER BY u.name',[month,year]); else rows=await all('SELECT mr.*,u.name AS worker_name,u.employee_code FROM monthly_attendance_reports mr JOIN users u ON u.id=mr.worker_id ORDER BY mr.year DESC,mr.month DESC,u.name'); res.json({reports:rows}); });
app.post('/api/admin/reports/monthly/generate', auth, requireAdmin, async (req,res)=>{ try { const month=Number(req.body.month), year=Number(req.body.year); if(!month||!year||month<1||month>12) return res.status(400).json({error:'Valid month and year are required.'}); const reports=await generateMonthlyReports(month,year,req.body.worker_id||null); res.json({ok:true,reports}); } catch(e){ res.status(500).json({error:e.message}); }});

app.get('/api/reports/:reportId/download', auth, async (req,res)=>{ const report=await one('SELECT * FROM monthly_attendance_reports WHERE report_id=$1',[req.params.reportId]); if(!report) return res.status(404).json({error:'Report not found.'}); if(req.user.role==='worker'&&Number(report.worker_id)!==Number(req.user.id)) return res.status(403).json({error:'You can only download your own reports.'}); const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).download(report.pdf_url); if(error) return res.status(404).json({error:'PDF file missing from storage.'}); const buffer=Buffer.from(await data.arrayBuffer()); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="${report.report_id}.pdf"`); res.send(buffer); });
app.get('/verify-report/:reportId', async (req,res)=>{ const report=await one('SELECT mr.*,u.name AS worker_name,u.employee_code FROM monthly_attendance_reports mr JOIN users u ON u.id=mr.worker_id WHERE mr.report_id=$1',[req.params.reportId]); if(!report) return res.status(404).send('<h1>Report not found</h1><p>This report ID does not exist.</p>'); res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify Report</title><style>body{font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:35px;color:#111}.card{max-width:760px;background:#fff;margin:auto;padding:28px;border-radius:18px;box-shadow:0 10px 30px #0001}.valid{color:#087a2e}img{width:170px}</style></head><body><div class="card"><img src="/assets/jimmy-logo.svg"><h1 class="valid">Valid Jimmy Report</h1><p><b>Report ID:</b> ${report.report_id}</p><p><b>Merchandiser:</b> ${report.worker_name} (${report.employee_code||''})</p><p><b>Month:</b> ${report.month}/${report.year}</p><p><b>Status:</b> ${report.status}</p><p><b>Generated:</b> ${report.generated_at}</p><p><b>Hash:</b> ${report.pdf_hash}</p></div></body></html>`); });

cron.schedule('5 0 1 * *', async ()=>{ const prev=dayjs().subtract(1,'month'); try { await generateMonthlyReports(prev.month()+1, prev.year()); console.log('Monthly reports generated successfully.'); } catch(e){ console.error('Monthly report generation failed:', e); } });
app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));

(async()=>{
  try {
    await ensureSchema();
    await ensureStorageBucket();
    await seedDb();
    app.listen(PORT, () => {
      console.log(`Jimmy attendance system running at ${APP_URL}`);
      console.log('Persistent storage mode: PostgreSQL database + Supabase Storage.');
      console.log('Automatic selfie deletion is disabled. Records are kept until you remove them manually.');
    });
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
})();
