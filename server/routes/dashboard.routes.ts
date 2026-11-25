import { Router } from 'express';
import {
  calculateSupervisorQuotaAndHours,
  computeDeadlinesCountdown,
  evaluatePhdPublications,
  evaluateScientistResearchCapacity,
  STUDY_STATUS_LABELS,
} from '../../shared/regulation3638';
import type { StudyStatus } from '../../shared/types';
import { db } from '../db';
import { authenticateToken, requireRoles } from '../middlewares/auth';
import { getRegulationConfig } from '../services/settings';
import type { AuthedRequest } from '../types';

export const dashboardRouter = Router();

dashboardRouter.get('/api/dashboard/summary', authenticateToken, requireRoles('admin', 'staff'), async (_req: AuthedRequest, res) => {
  const config = await getRegulationConfig();

  const [phdsRes, phdPubsRes, scientistsRes, sciPubsRes, supsRes, facultiesRes] = await Promise.all([
    db.execute(`
      SELECT p.*, f.name as faculty_name, f.short_name as faculty_short_name, m.name as major_name
      FROM phd_students p
      LEFT JOIN faculties f ON f.id = p.faculty_id
      LEFT JOIN majors m ON m.id = p.major_id
    `),
    db.execute('SELECT * FROM phd_publications'),
    db.execute('SELECT * FROM scientists'),
    db.execute('SELECT * FROM scientist_publications'),
    db.execute(`
      SELECT ps.*, p.study_status, p.is_completed
      FROM phd_supervisions ps
      JOIN phd_students p ON p.id = ps.phd_student_id
    `),
    db.execute('SELECT * FROM faculties WHERE active = 1 ORDER BY id ASC'),
  ]);

  const phds = phdsRes.rows as any[];
  const phdPubsByPhd = new Map<number, any[]>();
  for (const pub of phdPubsRes.rows as any[]) {
    const id = Number(pub.phd_student_id);
    if (!phdPubsByPhd.has(id)) phdPubsByPhd.set(id, []);
    phdPubsByPhd.get(id)!.push({
      ...pub,
      pubYear: Number(pub.pub_year),
      itemKind: pub.item_kind,
      pubType: pub.pub_type,
      authorRole: pub.author_role,
      hdgsnnMaxPoint: pub.hdgsnn_max_point,
    });
  }

  const byStatus: Record<string, number> = {};
  const byFacultyMap = new Map<string, { facultyId: number; name: string; shortName: string; total: number; studying: number; graduated: number }>();
  for (const f of facultiesRes.rows as any[]) {
    byFacultyMap.set(String(f.id), {
      facultyId: Number(f.id),
      name: f.name,
      shortName: f.short_name || f.code,
      total: 0,
      studying: 0,
      graduated: 0,
    });
  }

  let activePhdCount = 0;
  let pubMetCount = 0;
  let pubInProgressCount = 0;
  let pubNotMetCount = 0;
  let pendingIrCount = 0;
  const deadlineAlerts: any[] = [];

  for (const p of phds) {
    const st = String(p.study_status || 'studying') as StudyStatus;
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (!p.is_completed && ['studying', 'extended', 'ready_defense'].includes(st)) {
      activePhdCount++;
    }

    const facKey = String(p.faculty_id || '0');
    if (byFacultyMap.has(facKey)) {
      const f = byFacultyMap.get(facKey)!;
      f.total++;
      if (!p.is_completed && ['studying', 'extended', 'ready_defense'].includes(st)) f.studying++;
      if (st === 'graduated' || st === 'defended') f.graduated++;
    }

    const pubs = phdPubsByPhd.get(Number(p.id)) || [];
    const pubEval = evaluatePhdPublications(pubs, config);
    if (pubEval.status === 'met') pubMetCount++;
    else if (pubEval.status === 'in_progress') pubInProgressCount++;
    else pubNotMetCount++;

    const dl = computeDeadlinesCountdown(p, config, true);
    if (p.ir_due_date && !p.ir_result && !p.is_completed) {
      pendingIrCount++;
    }

    const alertsForPhd = [
      { kind: 'standard', label: 'Hạn đào tạo chuẩn', metric: dl.standard },
      { kind: 'max', label: 'Hạn đào tạo tối đa', metric: dl.max },
      { kind: 'output_fl', label: 'Hạn xét lại CĐR NN', metric: dl.outputFlReview },
      ...(dl.irDue ? [{ kind: 'ir_due', label: 'Hạn nhận xét PBĐL (Mật)', metric: dl.irDue }] : []),
    ];

    for (const a of alertsForPhd) {
      if (['overdue', 'urgent', 'warning'].includes(a.metric.level)) {
        deadlineAlerts.push({
          phdId: Number(p.id),
          phdCode: p.phd_code,
          fullName: p.full_name,
          facultyName: p.faculty_short_name || p.faculty_name || '',
          kind: a.kind,
          kindLabel: a.label,
          date: a.metric.date,
          daysLeft: a.metric.daysLeft,
          level: a.metric.level,
          label: a.metric.label,
        });
      }
    }
  }

  deadlineAlerts.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  // Scientists & Supervisor Quota summary
  const sciPubsBySci = new Map<number, any[]>();
  for (const sp of sciPubsRes.rows as any[]) {
    const id = Number(sp.scientist_id);
    if (!sciPubsBySci.has(id)) sciPubsBySci.set(id, []);
    sciPubsBySci.get(id)!.push({
      ...sp,
      pubYear: Number(sp.pub_year),
      pubType: sp.pub_type,
      authorRole: sp.author_role,
      hdgsnnMaxPoint: sp.hdgsnn_max_point,
    });
  }

  const supsBySci = new Map<number, any[]>();
  for (const s of supsRes.rows as any[]) {
    const id = Number(s.scientist_id);
    if (!supsBySci.has(id)) supsBySci.set(id, []);
    supsBySci.get(id)!.push(s);
  }

  let totalSupervisors = 0;
  let totalSeminarMembers = 0;
  let totalIrMembers = 0;
  let totalDefenseMembers = 0;
  let overQuotaCount = 0;
  let nearQuotaCount = 0;
  let totalStandardHours = 0;
  const quotaAlerts: any[] = [];

  for (const sc of scientistsRes.rows as any[]) {
    if (sc.is_supervisor) totalSupervisors++;
    if (sc.is_seminar_member) totalSeminarMembers++;
    if (sc.is_independent_reviewer) totalIrMembers++;
    if (sc.is_defense_council_member) totalDefenseMembers++;

    const resEval = evaluateScientistResearchCapacity(sciPubsBySci.get(Number(sc.id)) || [], config);
    const quotaEval = calculateSupervisorQuotaAndHours(sc, supsBySci.get(Number(sc.id)) || [], resEval, config);
    if (sc.is_supervisor) {
      totalStandardHours += quotaEval.standardHours;
      if (quotaEval.status === 'over_limit') {
        overQuotaCount++;
        quotaAlerts.push({
          scientistId: Number(sc.id),
          fullName: sc.full_name,
          titleDisplay: sc.title_display,
          workUnit: sc.work_unit,
          equivalentLoad: quotaEval.equivalentLoad,
          effectiveQuota: quotaEval.effectiveQuota,
          status: quotaEval.status,
          eligibleForSpecialRequest: quotaEval.eligibleForSpecialRequest,
        });
      } else if (quotaEval.status === 'near_limit') {
        nearQuotaCount++;
        quotaAlerts.push({
          scientistId: Number(sc.id),
          fullName: sc.full_name,
          titleDisplay: sc.title_display,
          workUnit: sc.work_unit,
          equivalentLoad: quotaEval.equivalentLoad,
          effectiveQuota: quotaEval.effectiveQuota,
          status: quotaEval.status,
          eligibleForSpecialRequest: quotaEval.eligibleForSpecialRequest,
        });
      }
    }
  }

  res.json({
    kpis: {
      totalPhds: phds.length,
      activePhds: activePhdCount,
      graduatedPhds: (byStatus.graduated || 0) + (byStatus.defended || 0),
      pubMetCount,
      pubInProgressCount,
      pubNotMetCount,
      pendingIrCount,
      urgentDeadlineCount: deadlineAlerts.filter((a) => a.level === 'overdue' || a.level === 'urgent').length,
      totalScientists: scientistsRes.rows.length,
      totalSupervisors,
      totalSeminarMembers,
      totalIrMembers,
      totalDefenseMembers,
      overQuotaCount,
      nearQuotaCount,
      totalStandardHours: Math.round(totalStandardHours * 100) / 100,
    },
    byStatus: Object.entries(STUDY_STATUS_LABELS).map(([key, label]) => ({
      status: key,
      label,
      count: byStatus[key] || 0,
    })),
    byFaculty: Array.from(byFacultyMap.values()),
    deadlineAlerts: deadlineAlerts.slice(0, 20),
    quotaAlerts: quotaAlerts.slice(0, 15),
  });
});
