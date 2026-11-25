import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { initDb } from '../server/db/initDb';
import { seedDemoDataIfEmpty } from '../server/db/seedData';
import { buildPhdTemplateWorkbook, buildScientistTemplateWorkbook } from '../server/services/excel';

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
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

async function devLogin(email: string): Promise<{ token: string; user: any }> {
  const r = await reqJson('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ email }) });
  assert.equal(r.status, 200, `Expected dev-login 200 for ${email}, got ${r.status}: ${r.text}`);
  return r.json;
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DEV_LOGIN = 'true';
  process.env.CRON_SECRET = 'test-cron-secret';
  tempDbFile = path.join(os.tmpdir(), `uet-phdhub-test-${Date.now()}.db`);
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

test('API health & role-based access: Admin, CTSV Staff, Supervisor, External Expert, and PhD Student', async () => {
  const health = await reqJson('/api/ready');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);

  const admin = await devLogin('ctsv.admin@vnu.edu.vn');
  const staff = await devLogin('chuyenvien.ctsv@vnu.edu.vn');
  const supervisor = await devLogin('phuongttm@vnu.edu.vn');
  const externalExpert = await devLogin('tuanva@soict.hust.edu.vn');
  const phdStudent = await devLogin('anhnd.ncs@vnu.edu.vn');
  const externalPhd = await devLogin('viet.tran@external-lab.vn');

  assert.equal(admin.user.role, 'admin');
  assert.equal(staff.user.role, 'staff');
  assert.equal(supervisor.user.role, 'supervisor');
  assert.equal(externalExpert.user.role, 'supervisor');
  assert.equal(phdStudent.user.role, 'phd_student');
  assert.equal(externalPhd.user.role, 'phd_student');

  // Unlisted external email is rejected with 403
  const stranger = await reqJson('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ email: 'random@gmail.com' }),
  });
  assert.equal(stranger.status, 403);

  // Dashboard accessible to Staff & Admin, forbidden for PhD Student
  assert.equal((await reqJson('/api/dashboard/summary', {}, staff.token)).status, 200);
  assert.equal((await reqJson('/api/dashboard/summary', {}, phdStudent.token)).status, 403);

  // Regulation settings writable only by Admin (not Staff)
  const staffSettings = await reqJson(
    '/api/settings/regulation-3638',
    { method: 'PUT', body: JSON.stringify({ standardHoursPerUnit: 60 }) },
    staff.token
  );
  assert.equal(staffSettings.status, 403);
});

test('Confidentiality enforcement: Independent Reviewers (PBĐL) and Scientist CCCD/MST/Bank hidden from NCS & CBHD', async () => {
  const staff = await devLogin('chuyenvien.ctsv@vnu.edu.vn');
  const supervisor = await devLogin('phuongttm@vnu.edu.vn');
  const phdStudent = await devLogin('anhnd.ncs@vnu.edu.vn');

  const phdId = phdStudent.user.phd_student_id;

  // Staff sees full PBĐL details
  const staffDetail = await reqJson(`/api/phd-students/${phdId}`, {}, staff.token);
  assert.equal(staffDetail.status, 200);
  assert.ok(staffDetail.json.ir1_info, 'Staff must see PBĐL 1');
  assert.ok(staffDetail.json.deadlines.irDue, 'Staff must see PBĐL due countdown');

  // PhD Student MUST NOT see PBĐL fields
  const phdDetail = await reqJson(`/api/phd-students/${phdId}`, {}, phdStudent.token);
  assert.equal(phdDetail.status, 200);
  assert.equal(phdDetail.json.ir1_info, undefined);
  assert.equal(phdDetail.json.ir2_info, undefined);
  assert.equal(phdDetail.json.ir_due_date, undefined);
  assert.equal(phdDetail.json.deadlines.irDue, undefined);

  // Supervisor MUST NOT see PBĐL fields either
  const supDetail = await reqJson(`/api/phd-students/${phdId}`, {}, supervisor.token);
  assert.equal(supDetail.status, 200);
  assert.equal(supDetail.json.ir1_info, undefined);
  assert.equal(supDetail.json.ir_result, undefined);

  // Supervisor cannot query independent_reviewer list
  const irList = await reqJson('/api/scientists?listType=independent_reviewer', {}, supervisor.token);
  assert.equal(irList.status, 403);

  // Financial info (cccd, tax_code, bank_account) visible to Staff and self, stripped for other scientists
  const sciForSup = await reqJson('/api/scientists?listType=supervisor', {}, supervisor.token);
  assert.equal(sciForSup.status, 200);
  const otherSci = sciForSup.json.items.find((s: any) => s.id !== supervisor.user.scientist_id);
  const selfSci = sciForSup.json.items.find((s: any) => s.id === supervisor.user.scientist_id);
  assert.equal(otherSci.cccd, undefined);
  assert.equal(otherSci.bank_account, undefined);
  assert.ok(selfSci.cccd, 'Scientist can view own CCCD');
});

