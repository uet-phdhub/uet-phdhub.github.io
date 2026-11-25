import { Router } from 'express';
import {
  calculatePublicationPoint,
  calculateSupervisorQuotaAndHours,
  evaluateScientistResearchCapacity,
  formatTitleDisplay,
} from '../../shared/regulation3638';
import type { AuthUser } from '../../shared/types';
import { db } from '../db';
import { authenticateToken, isAdminOrStaff, requireRoles } from '../middlewares/auth';
import { recordAudit } from '../services/audit';
import { getRegulationConfig } from '../services/settings';
import type { AuthedRequest } from '../types';

export const scientistsRouter = Router();

const FINANCIAL_FIELDS = ['cccd', 'tax_code', 'bank_account', 'bank_name'];

export async function loadEnrichedScientists(
  filters: {
    listType?: string;
    search?: string;
    isInternal?: string;
    quotaStatus?: string;
    meets3638?: string;
    scientistId?: number;
  },
  viewer: AuthUser
) {
  const config = await getRegulationConfig();
  const adminOrStaff = isAdminOrStaff(viewer);

  const where: string[] = [];
  const args: any[] = [];

  if (filters.scientistId) {
    where.push('s.id = ?');
    args.push(filters.scientistId);
  }
  if (filters.listType === 'supervisor') where.push('s.is_supervisor = 1');
  else if (filters.listType === 'seminar') where.push('s.is_seminar_member = 1');
  else if (filters.listType === 'independent_reviewer') where.push('s.is_independent_reviewer = 1');
  else if (filters.listType === 'defense_council') where.push('s.is_defense_council_member = 1');

  if (filters.isInternal === '1') where.push('s.is_internal = 1');
  else if (filters.isInternal === '0') where.push('s.is_internal = 0');

  if (filters.search) {
    const q = `%${filters.search.trim()}%`;
    where.push('(s.full_name LIKE ? OR s.email LIKE ? OR s.work_unit LIKE ? OR s.specialization LIKE ? OR s.phone LIKE ?)');
    args.push(q, q, q, q, q);
  }

  const scientists = (
    await db.execute({
      sql: `SELECT s.* FROM scientists s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.full_name ASC`,
      args,
    })
  ).rows as any[];

  if (scientists.length === 0) return [];

  const ids = scientists.map((s) => Number(s.id));
  const ph = ids.map(() => '?').join(',');

  const [pubsRes, supsRes, commRes, irRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM scientist_publications WHERE scientist_id IN (${ph}) ORDER BY pub_year DESC, id DESC`, args: ids }),
    db.execute({
      sql: `SELECT ps.*, p.phd_code, p.full_name as phd_name, p.study_status, p.is_completed, p.dissertation_title
            FROM phd_supervisions ps
            JOIN phd_students p ON p.id = ps.phd_student_id
            WHERE ps.scientist_id IN (${ph})`,
      args: ids,
    }),
    db.execute({
      sql: `SELECT cm.*, p.phd_code, p.full_name as phd_name
            FROM phd_committee_members cm
            JOIN phd_students p ON p.id = cm.phd_student_id
            WHERE cm.scientist_id IN (${ph})`,
      args: ids,
    }),
    adminOrStaff
      ? db.execute({
          sql: `SELECT id, phd_code, full_name, ir1_scientist_id, ir2_scientist_id, ir3_scientist_id, ir_due_date, ir_result
                FROM phd_students
                WHERE ir1_scientist_id IN (${ph}) OR ir2_scientist_id IN (${ph}) OR ir3_scientist_id IN (${ph})`,
          args: [...ids, ...ids, ...ids],
        })
      : Promise.resolve({ rows: [] }),
  ]);

  const pubsMap = new Map<number, any[]>();
  for (const pub of pubsRes.rows as any[]) {
    const sid = Number(pub.scientist_id);
    if (!pubsMap.has(sid)) pubsMap.set(sid, []);
    pubsMap.get(sid)!.push({
      ...pub,
      pubYear: Number(pub.pub_year),
      pubType: pub.pub_type,
      authorRole: pub.author_role,
      hdgsnnMaxPoint: pub.hdgsnn_max_point,
      calculated_point: calculatePublicationPoint(
        { pubType: pub.pub_type, authorRole: pub.author_role, hdgsnnMaxPoint: pub.hdgsnn_max_point, totalAuthors: pub.total_authors },
        config
      ),
    });
  }

  const supsMap = new Map<number, any[]>();
  for (const sup of supsRes.rows as any[]) {
    const sid = Number(sup.scientist_id);
    if (!supsMap.has(sid)) supsMap.set(sid, []);
    supsMap.get(sid)!.push(sup);
  }

  const commMap = new Map<number, any[]>();
  for (const cm of commRes.rows as any[]) {
    const sid = Number(cm.scientist_id);
    if (!commMap.has(sid)) commMap.set(sid, []);
    commMap.get(sid)!.push(cm);
  }

  const irMap = new Map<number, any[]>();
  for (const row of irRes.rows as any[]) {
    for (const col of ['ir1_scientist_id', 'ir2_scientist_id', 'ir3_scientist_id']) {
      const sid = Number(row[col]);
      if (sid > 0) {
        if (!irMap.has(sid)) irMap.set(sid, []);
        irMap.get(sid)!.push({
          phd_student_id: Number(row.id),
          phd_code: row.phd_code,
          phd_name: row.full_name,
          slot: col.slice(0, 3).toUpperCase(),
          ir_due_date: row.ir_due_date,
          ir_result: row.ir_result,
        });
      }
    }
  }

  let items = scientists.map((raw) => {
    const sid = Number(raw.id);
    const canSeeFinancial = adminOrStaff || viewer.scientist_id === sid;
    const s: any = { ...raw };
    if (!canSeeFinancial) {
      for (const f of FINANCIAL_FIELDS) delete s[f];
    }

    const pubs = pubsMap.get(sid) || [];
    const sups = supsMap.get(sid) || [];
    const comms = commMap.get(sid) || [];
    const researchEvaluation = evaluateScientistResearchCapacity(pubs, config);
    const quotaEvaluation = calculateSupervisorQuotaAndHours(raw, sups, researchEvaluation, config);

    let eligibleRoles: string[] = [];
    try {
      eligibleRoles = JSON.parse(raw.supervisor_eligible_roles || '[]');
    } catch {
      eligibleRoles = [];
    }

    return {
      ...s,
      title_display: raw.title_display || formatTitleDisplay(raw.academic_rank, raw.academic_degree),
      supervisor_eligible_roles_list: eligibleRoles,
      publications: pubs,
      supervisions: sups,
      seminarParticipations: comms.filter((c) => c.committee_type === 'seminar'),
      defenseParticipations: comms.filter((c) => c.committee_type === 'defense'),
      ...(adminOrStaff ? { irParticipations: irMap.get(sid) || [] } : {}),
      researchEvaluation,
      quotaEvaluation,
    };
  });

  if (filters.quotaStatus && filters.quotaStatus !== 'all') {
    items = items.filter((i) => i.quotaEvaluation.status === filters.quotaStatus);
  }
  if (filters.meets3638 === 'yes') {
    items = items.filter((i) => {
      if (filters.listType === 'seminar') return i.researchEvaluation.meetsSeminar;
      if (filters.listType === 'independent_reviewer') return i.researchEvaluation.meetsReviewer;
      if (filters.listType === 'defense_council') return i.researchEvaluation.meetsCouncil;
      return i.researchEvaluation.meetsSupervisor;
    });
  } else if (filters.meets3638 === 'no') {
    items = items.filter((i) => {
      if (filters.listType === 'seminar') return !i.researchEvaluation.meetsSeminar;
      if (filters.listType === 'independent_reviewer') return !i.researchEvaluation.meetsReviewer;
      if (filters.listType === 'defense_council') return !i.researchEvaluation.meetsCouncil;
      return !i.researchEvaluation.meetsSupervisor;
    });
  }

  return items;
}

scientistsRouter.get('/api/scientists', authenticateToken, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const q = req.query;
  // Non-admin/staff cannot query the confidential independent_reviewer list
  if (q.listType === 'independent_reviewer' && !isAdminOrStaff(user)) {
    return res.status(403).json({ error: 'Danh sách phản biện độc lập chỉ dành cho Phòng Công tác sinh viên.' });
  }
  const items = await loadEnrichedScientists(
    {
      listType: typeof q.listType === 'string' ? q.listType : 'all',
      search: typeof q.search === 'string' ? q.search : undefined,
      isInternal: typeof q.isInternal === 'string' ? q.isInternal : undefined,
      quotaStatus: typeof q.quotaStatus === 'string' ? q.quotaStatus : undefined,
      meets3638: typeof q.meets3638 === 'string' ? q.meets3638 : undefined,
    },
    user
  );
  res.json({ items, total: items.length });
});

scientistsRouter.get('/api/scientists/me', authenticateToken, requireRoles('supervisor', 'admin', 'staff'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!user.scientist_id) {
    return res.status(404).json({ error: 'Tài khoản này chưa được liên kết với hồ sơ Cán bộ/Nhà khoa học.' });
  }
  const items = await loadEnrichedScientists({ scientistId: user.scientist_id }, user);
  if (!items[0]) return res.status(404).json({ error: 'Không tìm thấy hồ sơ Cán bộ.' });
  res.json(items[0]);
});

scientistsRouter.get('/api/scientists/:id', authenticateToken, async (req: AuthedRequest, res) => {
  const sid = Number(req.params.id);
  const items = await loadEnrichedScientists({ scientistId: sid }, req.user!);
  if (!items[0]) return res.status(404).json({ error: 'Không tìm thấy hồ sơ Cán bộ.' });
  res.json(items[0]);
});

scientistsRouter.post('/api/scientists', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.full_name) return res.status(400).json({ error: 'Vui lòng nhập Họ và tên cán bộ.' });

  const rank = String(b.academic_rank || '').trim();
  const degree = String(b.academic_degree || '').trim();
  const titleDisplay = String(b.title_display || '').trim() || formatTitleDisplay(rank, degree);
  const email = b.email ? String(b.email).trim().toLowerCase() : null;

  try {
    const ins = await db.execute({
      sql: `INSERT INTO scientists (
              full_name, academic_rank, academic_degree, title_display, recognition_year,
              specialization, work_unit, is_internal, email, phone,
              bank_account, bank_name, cccd, tax_code,
              is_supervisor, is_seminar_member, is_independent_reviewer, is_defense_council_member,
              supervisor_eligible_roles, special_quota_approved, special_quota_limit,
              special_quota_reason, special_quota_decision, has_major_grant_scholarship, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        String(b.full_name).trim(),
        rank,
        degree,
        titleDisplay,
        b.recognition_year ? Number(b.recognition_year) : null,
        String(b.specialization || '').trim(),
        String(b.work_unit || '').trim(),
        b.is_internal === false || b.is_internal === 0 ? 0 : 1,
        email,
        String(b.phone || '').trim(),
        String(b.bank_account || '').trim(),
        String(b.bank_name || '').trim(),
        String(b.cccd || '').trim(),
        String(b.tax_code || '').trim(),
        b.is_supervisor ? 1 : 0,
        b.is_seminar_member ? 1 : 0,
        b.is_independent_reviewer ? 1 : 0,
        b.is_defense_council_member ? 1 : 0,
        JSON.stringify(Array.isArray(b.supervisor_eligible_roles_list) ? b.supervisor_eligible_roles_list : ['independent', 'primary', 'secondary', 'co']),
        b.special_quota_approved ? 1 : 0,
        b.special_quota_limit ? Number(b.special_quota_limit) : null,
        String(b.special_quota_reason || '').trim(),
        String(b.special_quota_decision || '').trim(),
        b.has_major_grant_scholarship ? 1 : 0,
        String(b.notes || '').trim(),
      ],
    });
    const newId = Number(ins.lastInsertRowid);
    await recordAudit(req.user, 'create', 'scientist', newId, `Thêm mới hồ sơ Cán bộ ${titleDisplay} ${b.full_name}`);
    const items = await loadEnrichedScientists({ scientistId: newId }, req.user!);
    res.status(201).json(items[0]);
  } catch (err: any) {
    if (/UNIQUE constraint failed/i.test(err?.message || '')) {
      return res.status(409).json({ error: 'Email cán bộ đã tồn tại trong danh mục.' });
    }
    throw err;
  }
});

