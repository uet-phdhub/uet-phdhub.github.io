import { Router } from 'express';
import {
  calculatePublicationPoint,
  calculateSupervisorQuotaAndHours,
  computeDeadlinesCountdown,
  evaluatePhdPublications,
  evaluateScientistResearchCapacity,
} from '../../shared/regulation3638';
import type { AuthUser, StudyStatus } from '../../shared/types';
import { db } from '../db';
import { authenticateToken, isAdminOrStaff, requireRoles } from '../middlewares/auth';
import { recordAudit } from '../services/audit';
import { createNotification } from '../services/email';
import { getRegulationConfig, getRegulationConfigByVersionId } from '../services/settings';
import type { AuthedRequest } from '../types';

export const phdRouter = Router();

const CONFIDENTIAL_IR_FIELDS = [
  'ir1_scientist_id', 'ir1_info', 'ir1_sent_date',
  'ir2_scientist_id', 'ir2_info', 'ir2_sent_date',
  'ir_due_date', 'ir_declined_info',
  'ir3_scientist_id', 'ir3_info', 'ir3_sent_date',
  'ir_result', 'ir_notes',
];

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadEnrichedPhdList(
  filters: {
    search?: string;
    facultyId?: number;
    majorId?: number;
    cohort?: string;
    studyStatus?: string;
    pubStatus?: string;
    deadlineAlert?: string;
    includeCompleted?: boolean;
    phdStudentId?: number;
    supervisorScientistId?: number;
  },
  viewer: AuthUser
) {
  const config = await getRegulationConfig();
  const canSeeConfidential = isAdminOrStaff(viewer);

  const where: string[] = [];
  const args: any[] = [];

  if (filters.phdStudentId) {
    where.push('p.id = ?');
    args.push(filters.phdStudentId);
  }
  if (filters.supervisorScientistId) {
    where.push('EXISTS (SELECT 1 FROM phd_supervisions ps WHERE ps.phd_student_id = p.id AND ps.scientist_id = ?)');
    args.push(filters.supervisorScientistId);
  }
  if (filters.facultyId) {
    where.push('p.faculty_id = ?');
    args.push(filters.facultyId);
  }
  if (filters.majorId) {
    where.push('p.major_id = ?');
    args.push(filters.majorId);
  }
  if (filters.cohort) {
    where.push('p.cohort LIKE ?');
    args.push(`%${filters.cohort}%`);
  }
  if (filters.studyStatus && filters.studyStatus !== 'all') {
    where.push('p.study_status = ?');
    args.push(filters.studyStatus);
  }
  if (filters.includeCompleted === false) {
    where.push('p.is_completed = 0');
  }
  if (filters.search) {
    const q = `%${filters.search.trim()}%`;
    where.push('(p.phd_code LIKE ? OR p.full_name LIKE ? OR p.email LIKE ? OR p.dissertation_title LIKE ? OR p.admission_decision_no LIKE ? OR p.work_unit LIKE ?)');
    args.push(q, q, q, q, q, q);
  }

  const sql = `
    SELECT p.*, f.name as faculty_name, f.short_name as faculty_short_name, f.code as faculty_code,
           m.name as major_name, m.code as major_code
    FROM phd_students p
    LEFT JOIN faculties f ON f.id = p.faculty_id
    LEFT JOIN majors m ON m.id = p.major_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.is_completed ASC, p.id DESC
  `;

  const phds = (await db.execute({ sql, args })).rows as any[];
  if (phds.length === 0) return [];

  const ids = phds.map((p) => Number(p.id));
  const placeholders = ids.map(() => '?').join(',');

  const [supsRes, pubsRes, reportsRes] = await Promise.all([
    db.execute({
      sql: `SELECT ps.*, s.full_name, s.title_display, s.academic_rank, s.academic_degree, s.work_unit, s.email
            FROM phd_supervisions ps
            JOIN scientists s ON s.id = ps.scientist_id
            WHERE ps.phd_student_id IN (${placeholders})
            ORDER BY CASE ps.role WHEN 'independent' THEN 1 WHEN 'primary' THEN 2 WHEN 'co' THEN 3 ELSE 4 END, ps.id ASC`,
      args: ids,
    }),
    db.execute({
      sql: `SELECT * FROM phd_publications WHERE phd_student_id IN (${placeholders}) ORDER BY pub_year DESC, id DESC`,
      args: ids,
    }),
    db.execute({
      sql: `SELECT id, phd_student_id, academic_term, report_date, thesis_progress_percent, supervisor_status
            FROM phd_progress_reports WHERE phd_student_id IN (${placeholders}) ORDER BY report_date DESC, id DESC`,
      args: ids,
    }),
  ]);

  const supsMap = new Map<number, any[]>();
  for (const s of supsRes.rows as any[]) {
    const pid = Number(s.phd_student_id);
    if (!supsMap.has(pid)) supsMap.set(pid, []);
    supsMap.get(pid)!.push(s);
  }

  const pubsMap = new Map<number, any[]>();
  for (const pub of pubsRes.rows as any[]) {
    const pid = Number(pub.phd_student_id);
    if (!pubsMap.has(pid)) pubsMap.set(pid, []);
    pubsMap.get(pid)!.push(pub);
  }

  const reportsMap = new Map<number, any[]>();
  for (const r of reportsRes.rows as any[]) {
    const pid = Number(r.phd_student_id);
    if (!reportsMap.has(pid)) reportsMap.set(pid, []);
    reportsMap.get(pid)!.push(r);
  }

  let items = phds.map((raw) => {
    const p: any = { ...raw };
    if (!canSeeConfidential) {
      for (const f of CONFIDENTIAL_IR_FIELDS) {
        delete p[f];
      }
    }
    const pid = Number(p.id);
    const pubs = (pubsMap.get(pid) || []).map((pub) => ({
      ...pub,
      pubYear: Number(pub.pub_year),
      itemKind: pub.item_kind,
      pubType: pub.pub_type,
      authorRole: pub.author_role,
      hdgsnnMaxPoint: pub.hdgsnn_max_point,
    }));

    const publicationEvaluation = evaluatePhdPublications(pubs, config);
    const deadlines = computeDeadlinesCountdown(raw, config, canSeeConfidential);
    const reports = reportsMap.get(pid) || [];

    return {
      ...p,
      completed_courses: safeJsonParse(p.completed_courses_json, []),
      training_changes: safeJsonParse(p.training_changes_json, []),
      doctoral_seminars: safeJsonParse(p.doctoral_seminars_json, []),
      supervisions: supsMap.get(pid) || [],
      publicationEvaluation,
      deadlines,
      latestReport: reports[0] || null,
      progressReportCount: reports.length,
    };
  });

  if (filters.pubStatus && filters.pubStatus !== 'all') {
    items = items.filter((item) => item.publicationEvaluation.status === filters.pubStatus);
  }
  if (filters.deadlineAlert && filters.deadlineAlert !== 'all') {
    items = items.filter((item) => {
      const levels = [item.deadlines.standard.level, item.deadlines.max.level, item.deadlines.outputFlReview.level];
      if (canSeeConfidential && item.deadlines.irDue) levels.push(item.deadlines.irDue.level);
      if (filters.deadlineAlert === 'overdue') return levels.includes('overdue');
      if (filters.deadlineAlert === 'urgent') return levels.includes('overdue') || levels.includes('urgent');
      if (filters.deadlineAlert === 'warning') return levels.includes('overdue') || levels.includes('urgent') || levels.includes('warning');
      return true;
    });
  }

  return items;
}