test('Excel Import preview/commit, PDF confidential document access, and Deadline Reminder scanner', async () => {
  const staff = await devLogin('chuyenvien.ctsv@vnu.edu.vn');
  const phdStudent = await devLogin('anhnd.ncs@vnu.edu.vn');

  // 1. Preview & Commit PhD Excel template
  const phdBuf = buildPhdTemplateWorkbook();
  const prevRes = await fetch(`${baseUrl}/api/excel/import/phd-students/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staff.token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent('sample-ncs.xlsx'),
    },
    body: new Uint8Array(phdBuf),
  });
  assert.equal(prevRes.status, 200);
  const prevJson = await prevRes.json();
  assert.equal(prevJson.summary.create, 1);

  const commitRes = await reqJson(`/api/excel/import/phd-students/${prevJson.previewId}/commit`, { method: 'POST' }, staff.token);
  assert.equal(commitRes.status, 200);
  assert.equal(commitRes.json.created, 1);

  // 2. Preview Scientist Excel template
  const sciBuf = buildScientistTemplateWorkbook();
  const sciPrev = await fetch(`${baseUrl}/api/excel/import/scientists/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staff.token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent('sample-sci.xlsx'),
    },
    body: new Uint8Array(sciBuf),
  });
  assert.equal(sciPrev.status, 200);

  // 3. Upload confidential IR PDF -> Staff can view, PhD Student gets 403
  const pdfMock = Buffer.from('%PDF-1.4\n%Mock Confidential IR Document\n%%EOF');
  const uploadRes = await fetch(
    `${baseUrl}/api/documents/upload?entityType=phd_student&entityId=${phdStudent.user.phd_student_id}&category=ir_document&title=Phieu_PBDL_1&confidential=1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staff.token}`,
        'Content-Type': 'application/pdf',
        'X-File-Name': encodeURIComponent('pbdl1.pdf'),
      },
      body: new Uint8Array(pdfMock),
    }
  );
  assert.equal(uploadRes.status, 201);
  const uploadedDoc = await uploadRes.json();

  const staffView = await fetch(`${baseUrl}/api/documents/${uploadedDoc.id}/view`, {
    headers: { Authorization: `Bearer ${staff.token}` },
  });
  assert.equal(staffView.status, 200);

  const phdView = await fetch(`${baseUrl}/api/documents/${uploadedDoc.id}/view`, {
    headers: { Authorization: `Bearer ${phdStudent.token}` },
  });
  assert.equal(phdView.status, 403);

  // 4. Cron deadline scan produces reminders without leaking confidential IR reminder to NCS
  const scanRes = await reqJson(
    '/api/cron/scan-deadlines',
    { method: 'POST', headers: { 'X-Cron-Secret': 'test-cron-secret' } }
  );
  assert.equal(scanRes.status, 200);
  assert.ok(scanRes.json.notificationsCreated > 0);

  const phdNotifs = await reqJson('/api/notifications/my', {}, phdStudent.token);
  assert.equal(phdNotifs.status, 200);
  assert.equal(
    phdNotifs.json.items.some((n: any) => String(n.type).includes('ir_confidential')),
    false,
    'NCS must NEVER receive confidential PBĐL deadline notifications'
  );
});