scientistsRouter.put('/api/scientists/:id', authenticateToken, async (req: AuthedRequest, res) => {
  const sid = Number(req.params.id);
  const user = req.user!;
  const isSelf = user.scientist_id === sid;
  if (!isAdminOrStaff(user) && !isSelf) {
    return res.status(403).json({ error: 'Bạn chỉ có thể cập nhật hồ sơ của chính mình.' });
  }

  const existing = (await db.execute({ sql: 'SELECT * FROM scientists WHERE id = ?', args: [sid] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy hồ sơ Cán bộ.' });

  const b = req.body || {};
  const rank = b.academic_rank !== undefined ? String(b.academic_rank).trim() : existing.academic_rank;
  const degree = b.academic_degree !== undefined ? String(b.academic_degree).trim() : existing.academic_degree;
  const titleDisplay = b.title_display !== undefined ? String(b.title_display).trim() : formatTitleDisplay(rank, degree);

  try {
    if (isAdminOrStaff(user)) {
      await db.execute({
        sql: `UPDATE scientists
              SET full_name = ?, academic_rank = ?, academic_degree = ?, title_display = ?, recognition_year = ?,
                  specialization = ?, work_unit = ?, is_internal = ?, email = ?, phone = ?,
                  bank_account = ?, bank_name = ?, cccd = ?, tax_code = ?,
                  is_supervisor = ?, is_seminar_member = ?, is_independent_reviewer = ?, is_defense_council_member = ?,
                  supervisor_eligible_roles = ?, special_quota_approved = ?, special_quota_limit = ?,
                  special_quota_reason = ?, special_quota_decision = ?, has_major_grant_scholarship = ?,
                  notes = ?, updated_at = datetime('now', '+7 hours')
              WHERE id = ?`,
        args: [
          String(b.full_name ?? existing.full_name).trim(),
          rank,
          degree,
          titleDisplay,
          b.recognition_year !== undefined ? (b.recognition_year ? Number(b.recognition_year) : null) : existing.recognition_year,
          String(b.specialization ?? existing.specialization).trim(),
          String(b.work_unit ?? existing.work_unit).trim(),
          b.is_internal !== undefined ? (b.is_internal ? 1 : 0) : existing.is_internal,
          b.email !== undefined ? (b.email ? String(b.email).trim().toLowerCase() : null) : existing.email,
          String(b.phone ?? existing.phone).trim(),
          String(b.bank_account ?? existing.bank_account).trim(),
          String(b.bank_name ?? existing.bank_name).trim(),
          String(b.cccd ?? existing.cccd).trim(),
          String(b.tax_code ?? existing.tax_code).trim(),
          b.is_supervisor !== undefined ? (b.is_supervisor ? 1 : 0) : existing.is_supervisor,
          b.is_seminar_member !== undefined ? (b.is_seminar_member ? 1 : 0) : existing.is_seminar_member,
          b.is_independent_reviewer !== undefined ? (b.is_independent_reviewer ? 1 : 0) : existing.is_independent_reviewer,
          b.is_defense_council_member !== undefined ? (b.is_defense_council_member ? 1 : 0) : existing.is_defense_council_member,
          Array.isArray(b.supervisor_eligible_roles_list)
            ? JSON.stringify(b.supervisor_eligible_roles_list)
            : existing.supervisor_eligible_roles,
          b.special_quota_approved !== undefined ? (b.special_quota_approved ? 1 : 0) : existing.special_quota_approved,
          b.special_quota_limit !== undefined ? (b.special_quota_limit ? Number(b.special_quota_limit) : null) : existing.special_quota_limit,
          String(b.special_quota_reason ?? existing.special_quota_reason).trim(),
          String(b.special_quota_decision ?? existing.special_quota_decision).trim(),
          b.has_major_grant_scholarship !== undefined ? (b.has_major_grant_scholarship ? 1 : 0) : existing.has_major_grant_scholarship,
          String(b.notes ?? existing.notes).trim(),
          sid,
        ],
      });
    } else {
      // Self update by scientist (work unit, specialization, contact, bank/tax/cccd)
      await db.execute({
        sql: `UPDATE scientists
              SET specialization = ?, work_unit = ?, phone = ?, bank_account = ?, bank_name = ?,
                  cccd = ?, tax_code = ?, updated_at = datetime('now', '+7 hours')
              WHERE id = ?`,
        args: [
          String(b.specialization ?? existing.specialization).trim(),
          String(b.work_unit ?? existing.work_unit).trim(),
          String(b.phone ?? existing.phone).trim(),
          String(b.bank_account ?? existing.bank_account).trim(),
          String(b.bank_name ?? existing.bank_name).trim(),
          String(b.cccd ?? existing.cccd).trim(),
          String(b.tax_code ?? existing.tax_code).trim(),
          sid,
        ],
      });
    }

    await recordAudit(user, 'update', 'scientist', sid, `Cập nhật hồ sơ Cán bộ ${existing.full_name}`);
    const items = await loadEnrichedScientists({ scientistId: sid }, user);
    res.json(items[0]);
  } catch (err: any) {
    if (/UNIQUE constraint failed/i.test(err?.message || '')) {
      return res.status(409).json({ error: 'Email cán bộ bị trùng với hồ sơ khác.' });
    }
    throw err;
  }
});

scientistsRouter.delete('/api/scientists/:id', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
  const sid = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT id, full_name FROM scientists WHERE id = ?', args: [sid] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy hồ sơ Cán bộ.' });
  await db.execute({ sql: 'DELETE FROM scientists WHERE id = ?', args: [sid] });
  await recordAudit(req.user, 'delete', 'scientist', sid, `Xóa hồ sơ Cán bộ ${existing.full_name}`);
  res.json({ ok: true });
});