async function canAccessPhd(user: AuthUser, phdId: number): Promise<boolean> {
  if (isAdminOrStaff(user)) return true;
  if (user.role === 'phd_student' && user.phd_student_id === phdId) return true;
  if (user.scientist_id) {
    const sup = (
      await db.execute({
        sql: 'SELECT id FROM phd_supervisions WHERE phd_student_id = ? AND scientist_id = ? LIMIT 1',
        args: [phdId, user.scientist_id],
      })
    ).rows[0];
    if (sup) return true;
  }
  return false;
}

export async function loadEnrichedPhdDetail(phdId: number, viewer: AuthUser) {
  const canSeeConfidential = isAdminOrStaff(viewer);

  const row = (
    await db.execute({
      sql: `SELECT p.*, f.name as faculty_name, f.short_name as faculty_short_name, f.code as faculty_code,
                   m.name as major_name, m.code as major_code,
                   COALESCE(p.regulation_version_id, c.regulation_version_id) as effective_reg_version_id
            FROM phd_students p
            LEFT JOIN faculties f ON f.id = p.faculty_id
            LEFT JOIN majors m ON m.id = p.major_id
            LEFT JOIN cohorts c ON c.id = p.cohort_id OR (p.cohort_id IS NULL AND c.code = p.cohort)
            WHERE p.id = ?`,
      args: [phdId],
    })
  ).rows[0] as any;

  if (!row) return null;
  const config = await getRegulationConfigByVersionId(row.effective_reg_version_id ? Number(row.effective_reg_version_id) : null);

  const [supsRes, committeesRes, pubsRes, reportsRes, docsRes] = await Promise.all([
    db.execute({
      sql: `SELECT ps.*, s.full_name, s.title_display, s.academic_rank, s.academic_degree, s.work_unit, s.email, s.phone, s.specialization
            FROM phd_supervisions ps
            JOIN scientists s ON s.id = ps.scientist_id
            WHERE ps.phd_student_id = ?
            ORDER BY CASE ps.role WHEN 'independent' THEN 1 WHEN 'primary' THEN 2 WHEN 'co' THEN 3 ELSE 4 END, ps.id ASC`,
      args: [phdId],
    }),
    db.execute({
      sql: `SELECT cm.*, s.full_name, s.title_display, s.academic_rank, s.academic_degree, s.work_unit, s.email, s.specialization
            FROM phd_committee_members cm
            JOIN scientists s ON s.id = cm.scientist_id
            WHERE cm.phd_student_id = ?
            ORDER BY cm.committee_type ASC, cm.id ASC`,
      args: [phdId],
    }),
    db.execute({
      sql: 'SELECT * FROM phd_publications WHERE phd_student_id = ? ORDER BY pub_year DESC, id DESC',
      args: [phdId],
    }),
    db.execute({
      sql: `SELECT pr.*, s.full_name as reviewer_name, s.title_display as reviewer_title
            FROM phd_progress_reports pr
            LEFT JOIN scientists s ON s.id = pr.reviewed_by_scientist_id
            WHERE pr.phd_student_id = ?
            ORDER BY pr.report_date DESC, pr.id DESC`,
      args: [phdId],
    }),
    db.execute({
      sql: `SELECT id, entity_type, entity_id, category, title, filename, mime_type, size_bytes,
                   storage_provider, drive_url, is_confidential, uploaded_by_user_id, created_at
            FROM documents
            WHERE entity_type = 'phd_student' AND entity_id = ?
              ${canSeeConfidential ? '' : 'AND is_confidential = 0'}
            ORDER BY created_at DESC, id DESC`,
      args: [phdId],
    }),
  ]);

  const cleanRow: any = { ...row };
  if (!canSeeConfidential) {
    for (const f of CONFIDENTIAL_IR_FIELDS) {
      delete cleanRow[f];
    }
  }

  const publications = (pubsRes.rows as any[]).map((pub) => ({
    ...pub,
    pubYear: Number(pub.pub_year),
    itemKind: pub.item_kind,
    pubType: pub.pub_type,
    authorRole: pub.author_role,
    hdgsnnMaxPoint: pub.hdgsnn_max_point,
    calculated_point: calculatePublicationPoint(
      {
        pubType: pub.pub_type,
        authorRole: pub.author_role,
        hdgsnnMaxPoint: pub.hdgsnn_max_point,
        totalAuthors: pub.total_authors,
      },
      config
    ),
  }));

  return {
    ...cleanRow,
    completed_courses: safeJsonParse(cleanRow.completed_courses_json, []),
    training_changes: safeJsonParse(cleanRow.training_changes_json, []),
    doctoral_seminars: safeJsonParse(cleanRow.doctoral_seminars_json, []),
    supervisions: supsRes.rows,
    seminar_members: (committeesRes.rows as any[]).filter((c) => c.committee_type === 'seminar'),
    defense_members: (committeesRes.rows as any[]).filter((c) => c.committee_type === 'defense'),
    publications,
    publicationEvaluation: evaluatePhdPublications(publications, config),
    progress_reports: reportsRes.rows,
    documents: docsRes.rows,
    deadlines: computeDeadlinesCountdown(row, config, canSeeConfidential),
  };
}

