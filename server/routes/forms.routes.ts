import { Router } from 'express';
import { evaluateAcademicCoi } from '../../shared/coi';
import { evaluateScientistResearchCapacity } from '../../shared/regulation3638';
import { db } from '../db';
import { authenticateToken, isAdminOrStaff, requirePermission } from '../middlewares/auth';
import { recordSecretAccess } from '../services/audit';
import { lookupDoiMetadata } from '../services/doi';
import { generatePhdDocxForm, generateScientistCvDocx } from '../services/docxForms';
import { getRegulationConfig } from '../services/settings';
import type { AuthedRequest } from '../types';
import { loadEnrichedPhdList } from './phd.routes';
import { loadEnrichedScientists } from './scientists.routes';

export const formsRouter = Router();

/* ==================== WORD (.DOCX) OFFICIAL FORMS ==================== */

formsRouter.get('/api/forms/phd/:id/:templateCode', authenticateToken, async (req: AuthedRequest, res) => {
  const phdId = Number(req.params.id);
  const templateCode = String(req.params.templateCode || '');
  const allowed = ['compliance_3638', 'committee_seminar', 'committee_defense', 'ir_invitation'] as const;
  if (!allowed.includes(templateCode as any)) {
    return res.status(400).json({ error: 'Mẫu biểu không hợp lệ.' });
  }

  const user = req.user!;
  if (templateCode === 'ir_invitation' && !isAdminOrStaff(user)) {
    return res.status(403).json({ error: 'Chỉ Phòng CTSV được tạo Giấy mời Phản biện độc lập.' });
  }
  if (!isAdminOrStaff(user)) {
    if (templateCode !== 'compliance_3638') {
      return res.status(403).json({ error: 'Chỉ Phòng CTSV được xuất biểu mẫu Tờ trình hội đồng.' });
    }
    if (user.role === 'phd_student' && Number(user.phd_student_id) !== phdId) {
      return res.status(403).json({ error: 'Không có quyền truy cập hồ sơ NCS khác.' });
    }
    if (user.role === 'supervisor') {
      const sup = (
        await db.execute({
          sql: 'SELECT 1 FROM phd_supervisions WHERE phd_student_id = ? AND scientist_id = ? LIMIT 1',
          args: [phdId, user.scientist_id || 0],
        })
      ).rows[0];
      if (!sup) return res.status(403).json({ error: 'Bạn không phụ trách hướng dẫn NCS này.' });
    }
  }

  const [enriched] = await loadEnrichedPhdList({ phdStudentId: phdId }, user);
  if (!enriched) return res.status(404).json({ error: 'Không tìm thấy hồ sơ NCS.' });

  const [semRes, defRes] = await Promise.all([
    db.execute({
      sql: `SELECT cm.*, s.full_name, s.title_display, s.work_unit
            FROM phd_committee_members cm JOIN scientists s ON s.id = cm.scientist_id
            WHERE cm.phd_student_id = ? AND cm.committee_type = 'seminar' ORDER BY cm.id ASC`,
      args: [phdId],
    }),
    db.execute({
      sql: `SELECT cm.*, s.full_name, s.title_display, s.work_unit
            FROM phd_committee_members cm JOIN scientists s ON s.id = cm.scientist_id
            WHERE cm.phd_student_id = ? AND cm.committee_type = 'defense' ORDER BY cm.id ASC`,
      args: [phdId],
    }),
  ]);

  if (templateCode === 'ir_invitation') {
    await recordSecretAccess(user, 'ir_dossier', phdId, 'Xuất Giấy mời Phản biện độc lập (.docx ẩn danh)', req);
  }

  const { buffer, filename } = await generatePhdDocxForm(templateCode as any, {
    ...enriched,
    seminar_members: semRes.rows,
    defense_members: defRes.rows,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

formsRouter.get('/api/forms/scientist/:id/cv-5y', authenticateToken, async (req: AuthedRequest, res) => {
  const sciId = Number(req.params.id);
  const user = req.user!;
  if (!isAdminOrStaff(user) && Number(user.scientist_id) !== sciId) {
    return res.status(403).json({ error: 'Bạn chỉ có thể xuất Lý lịch khoa học của bản thân.' });
  }

  const list = await loadEnrichedScientists({ listType: 'all' }, user);
  const sci = list.find((s: any) => Number(s.id) === sciId);
  if (!sci) return res.status(404).json({ error: 'Không tìm thấy hồ sơ Cán bộ.' });

  const { buffer, filename } = await generateScientistCvDocx(sci);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

/* ==================== CONFLICT OF INTEREST (COI) CHECK ==================== */

formsRouter.post('/api/check/coi', authenticateToken, requirePermission('phd:write_all'), async (req: AuthedRequest, res) => {
  const { phd_student_id, target_type, members } = req.body || {};
  const phdId = Number(phd_student_id);
  if (!phdId || !['seminar', 'independent_reviewer', 'defense_council'].includes(target_type)) {
    return res.status(400).json({ error: 'Thiếu phd_student_id hoặc target_type hợp lệ.' });
  }

  const memberList: Array<{ scientist_id: number; member_role?: string }> = Array.isArray(members) ? members : [];
  const candidateIds = memberList.map((m) => Number(m.scientist_id)).filter((id) => id > 0);
  if (candidateIds.length === 0) {
    return res.json({ valid: true, errors: [], warnings: [] });
  }

  const [config, phdRow, supRows, pubRows, sciRows, sciPubRows] = await Promise.all([
    getRegulationConfig(),
    db.execute({ sql: 'SELECT id, ir_declined_info FROM phd_students WHERE id = ?', args: [phdId] }),
    db.execute({ sql: 'SELECT scientist_id FROM phd_supervisions WHERE phd_student_id = ?', args: [phdId] }),
    db.execute({ sql: 'SELECT authors FROM phd_publications WHERE phd_student_id = ?', args: [phdId] }),
    db.execute({
      sql: `SELECT id, full_name, title_display, email, work_unit, is_internal FROM scientists WHERE id IN (${candidateIds.map(() => '?').join(',')})`,
      args: candidateIds,
    }),
    db.execute({
      sql: `SELECT * FROM scientist_publications WHERE scientist_id IN (${candidateIds.map(() => '?').join(',')})`,
      args: candidateIds,
    }),
  ]);

  const phd = phdRow.rows[0] as any;
  if (!phd) return res.status(404).json({ error: 'Không tìm thấy hồ sơ NCS.' });

  const sciMap = new Map<number, any>((sciRows.rows as any[]).map((s) => [Number(s.id), s]));
  const pubsBySci = new Map<number, any[]>();
  for (const p of sciPubRows.rows as any[]) {
    const sid = Number(p.scientist_id);
    if (!pubsBySci.has(sid)) pubsBySci.set(sid, []);
    pubsBySci.get(sid)!.push({
      title: p.title,
      pubYear: Number(p.pub_year),
      pubType: p.pub_type,
      authorRole: p.author_role,
      hdgsnnMaxPoint: p.hdgsnn_max_point,
      totalAuthors: p.total_authors,
    });
  }

  const candidates = memberList
    .map((m) => {
      const s = sciMap.get(Number(m.scientist_id));
      if (!s) return null;
      return {
        id: Number(s.id),
        full_name: String(s.full_name),
        title_display: String(s.title_display || ''),
        email: String(s.email || ''),
        work_unit: String(s.work_unit || ''),
        is_internal: Number(s.is_internal || 0),
        member_role: m.member_role,
        researchEvaluation: evaluateScientistResearchCapacity(pubsBySci.get(Number(s.id)) || [], config),
      };
    })
    .filter(Boolean) as any[];

  const result = evaluateAcademicCoi({
    targetType: target_type,
    candidates,
    supervisorIds: (supRows.rows as any[]).map((r) => Number(r.scientist_id)),
    declinedIrText: phd.ir_declined_info || '',
    phdPubAuthors: (pubRows.rows as any[]).map((r) => String(r.authors || '')).filter(Boolean),
    config,
  });

  res.json(result);
});

/* ==================== DOI METADATA LOOKUP ==================== */

formsRouter.get('/api/publications/lookup-doi', authenticateToken, async (req, res) => {
  const doi = String(req.query.doi || '').trim();
  if (!doi) return res.status(400).json({ error: 'Vui lòng nhập mã DOI.' });
  try {
    const metadata = await lookupDoiMetadata(doi);
    res.json(metadata);
  } catch (err: any) {
    res.status(422).json({ error: err?.message || 'Không tra cứu được thông tin DOI.' });
  }
});