// Scientist Publications (Danh mục công bố tính điểm chuẩn năng lực nghiên cứu theo Quy chế 3638)
scientistsRouter.post('/api/scientists/:id/publications', authenticateToken, async (req: AuthedRequest, res) => {
  const sid = Number(req.params.id);
  const user = req.user!;
  if (!isAdminOrStaff(user) && user.scientist_id !== sid) {
    return res.status(403).json({ error: 'Không có quyền thêm công bố cho cán bộ này.' });
  }
  const b = req.body || {};
  if (!b.title || !b.pub_year) {
    return res.status(400).json({ error: 'Vui lòng nhập Tên bài báo/công trình và Năm công bố.' });
  }
  const config = await getRegulationConfig();
  const hdgsnnMaxPoint =
    b.hdgsnn_max_point !== '' && b.hdgsnn_max_point !== null && b.hdgsnn_max_point !== undefined
      ? Number(b.hdgsnn_max_point)
      : null;
  const pt = calculatePublicationPoint(
    {
      pubType: b.pub_type || 'wos_q2',
      authorRole: b.author_role || 'main',
      hdgsnnMaxPoint,
      totalAuthors: Number(b.total_authors) || 1,
    },
    config
  );

  await db.execute({
    sql: `INSERT INTO scientist_publications (
            scientist_id, title, authors, venue, pub_year, pub_type, author_role,
            total_authors, issn_isbn, doi_url, hdgsnn_max_point, calculated_point, evidence_url, verified, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sid,
      String(b.title).trim(),
      String(b.authors || '').trim(),
      String(b.venue || '').trim(),
      Number(b.pub_year),
      String(b.pub_type || 'wos_q2'),
      String(b.author_role || 'main'),
      Number(b.total_authors) || 1,
      String(b.issn_isbn || '').trim(),
      String(b.doi_url || '').trim(),
      hdgsnnMaxPoint,
      pt,
      String(b.evidence_url || '').trim(),
      isAdminOrStaff(user) && b.verified ? 1 : 0,
      String(b.notes || '').trim(),
    ],
  });

  const items = await loadEnrichedScientists({ scientistId: sid }, user);
  res.status(201).json(items[0]);
});

scientistsRouter.delete('/api/scientists/:id/publications/:pubId', authenticateToken, async (req: AuthedRequest, res) => {
  const sid = Number(req.params.id);
  const pubId = Number(req.params.pubId);
  const user = req.user!;
  if (!isAdminOrStaff(user) && user.scientist_id !== sid) {
    return res.status(403).json({ error: 'Không có quyền xóa công bố này.' });
  }
  await db.execute({ sql: 'DELETE FROM scientist_publications WHERE id = ? AND scientist_id = ?', args: [pubId, sid] });
  const items = await loadEnrichedScientists({ scientistId: sid }, user);
  res.json(items[0]);
});