phdRouter.get('/api/phd-students', authenticateToken, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const q = req.query;

  const filters: any = {
    search: typeof q.search === 'string' ? q.search : undefined,
    facultyId: q.facultyId ? Number(q.facultyId) : undefined,
    majorId: q.majorId ? Number(q.majorId) : undefined,
    cohort: typeof q.cohort === 'string' ? q.cohort : undefined,
    studyStatus: typeof q.studyStatus === 'string' ? q.studyStatus : undefined,
    pubStatus: typeof q.pubStatus === 'string' ? q.pubStatus : undefined,
    deadlineAlert: typeof q.deadlineAlert === 'string' ? q.deadlineAlert : undefined,
    includeCompleted: q.includeCompleted === 'false' ? false : true,
  };

  if (user.role === 'phd_student') {
    if (!user.phd_student_id) return res.json({ items: [], total: 0 });
    filters.phdStudentId = user.phd_student_id;
  } else if (user.role === 'supervisor' || q.view === 'supervisor') {
    if (!user.scientist_id) return res.json({ items: [], total: 0 });
    filters.supervisorScientistId = user.scientist_id;
  }

  const items = await loadEnrichedPhdList(filters, user);
  res.json({ items, total: items.length });
});

phdRouter.get('/api/phd-students/:id', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  if (!Number.isInteger(phdId) || phdId <= 0) return res.status(400).json({ error: 'ID NCS không hợp lệ.' });
  if (!(await canAccessPhd(req.user!, phdId))) {
    return res.status(403).json({ error: 'Bạn không có quyền xem hồ sơ NCS này.' });
  }
  const detail = await loadEnrichedPhdDetail(phdId, req.user!);
  if (!detail) return res.status(404).json({ error: 'Không tìm thấy hồ sơ NCS.' });
  res.json(detail);
});

