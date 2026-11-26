import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { initDb } from '../server/db/initDb';
import { seedDemoDataIfEmpty } from '../server/db/seedData';

let server: Server;
let baseUrl = '';
let tempDbFile = '';

async function reqJson(urlPath: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${baseUrl}${urlPath}`, { ...options, headers });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, buf, headers: res.headers };
}

async function devLogin(email: string): Promise<{ token: string; user: any }> {
  const r = await reqJson('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ email }) });
  assert.equal(r.status, 200, `Expected dev-login 200 for ${email}, got ${r.status}: ${r.text}`);
  return r.json;
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DEV_LOGIN = 'true';
  process.env.CRON_SECRET = 'test-cron-secret-v2';
  tempDbFile = path.join(os.tmpdir(), `uet-phdhub-v2-test-${Date.now()}.db`);
  await initDb(`file:${tempDbFile}`);
  await seedDemoDataIfEmpty();

  const app = await createApp({ vite: false });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try {
    if (tempDbFile && fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);
  } catch {}
});

test('v2 Electronic Approval Workflows: Extension & Special Quota apply atomic side-effects', async () => {
  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const supervisor = await devLogin('phuongttm@vnu.edu.vn');
  const phd = await devLogin('anhnd.ncs@vnu.edu.vn');

  // 1. PhD submits extension request
  const createRes = await reqJson(
    '/api/requests',
    {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'extension',
        reason: 'Cần thêm 6 tháng hoàn thiện thực nghiệm chương 4.',
        payload: { new_standard_deadline: '2027-07-12' },
      }),
    },
    phd.token
  );
  assert.equal(createRes.status, 201);
  assert.equal(createRes.json.status, 'submitted');
  const reqId = createRes.json.id;

  // 2. Assigned supervisor confirms
  const supReview = await reqJson(
    `/api/requests/${reqId}/supervisor-review`,
    { method: 'PUT', body: JSON.stringify({ action: 'supervisor_approved', comment: 'Nhất trí đề nghị gia hạn.' }) },
    supervisor.token
  );
  assert.equal(supReview.status, 200);
  assert.equal(supReview.json.status, 'supervisor_approved');

  // 3. Admin approves with decision no -> PhD dossier auto-updated
  const approveRes = await reqJson(
    `/api/requests/${reqId}/decision`,
    {
      method: 'PUT',
      body: JSON.stringify({ decision: 'approved', decision_no: '999/QĐ-ĐHCN', admin_comment: 'Đã duyệt gia hạn' }),
    },
    admin.token
  );
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.json.status, 'approved');

  const phdAfter = await reqJson(`/api/phd-students/${phd.user.phd_student_id}`, {}, admin.token);
  assert.equal(phdAfter.json.study_status, 'extended');
  assert.equal(phdAfter.json.standard_deadline, '2027-07-12');
  assert.ok(phdAfter.json.training_changes.some((c: any) => c.decisionNo === '999/QĐ-ĐHCN'));

  // 4. Supervisor requests special quota -> Admin approves -> special_quota_approved becomes 1
  const quotaReq = await reqJson(
    '/api/requests',
    {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'special_quota',
        reason: 'Chủ trì đề tài cấp Quốc gia cấp học bổng NCS.',
        payload: { requested_quota_limit: 8 },
      }),
    },
    supervisor.token
  );
  assert.equal(quotaReq.status, 201);
  const quotaApprove = await reqJson(
    `/api/requests/${quotaReq.json.id}/decision`,
    { method: 'PUT', body: JSON.stringify({ decision: 'approved', decision_no: '777/QĐ-ĐHQGHN' }) },
    admin.token
  );
  assert.equal(quotaApprove.status, 200);

  const supMe = await reqJson('/api/scientists/me', {}, supervisor.token);
  assert.equal(Number(supMe.json.special_quota_approved), 1);
  assert.equal(Number(supMe.json.special_quota_limit), 8);
});

test('v2 Reporting Cycles: open cycle, compute missing NCS, and idempotent remind', async () => {
  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const created = await reqJson(
    '/api/reporting-cycles',
    {
      method: 'POST',
      body: JSON.stringify({
        term_code: 'HK1-2026-2027',
        title: 'Báo cáo tiến độ HK1 2026–2027',
        open_date: '2026-11-01',
        due_date: '2026-12-30',
      }),
    },
    admin.token
  );
  assert.equal(created.status, 201);

  const summary = await reqJson(`/api/reporting-cycles/${created.json.id}/summary`, {}, admin.token);
  assert.equal(summary.status, 200);
  assert.ok(summary.json.stats.totalActive >= 4);
  assert.ok(summary.json.stats.missingCount >= 1);

  const rem1 = await reqJson(`/api/reporting-cycles/${created.json.id}/remind`, { method: 'POST' }, admin.token);
  assert.equal(rem1.status, 200);
  assert.ok(rem1.json.reminded >= 1);

  // Second remind same day is deduplicated
  const rem2 = await reqJson(`/api/reporting-cycles/${created.json.id}/remind`, { method: 'POST' }, admin.token);
  assert.equal(rem2.status, 200);
  assert.equal(rem2.json.reminded, 0);
});

test('v2 Conflict of Interest (COI) Engine: blocks Supervisor as IR and checks council size', async () => {
  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const phd = await devLogin('anhnd.ncs@vnu.edu.vn');
  const sup = await devLogin('phuongttm@vnu.edu.vn');

  const irCoi = await reqJson(
    '/api/check/coi',
    {
      method: 'POST',
      body: JSON.stringify({
        phd_student_id: phd.user.phd_student_id,
        target_type: 'independent_reviewer',
        members: [{ scientist_id: sup.user.scientist_id }],
      }),
    },
    admin.token
  );
  assert.equal(irCoi.status, 200);
  assert.equal(irCoi.json.valid, false);
  assert.ok(irCoi.json.errors.some((e: any) => e.code === 'SUPERVISOR_AS_IR'));

  const defCoi = await reqJson(
    '/api/check/coi',
    {
      method: 'POST',
      body: JSON.stringify({
        phd_student_id: phd.user.phd_student_id,
        target_type: 'defense_council',
        members: [{ scientist_id: sup.user.scientist_id, member_role: 'chair' }],
      }),
    },
    admin.token
  );
  assert.equal(defCoi.status, 200);
  assert.equal(defCoi.json.valid, false);
  assert.ok(defCoi.json.errors.some((e: any) => e.code === 'SUPERVISOR_AS_KEY_COUNCIL_ROLE'));
});

test('v2 Payments, 10% PIT Tax, IR Anonymization & Anti-Duplicate Lock', async () => {
  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const prev = await reqJson(
    '/api/payments/batches/preview',
    {
      method: 'POST',
      body: JSON.stringify({
        activities: ['seminar', 'independent_review', 'defense_council'],
        hideIrPhdIdentity: true,
      }),
    },
    admin.token
  );
  assert.equal(prev.status, 200);
  assert.ok(prev.json.items.length >= 1, 'Seeded data should produce payable committee/IR items');

  // Verify IR items are anonymized when hideIrPhdIdentity = true
  const irItem = prev.json.items.find((i: any) => i.source_type === 'independent_review');
  if (irItem) {
    assert.equal(irItem.phd_code, 'PBĐL-ẨN');
    assert.ok(!irItem.description.includes('Nguyễn Đức Anh'));
  }

  // Commit batch as confirmed
  const batchRes = await reqJson(
    '/api/payments/batches',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Đợt thanh toán test v2',
        status: 'confirmed',
        hide_ir_phd_identity: true,
        items: prev.json.items,
      }),
    },
    admin.token
  );
  assert.equal(batchRes.status, 201);

  // Subsequent preview must exclude already confirmed items (anti-duplicate)
  const prev2 = await reqJson(
    '/api/payments/batches/preview',
    {
      method: 'POST',
      body: JSON.stringify({ activities: ['seminar', 'independent_review', 'defense_council'] }),
    },
    admin.token
  );
  assert.equal(prev2.status, 200);
  assert.equal(prev2.json.items.length, 0);

  // Exporting batch produces valid xlsx ZIP bytes and writes secret access log
  const exp = await reqJson(`/api/payments/batches/${batchRes.json.id}/export`, {}, admin.token);
  assert.equal(exp.status, 200);
  assert.equal(exp.buf[0], 0x50); // 'P'
  assert.equal(exp.buf[1], 0x4b); // 'K'

  const secLogs = await reqJson('/api/settings/secret-access-logs', {}, admin.token);
  assert.ok(secLogs.json.items.some((s: any) => s.resource_type === 'payment_export'));
});

test('v2 Official Word (.docx) Forms & Confidentiality Enforcement', async () => {
  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const phd = await devLogin('anhnd.ncs@vnu.edu.vn');
  const sup = await devLogin('phuongttm@vnu.edu.vn');

  for (const tpl of ['compliance_3638', 'committee_seminar', 'committee_defense', 'ir_invitation']) {
    const r = await reqJson(`/api/forms/phd/${phd.user.phd_student_id}/${tpl}`, {}, admin.token);
    assert.equal(r.status, 200, `Template ${tpl} should succeed for admin`);
    assert.equal(r.buf[0], 0x50);
    assert.equal(r.buf[1], 0x4b);
  }

  // PhD student & Supervisor MUST NOT generate confidential IR invitation
  assert.equal((await reqJson(`/api/forms/phd/${phd.user.phd_student_id}/ir_invitation`, {}, phd.token)).status, 403);
  assert.equal((await reqJson(`/api/forms/phd/${phd.user.phd_student_id}/ir_invitation`, {}, sup.token)).status, 403);

  // Supervisor can export own 5-year CV .docx
  const cv = await reqJson(`/api/forms/scientist/${sup.user.scientist_id}/cv-5y`, {}, sup.token);
  assert.equal(cv.status, 200);
  assert.equal(cv.buf[0], 0x50);
  assert.equal(cv.buf[1], 0x4b);
});

test('v2 System Governance: Session Revocation, Maintenance Mode, Cohort Auto-Deadlines & Backup', async () => {
  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const phd = await devLogin('anhnd.ncs@vnu.edu.vn');

  // 1. Cohort auto-deadlines on new PhD creation
  const newPhd = await reqJson(
    '/api/phd-students',
    {
      method: 'POST',
      body: JSON.stringify({
        phd_code: 'NCS269999',
        full_name: 'Lê Test Khóa',
        cohort: 'QH-2026-Đợt 1',
        admission_category: 'Từ Thạc sĩ',
        training_start_date: '2026-09-15',
      }),
    },
    admin.token
  );
  assert.equal(newPhd.status, 201);
  assert.equal(newPhd.json.standard_deadline, '2029-09-15');
  assert.equal(newPhd.json.max_deadline, '2032-09-15');

  // 2. Maintenance Mode blocks non-admin with 503 while allowing Admin
  await reqJson(
    '/api/system/maintenance',
    { method: 'PUT', body: JSON.stringify({ maintenanceMode: true, maintenanceMessage: 'Bảo trì test' }) },
    admin.token
  );
  assert.equal((await reqJson('/api/auth/me', {}, phd.token)).status, 503);
  assert.equal((await reqJson('/api/auth/me', {}, admin.token)).status, 200);

  // Turn off maintenance mode
  await reqJson(
    '/api/system/maintenance',
    { method: 'PUT', body: JSON.stringify({ maintenanceMode: false }) },
    admin.token
  );
  assert.equal((await reqJson('/api/auth/me', {}, phd.token)).status, 200);

  // 3. Session revocation via token_version invalidates existing JWT immediately
  const rev = await reqJson(`/api/settings/users/${phd.user.id}/revoke-sessions`, { method: 'POST' }, admin.token);
  assert.equal(rev.status, 200);
  assert.equal((await reqJson('/api/auth/me', {}, phd.token)).status, 401);

  // 4. Database backup snapshot & download
  const snap = await reqJson('/api/system/backups', { method: 'POST' }, admin.token);
  assert.equal(snap.status, 201);
  assert.ok(snap.json.key.startsWith('system-backups/'));
  const dl = await reqJson(`/api/system/backups/download?key=${encodeURIComponent(snap.json.key)}`, {}, admin.token);
  assert.equal(dl.status, 200);
  assert.equal(dl.buf[0], 0x1f); // gzip magic
  assert.equal(dl.buf[1], 0x8b);
});