const PHD_MUTABLE_FIELDS = [
  'phd_code', 'full_name', 'dob', 'gender', 'email', 'phone', 'faculty_id', 'major_id', 'cohort', 'cohort_id', 'regulation_version_id',
  'work_unit', 'admission_category', 'entrance_foreign_language', 'graduated_major_applied',
  'supplementary_courses', 'degree_verification_status', 'degree_verification_note',
  'enrollment_date', 'admission_decision_no', 'admission_decision_date',
  'training_start_date', 'standard_deadline', 'max_deadline',
  'output_foreign_language', 'output_fl_review_deadline',
  'accumulated_credits', 'study_status',
  'dissertation_title', 'topic_supervisor_decision_no', 'topic_supervisor_decision_date',
  'progress_report_summary', 'teaching_and_academic_activities', 'thesis_progress_by_term',
  'seminar_decision_no', 'seminar_date', 'seminar_result',
  'title_change_decision_no', 'adjusted_dissertation_title',
  'ir1_scientist_id', 'ir1_info', 'ir1_sent_date',
  'ir2_scientist_id', 'ir2_info', 'ir2_sent_date',
  'ir_due_date', 'ir_declined_info',
  'ir3_scientist_id', 'ir3_info', 'ir3_sent_date',
  'ir_result', 'ir_notes',
  'defense_council_decision_no', 'defense_council_decision_date', 'defense_date',
  'post_defense_resubmit_date', 'dossier_completion_evidences', 'final_dossier_submit_date',
  'appraisal_status', 'appraisal_result',
  'diploma_serial_no', 'diploma_registry_no', 'degree_award_decision_no',
  'diploma_signed_date', 'graduation_year', 'diploma_received_date',
  'other_notes', 'is_completed',
];

function normalizePhdPayload(body: Record<string, any>) {
  const data: Record<string, any> = {};
  for (const field of PHD_MUTABLE_FIELDS) {
    if (body[field] !== undefined) {
      if (['faculty_id', 'major_id', 'cohort_id', 'regulation_version_id', 'ir1_scientist_id', 'ir2_scientist_id', 'ir3_scientist_id', 'graduation_year'].includes(field)) {
        data[field] = body[field] === '' || body[field] === null ? null : Number(body[field]);
      } else if (field === 'accumulated_credits') {
        data[field] = Number(body[field]) || 0;
      } else if (field === 'is_completed') {
        data[field] = body[field] ? 1 : 0;
      } else if (field === 'email') {
        data[field] = body[field] ? String(body[field]).trim().toLowerCase() : null;
      } else {
        data[field] = body[field] === null ? '' : String(body[field]).trim();
      }
    }
  }
  if (Array.isArray(body.completed_courses)) {
    data.completed_courses_json = JSON.stringify(body.completed_courses);
  }
  if (Array.isArray(body.training_changes)) {
    data.training_changes_json = JSON.stringify(body.training_changes);
  }
  if (Array.isArray(body.doctoral_seminars)) {
    data.doctoral_seminars_json = JSON.stringify(body.doctoral_seminars);
  }
  return data;
}

phdRouter.post('/api/phd-students', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const body = req.body || {};
  if (!body.phd_code || !body.full_name) {
    return res.status(400).json({ error: 'Vui lòng nhập bắt buộc Mã NCS và Họ và tên.' });
  }
  const data = normalizePhdPayload(body);
  // Auto-fill standard_deadline & max_deadline from matching cohort if omitted
  if ((data.cohort_id || data.cohort) && (!data.standard_deadline || !data.max_deadline)) {
    const cohortRow = (
      await db.execute({
        sql: data.cohort_id ? 'SELECT * FROM cohorts WHERE id = ? LIMIT 1' : 'SELECT * FROM cohorts WHERE code = ? LIMIT 1',
        args: [data.cohort_id || data.cohort],
      })
    ).rows[0] as any;
    if (cohortRow) {
      if (!data.cohort_id) data.cohort_id = Number(cohortRow.id);
      if (!data.regulation_version_id && cohortRow.regulation_version_id) {
        data.regulation_version_id = Number(cohortRow.regulation_version_id);
      }
      const startIso = String(data.training_start_date || cohortRow.start_date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(startIso)) {
        const isBachelor = /đại học|cử nhân|kỹ sư/i.test(String(data.admission_category || ''));
        const stdMonths = isBachelor ? Number(cohortRow.standard_months_bachelor || 48) : Number(cohortRow.standard_months_master || 36);
        const maxMonths = isBachelor ? Number(cohortRow.max_months_bachelor || 84) : Number(cohortRow.max_months_master || 72);
        const addMonths = (iso: string, months: number) => {
          const d = new Date(`${iso}T00:00:00Z`);
          d.setUTCMonth(d.getUTCMonth() + months);
          return d.toISOString().slice(0, 10);
        };
        if (!data.standard_deadline) data.standard_deadline = addMonths(startIso, stdMonths);
        if (!data.max_deadline) data.max_deadline = addMonths(startIso, maxMonths);
      }
    }
  }
  try {
    const cols = Object.keys(data);
    const vals = Object.values(data);
    const ins = await db.execute({
      sql: `INSERT INTO phd_students (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      args: vals,
    });
    const newId = Number(ins.lastInsertRowid);
    await recordAudit(req.user, 'create', 'phd_student', newId, `Tạo mới hồ sơ NCS ${data.full_name} (${data.phd_code})`, null, data);
    const detail = await loadEnrichedPhdDetail(newId, req.user!);
    res.status(201).json(detail);
  } catch (err: any) {
    if (/UNIQUE constraint failed/i.test(err?.message || '')) {
      return res.status(409).json({ error: 'Mã NCS hoặc Email đã tồn tại trong hệ thống.' });
    }
    throw err;
  }
});

phdRouter.put('/api/phd-students/:id', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM phd_students WHERE id = ?', args: [phdId] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy hồ sơ NCS.' });

  const body = req.body || {};
  if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== Number(existing.revision)) {
    return res.status(409).json({ error: 'Hồ sơ NCS vừa được chuyên viên khác cập nhật. Vui lòng tải lại trước khi lưu.' });
  }

  const data = normalizePhdPayload(body);
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return res.json(await loadEnrichedPhdDetail(phdId, req.user!));
  }

  try {
    const sets = entries.map(([k]) => `${k} = ?`);
    sets.push("updated_at = datetime('now', '+7 hours')");
    sets.push('revision = revision + 1');
    const args = [...entries.map(([, v]) => v), phdId];

    await db.execute({ sql: `UPDATE phd_students SET ${sets.join(', ')} WHERE id = ?`, args });

    // Auto-flag scientists assigned as independent reviewers
    const irIds = [data.ir1_scientist_id, data.ir2_scientist_id, data.ir3_scientist_id].filter((x) => Number.isInteger(x) && x > 0);
    for (const sid of irIds) {
      await db.execute({ sql: 'UPDATE scientists SET is_independent_reviewer = 1 WHERE id = ?', args: [sid] });
    }

    await recordAudit(req.user, 'update', 'phd_student', phdId, `Cập nhật hồ sơ NCS ${existing.full_name} (${existing.phd_code})`, { revision: existing.revision }, data);
    res.json(await loadEnrichedPhdDetail(phdId, req.user!));
  } catch (err: any) {
    if (/UNIQUE constraint failed/i.test(err?.message || '')) {
      return res.status(409).json({ error: 'Mã NCS hoặc Email bị trùng với hồ sơ khác.' });
    }
    throw err;
  }
});

phdRouter.delete('/api/phd-students/:id', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT id, phd_code, full_name FROM phd_students WHERE id = ?', args: [phdId] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy hồ sơ NCS.' });
  await db.execute({ sql: 'DELETE FROM phd_students WHERE id = ?', args: [phdId] });
  await recordAudit(req.user, 'delete', 'phd_student', phdId, `Xóa hồ sơ NCS ${existing.full_name} (${existing.phd_code})`, existing, null);
  res.json({ ok: true });
});

// Supervisions (CBHD Độc lập / Chính / Phụ / Đồng HD)
phdRouter.put('/api/phd-students/:id/supervisions', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const phd = (await db.execute({ sql: 'SELECT id, phd_code, full_name, study_status, is_completed FROM phd_students WHERE id = ?', args: [phdId] })).rows[0] as any;
  if (!phd) return res.status(404).json({ error: 'Không tìm thấy hồ sơ NCS.' });

  const assignments = Array.isArray(req.body?.supervisions) ? req.body.supervisions : [];
  const validRoles = new Set(['independent', 'primary', 'secondary', 'co']);
  const seenSci = new Set<number>();

  for (const a of assignments) {
    const sid = Number(a.scientist_id);
    if (!Number.isInteger(sid) || sid <= 0) return res.status(400).json({ error: 'Cán bộ hướng dẫn không hợp lệ.' });
    if (!validRoles.has(a.role)) return res.status(400).json({ error: `Vai trò hướng dẫn không hợp lệ: ${a.role}` });
    if (seenSci.has(sid)) return res.status(400).json({ error: 'Một cán bộ không thể giữ 2 vai trò hướng dẫn cùng lúc cho 1 NCS.' });
    seenSci.add(sid);
  }

  await db.execute({ sql: 'DELETE FROM phd_supervisions WHERE phd_student_id = ?', args: [phdId] });
  for (const a of assignments) {
    await db.execute({
      sql: `INSERT INTO phd_supervisions (phd_student_id, scientist_id, role, decision_no, assigned_date, is_active, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [phdId, Number(a.scientist_id), a.role, String(a.decision_no || ''), String(a.assigned_date || ''), a.is_active === false ? 0 : 1, String(a.notes || '')],
    });
    await db.execute({ sql: 'UPDATE scientists SET is_supervisor = 1 WHERE id = ?', args: [Number(a.scientist_id)] });
  }

  // Evaluate quota warnings for assigned scientists
  const config = await getRegulationConfig();
  const warnings: string[] = [];
  for (const sid of seenSci) {
    const sci = (await db.execute({ sql: 'SELECT * FROM scientists WHERE id = ?', args: [sid] })).rows[0] as any;
    const allSups = (
      await db.execute({
        sql: `SELECT ps.*, p.study_status, p.is_completed FROM phd_supervisions ps JOIN phd_students p ON p.id = ps.phd_student_id WHERE ps.scientist_id = ?`,
        args: [sid],
      })
    ).rows as any[];
    const sciPubs = (await db.execute({ sql: 'SELECT * FROM scientist_publications WHERE scientist_id = ?', args: [sid] })).rows as any[];
    const resEval = evaluateScientistResearchCapacity(
      sciPubs.map((sp) => ({ ...sp, pubYear: Number(sp.pub_year), pubType: sp.pub_type, authorRole: sp.author_role, hdgsnnMaxPoint: sp.hdgsnn_max_point })),
      config
    );
    const qEval = calculateSupervisorQuotaAndHours(sci, allSups, resEval, config);
    if (qEval.status === 'over_limit') {
      warnings.push(`${sci.title_display || ''} ${sci.full_name} đang vượt định mức hướng dẫn (${qEval.equivalentLoad}/${qEval.effectiveQuota}).`.trim());
    }
  }

  await recordAudit(req.user, 'update_supervisions', 'phd_student', phdId, `Cập nhật phân công CBHD cho NCS ${phd.full_name} (${phd.phd_code})`, null, assignments);
  const detail = await loadEnrichedPhdDetail(phdId, req.user!);
  res.json({ ...detail, quotaWarnings: warnings });
});

// Committees (HĐ Seminar tổng thể & HĐ Đánh giá LATS)
phdRouter.put('/api/phd-students/:id/committees', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const committeeType = req.body?.committee_type;
  if (!['seminar', 'defense'].includes(committeeType)) {
    return res.status(400).json({ error: 'Loại hội đồng phải là seminar hoặc defense.' });
  }
  const members = Array.isArray(req.body?.members) ? req.body.members : [];
  await db.execute({
    sql: 'DELETE FROM phd_committee_members WHERE phd_student_id = ? AND committee_type = ?',
    args: [phdId, committeeType],
  });

  for (const m of members) {
    const sid = Number(m.scientist_id);
    if (!Number.isInteger(sid) || sid <= 0) continue;
    await db.execute({
      sql: `INSERT INTO phd_committee_members (phd_student_id, scientist_id, committee_type, member_role, decision_no, event_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [phdId, sid, committeeType, String(m.member_role || 'member'), String(m.decision_no || ''), String(m.event_date || ''), String(m.notes || '')],
    });
    const col = committeeType === 'seminar' ? 'is_seminar_member' : 'is_defense_council_member';
    await db.execute({ sql: `UPDATE scientists SET ${col} = 1 WHERE id = ?`, args: [sid] });
  }

  await recordAudit(req.user, 'update_committee', 'phd_student', phdId, `Cập nhật thành viên Hội đồng (${committeeType}) cho NCS #${phdId}`, null, members);
  res.json(await loadEnrichedPhdDetail(phdId, req.user!));
});

// PhD Publications (Bài báo / Đề tài NCKH của NCS)
phdRouter.post('/api/phd-students/:id/publications', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const user = req.user!;
  const isOwnerPhd = user.role === 'phd_student' && user.phd_student_id === phdId;
  if (!isAdminOrStaff(user) && !isOwnerPhd) {
    return res.status(403).json({ error: 'Bạn không có quyền thêm công bố cho NCS này.' });
  }

  const b = req.body || {};
  if (!b.title || !b.pub_year) {
    return res.status(400).json({ error: 'Vui lòng nhập tên công trình và năm công bố.' });
  }

  const config = await getRegulationConfig();
  const hdgsnnMaxPoint = b.hdgsnn_max_point !== '' && b.hdgsnn_max_point !== null && b.hdgsnn_max_point !== undefined ? Number(b.hdgsnn_max_point) : null;
  const pt = calculatePublicationPoint(
    {
      pubType: b.pub_type || 'wos_q2',
      authorRole: b.author_role || 'first',
      hdgsnnMaxPoint,
      totalAuthors: Number(b.total_authors) || 1,
    },
    config
  );

  const verified = isAdminOrStaff(user) && b.verified ? 1 : 0;
  await db.execute({
    sql: `INSERT INTO phd_publications (
            phd_student_id, title, authors, venue, pub_year, item_kind, pub_type, author_role,
            total_authors, issn_isbn, doi_url, hdgsnn_max_point, calculated_point, evidence_url, verified, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      phdId,
      String(b.title).trim(),
      String(b.authors || '').trim(),
      String(b.venue || '').trim(),
      Number(b.pub_year),
      String(b.item_kind || 'article'),
      String(b.pub_type || 'wos_q2'),
      String(b.author_role || 'first'),
      Number(b.total_authors) || 1,
      String(b.issn_isbn || '').trim(),
      String(b.doi_url || '').trim(),
      hdgsnnMaxPoint,
      pt,
      String(b.evidence_url || '').trim(),
      verified,
      String(b.notes || '').trim(),
    ],
  });

  res.status(201).json(await loadEnrichedPhdDetail(phdId, user));
});

phdRouter.put('/api/phd-students/:id/publications/:pubId', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const pubId = Number(req.params.pubId);
  const user = req.user!;
  const isOwnerPhd = user.role === 'phd_student' && user.phd_student_id === phdId;
  if (!isAdminOrStaff(user) && !isOwnerPhd) {
    return res.status(403).json({ error: 'Không có quyền sửa công bố này.' });
  }

  const existing = (await db.execute({ sql: 'SELECT * FROM phd_publications WHERE id = ? AND phd_student_id = ?', args: [pubId, phdId] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy công bố.' });
  if (isOwnerPhd && existing.verified) {
    return res.status(403).json({ error: 'Công bố đã được Phòng CTSV xác minh; vui lòng liên hệ chuyên viên nếu cần chỉnh sửa.' });
  }

  const b = req.body || {};
  const config = await getRegulationConfig();
  const pubType = b.pub_type ?? existing.pub_type;
  const authorRole = b.author_role ?? existing.author_role;
  const hdgsnnMaxPoint =
    b.hdgsnn_max_point !== undefined
      ? b.hdgsnn_max_point === '' || b.hdgsnn_max_point === null
        ? null
        : Number(b.hdgsnn_max_point)
      : existing.hdgsnn_max_point;

  const pt = calculatePublicationPoint({ pubType, authorRole, hdgsnnMaxPoint, totalAuthors: Number(b.total_authors ?? existing.total_authors) || 1 }, config);
  const verified = isAdminOrStaff(user) ? (b.verified !== undefined ? (b.verified ? 1 : 0) : existing.verified) : existing.verified;

  await db.execute({
    sql: `UPDATE phd_publications
          SET title = ?, authors = ?, venue = ?, pub_year = ?, item_kind = ?, pub_type = ?, author_role = ?,
              total_authors = ?, issn_isbn = ?, doi_url = ?, hdgsnn_max_point = ?, calculated_point = ?,
              evidence_url = ?, verified = ?, notes = ?, updated_at = datetime('now', '+7 hours')
          WHERE id = ? AND phd_student_id = ?`,
    args: [
      String(b.title ?? existing.title).trim(),
      String(b.authors ?? existing.authors).trim(),
      String(b.venue ?? existing.venue).trim(),
      Number(b.pub_year ?? existing.pub_year),
      String(b.item_kind ?? existing.item_kind),
      pubType,
      authorRole,
      Number(b.total_authors ?? existing.total_authors) || 1,
      String(b.issn_isbn ?? existing.issn_isbn).trim(),
      String(b.doi_url ?? existing.doi_url).trim(),
      hdgsnnMaxPoint,
      pt,
      String(b.evidence_url ?? existing.evidence_url).trim(),
      verified,
      String(b.notes ?? existing.notes).trim(),
      pubId,
      phdId,
    ],
  });

  res.json(await loadEnrichedPhdDetail(phdId, user));
});

phdRouter.delete('/api/phd-students/:id/publications/:pubId', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const pubId = Number(req.params.pubId);
  const user = req.user!;
  const isOwnerPhd = user.role === 'phd_student' && user.phd_student_id === phdId;
  if (!isAdminOrStaff(user) && !isOwnerPhd) {
    return res.status(403).json({ error: 'Không có quyền xóa công bố này.' });
  }
  const existing = (await db.execute({ sql: 'SELECT verified FROM phd_publications WHERE id = ? AND phd_student_id = ?', args: [pubId, phdId] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy công bố.' });
  if (isOwnerPhd && existing.verified) {
    return res.status(403).json({ error: 'Không thể xóa công bố đã được xác minh.' });
  }
  await db.execute({ sql: 'DELETE FROM phd_publications WHERE id = ? AND phd_student_id = ?', args: [pubId, phdId] });
  res.json(await loadEnrichedPhdDetail(phdId, user));
});

// Progress Reports (Báo cáo tiến độ & Tiến độ luận án theo kỳ)
phdRouter.post('/api/phd-students/:id/progress-reports', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const user = req.user!;
  const isOwnerPhd = user.role === 'phd_student' && user.phd_student_id === phdId;
  if (!isAdminOrStaff(user) && !isOwnerPhd) {
    return res.status(403).json({ error: 'Không có quyền nộp báo cáo tiến độ cho NCS này.' });
  }

  const b = req.body || {};
  if (!b.academic_term || !b.summary) {
    return res.status(400).json({ error: 'Vui lòng nhập Kỳ báo cáo và Nội dung tiến độ.' });
  }
  const reportDate = String(b.report_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const pct = Math.max(0, Math.min(100, Number(b.thesis_progress_percent) || 0));

  await db.execute({
    sql: `INSERT INTO phd_progress_reports (
            phd_student_id, cycle_id, academic_term, report_date, thesis_progress_percent, summary,
            teaching_activities, next_plan, evidence_url, submitted_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      phdId,
      b.cycle_id ? Number(b.cycle_id) : null,
      String(b.academic_term).trim(),
      reportDate,
      pct,
      String(b.summary).trim(),
      String(b.teaching_activities || '').trim(),
      String(b.next_plan || '').trim(),
      String(b.evidence_url || '').trim(),
      user.id,
    ],
  });

  // Sync latest summary onto phd_students
  await db.execute({
    sql: `UPDATE phd_students
          SET thesis_progress_by_term = ?,
              progress_report_summary = ?,
              updated_at = datetime('now', '+7 hours')
          WHERE id = ?`,
    args: [`${String(b.academic_term).trim()}: ${pct}%`, String(b.summary).trim().slice(0, 500), phdId],
  });

  // Notify assigned supervisors
  const phd = (await db.execute({ sql: 'SELECT phd_code, full_name FROM phd_students WHERE id = ?', args: [phdId] })).rows[0] as any;
  const sups = (
    await db.execute({
      sql: 'SELECT s.email FROM phd_supervisions ps JOIN scientists s ON s.id = ps.scientist_id WHERE ps.phd_student_id = ? AND ps.is_active = 1 AND s.email IS NOT NULL',
      args: [phdId],
    })
  ).rows as any[];
  for (const s of sups) {
    await createNotification({
      recipient_email: s.email,
      phd_student_id: phdId,
      type: 'progress_report_submitted',
      subject: `[UET PhDHub] NCS ${phd?.full_name} đã nộp báo cáo tiến độ (${b.academic_term})`,
      body: `NCS ${phd?.full_name} (${phd?.phd_code}) vừa nộp báo cáo tiến độ kỳ ${b.academic_term} (tiến độ luận án ${pct}%). Thầy/Cô vui lòng xem và nhận xét trên hệ thống.`,
      delivery_mode: 'website_and_email',
      created_by_user_id: user.id,
    });
  }

  res.status(201).json(await loadEnrichedPhdDetail(phdId, user));
});

phdRouter.put('/api/phd-students/:id/progress-reports/:reportId/review', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const reportId = Number(req.params.reportId);
  const user = req.user!;

  let isAssignedSupervisor = false;
  if (user.scientist_id) {
    const sup = (
      await db.execute({
        sql: 'SELECT id FROM phd_supervisions WHERE phd_student_id = ? AND scientist_id = ? AND is_active = 1 LIMIT 1',
        args: [phdId, user.scientist_id],
      })
    ).rows[0];
    isAssignedSupervisor = Boolean(sup);
  }
  if (!isAdminOrStaff(user) && !isAssignedSupervisor) {
    return res.status(403).json({ error: 'Chỉ CBHD được phân công hoặc Phòng CTSV mới có quyền nhận xét báo cáo.' });
  }

  const status = ['approved', 'needs_revision', 'pending'].includes(req.body?.supervisor_status)
    ? req.body.supervisor_status
    : 'approved';

  await db.execute({
    sql: `UPDATE phd_progress_reports
          SET supervisor_status = ?, supervisor_comment = ?, staff_note = COALESCE(?, staff_note),
              reviewed_by_scientist_id = ?, reviewed_at = datetime('now', '+7 hours'),
              updated_at = datetime('now', '+7 hours')
          WHERE id = ? AND phd_student_id = ?`,
    args: [
      status,
      String(req.body?.supervisor_comment || '').trim(),
      isAdminOrStaff(user) && req.body?.staff_note !== undefined ? String(req.body.staff_note).trim() : null,
      user.scientist_id || null,
      reportId,
      phdId,
    ],
  });

  // Notify NCS
  const phd = (await db.execute({ sql: 'SELECT email, full_name FROM phd_students WHERE id = ?', args: [phdId] })).rows[0] as any;
  if (phd?.email) {
    await createNotification({
      recipient_email: phd.email,
      phd_student_id: phdId,
      type: 'progress_report_reviewed',
      subject: `[UET PhDHub] Kết quả duyệt báo cáo tiến độ: ${status === 'approved' ? 'Đã duyệt' : 'Cần bổ sung'}`,
      body: `Báo cáo tiến độ của bạn đã được cập nhật trạng thái "${status === 'approved' ? 'Đã duyệt' : 'Cần bổ sung'}". Nhận xét: ${req.body?.supervisor_comment || '(Không có nhận xét thêm)'}`,
      delivery_mode: 'website_and_email',
      created_by_user_id: user.id,
    });
  }

  res.json(await loadEnrichedPhdDetail(phdId, user));
});
