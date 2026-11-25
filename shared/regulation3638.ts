import type {
  AcademicDegree,
  AcademicRank,
  AuthorRole,
  DeadlineMetric,
  PhdDeadlinesSummary,
  PhdPublicationEvaluation,
  PublicationInput,
  PublicationType,
  Regulation3638Config,
  ScientistResearchEvaluation,
  StudyStatus,
  SupervisionRole,
  SupervisorQuotaEvaluation,
} from './types';

export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  studying: 'Đang học',
  extended: 'Đang gia hạn',
  deferred: 'Bảo lưu / Tạm dừng',
  ready_defense: 'Chờ bảo vệ',
  defended: 'Đã bảo vệ LATS',
  graduated: 'Đã cấp bằng TS',
  withdrawn: 'Thôi học / Hết hạn',
};

export const SUPERVISION_ROLE_LABELS: Record<SupervisionRole, string> = {
  independent: 'CBHD độc lập',
  primary: 'CBHD chính',
  secondary: 'CBHD phụ',
  co: 'CB đồng hướng dẫn',
};

export const COMMITTEE_MEMBER_ROLE_LABELS: Record<string, string> = {
  chair: 'Chủ tịch HĐ',
  secretary: 'Thư ký HĐ',
  reviewer_1: 'Phản biện 1',
  reviewer_2: 'Phản biện 2',
  reviewer_3: 'Phản biện 3',
  member: 'Ủy viên',
};

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  wos_q1: 'Bài báo WoS / Scopus Q1',
  wos_q2: 'Bài báo WoS / Scopus Q2',
  wos_q3: 'Bài báo WoS / Scopus Q3',
  wos_q4: 'Bài báo WoS / Scopus Q4',
  scopus_journal: 'Tạp chí Scopus / WoS (khác)',
  intl_conf_scopus: 'Hội nghị quốc tế Scopus / IEEE / ACM',
  vn_hdgsnn_high: 'Tạp chí trong nước (HĐGSNN 0.75–1.0đ)',
  vn_hdgsnn_std: 'Tạp chí trong nước (HĐGSNN 0.25–0.5đ)',
  monograph_intl: 'Sách chuyên khảo quốc tế (ISBN)',
  monograph_vn: 'Sách chuyên khảo trong nước (ISBN)',
  patent_intl: 'Bằng độc quyền sáng chế quốc tế',
  patent_vn: 'Bằng độc quyền sáng chế / GPHI Việt Nam',
  other: 'Công trình / Đề tài NCKH khác',
};

export const AUTHOR_ROLE_LABELS: Record<AuthorRole, string> = {
  first: 'Tác giả đầu (First author)',
  corresponding: 'Tác giả liên hệ (Corresponding)',
  main: 'Tác giả chính',
  coauthor: 'Đồng tác giả',
};

export const WOS_SCOPUS_TYPES = new Set<PublicationType>([
  'wos_q1',
  'wos_q2',
  'wos_q3',
  'wos_q4',
  'scopus_journal',
  'intl_conf_scopus',
]);

export const DEFAULT_REGULATION_3638_CONFIG: Regulation3638Config = {
  pubTypePoints: {
    wos_q1: 2.0,
    wos_q2: 1.5,
    wos_q3: 1.25,
    wos_q4: 1.0,
    scopus_journal: 1.0,
    intl_conf_scopus: 0.75,
    vn_hdgsnn_high: 1.0,
    vn_hdgsnn_std: 0.5,
    monograph_intl: 2.0,
    monograph_vn: 1.0,
    patent_intl: 2.0,
    patent_vn: 1.0,
    other: 0.25,
  },
  useMaxPointForMainAuthor: true,
  coauthorWeight: 0.5,
  phdMinPoints: 2.0,
  phdMinWosScopus: 1,
  scientistWindowYears: 5,
  supervisorMinPoints: 4.0,
  reviewerMinPoints: 4.0,
  councilMinPoints: 3.0,
  seminarMinPoints: 2.0,
  excellentWosPerYear: 3,
  excellentConsecutiveYears: 3,
  quotaGs: 7,
  quotaPgsTskh: 5,
  quotaTs: 3,
  weightIndependent: 1.0,
  weightPrimary: 0.5,
  weightSecondary: 0.3,
  weightCo: 0.5,
  standardHoursPerUnit: 50,
  quotaCountedStatuses: ['studying', 'extended', 'ready_defense'],
  deadlineWarnDays: 90,
  deadlineUrgentDays: 30,
  flWarnDays: 60,
  irWarnDays: 7,
};

export function mergeRegulationConfig(raw?: Partial<Regulation3638Config> | null): Regulation3638Config {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REGULATION_3638_CONFIG, pubTypePoints: { ...DEFAULT_REGULATION_3638_CONFIG.pubTypePoints } };
  return {
    ...DEFAULT_REGULATION_3638_CONFIG,
    ...raw,
    pubTypePoints: {
      ...DEFAULT_REGULATION_3638_CONFIG.pubTypePoints,
      ...(raw.pubTypePoints || {}),
    },
    quotaCountedStatuses:
      Array.isArray(raw.quotaCountedStatuses) && raw.quotaCountedStatuses.length > 0
        ? raw.quotaCountedStatuses
        : [...DEFAULT_REGULATION_3638_CONFIG.quotaCountedStatuses],
  };
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function isMainAuthor(role: AuthorRole | string | undefined): boolean {
  return role === 'first' || role === 'corresponding' || role === 'main';
}

export function isWosScopus(pubType: PublicationType | string | undefined): boolean {
  return WOS_SCOPUS_TYPES.has(pubType as PublicationType);
}

export function calculatePublicationPoint(
  pub: Pick<PublicationInput, 'pubType' | 'authorRole' | 'hdgsnnMaxPoint' | 'totalAuthors'>,
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG
): number {
  const explicit =
    pub.hdgsnnMaxPoint !== null &&
    pub.hdgsnnMaxPoint !== undefined &&
    Number.isFinite(Number(pub.hdgsnnMaxPoint)) &&
    Number(pub.hdgsnnMaxPoint) >= 0
      ? Number(pub.hdgsnnMaxPoint)
      : null;

  const basePoint = explicit !== null
    ? explicit
    : Number(config.pubTypePoints[pub.pubType] ?? config.pubTypePoints.other ?? 0.25);

  if (isMainAuthor(pub.authorRole)) {
    return round2(basePoint);
  }
  const weight = Number.isFinite(config.coauthorWeight) ? config.coauthorWeight : 0.5;
  return round2(basePoint * weight);
}

export function evaluatePhdPublications(
  pubs: PublicationInput[],
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG
): PhdPublicationEvaluation {
  let totalPoints = 0;
  let mainAuthorPoints = 0;
  let wosScopusCount = 0;
  let articleCount = 0;
  let projectCount = 0;

  for (const pub of pubs) {
    const pt = calculatePublicationPoint(pub, config);
    totalPoints += pt;
    if (isMainAuthor(pub.authorRole)) {
      mainAuthorPoints += pt;
      if (isWosScopus(pub.pubType)) wosScopusCount += 1;
    }
    if (pub.itemKind === 'research_project') projectCount += 1;
    else articleCount += 1;
  }

  totalPoints = round2(totalPoints);
  mainAuthorPoints = round2(mainAuthorPoints);

  const effectivePoints = config.useMaxPointForMainAuthor ? mainAuthorPoints : totalPoints;
  const meetsPoints = effectivePoints >= config.phdMinPoints;
  const meetsWosScopus = wosScopusCount >= config.phdMinWosScopus;

  let status: 'met' | 'in_progress' | 'not_met' = 'not_met';
  let label = 'Chưa đạt yêu cầu';
  if (meetsPoints && meetsWosScopus) {
    status = 'met';
    label = 'Đạt chuẩn 3638';
  } else if (pubs.length > 0) {
    status = 'in_progress';
    const missing: string[] = [];
    if (!meetsPoints) missing.push(`thiếu ${round2(config.phdMinPoints - effectivePoints)}đ`);
    if (!meetsWosScopus) missing.push(`thiếu ${config.phdMinWosScopus - wosScopusCount} WoS/Scopus`);
    label = `Đang tích lũy (${missing.join(', ')})`;
  }

  return {
    totalPoints,
    mainAuthorPoints,
    wosScopusCount,
    totalCount: pubs.length,
    articleCount,
    projectCount,
    status,
    label,
    meetsPoints,
    meetsWosScopus,
  };
}

export function evaluateScientistResearchCapacity(
  pubs: PublicationInput[],
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG,
  referenceYear: number = new Date().getFullYear()
): ScientistResearchEvaluation {
  const windowYears = Math.max(1, Number(config.scientistWindowYears) || 5);
  const toYear = referenceYear;
  const fromYear = toYear - windowYears + 1;

  let totalPoints = 0;
  let allTimePoints = 0;
  let pubCountInWindow = 0;
  let wosScopusInWindow = 0;
  const wosMainByYear = new Map<number, number>();

  for (const pub of pubs) {
    const pt = calculatePublicationPoint(pub, config);
    const yr = Number(pub.pubYear) || 0;
    allTimePoints += pt;
    if (yr >= fromYear && yr <= toYear) {
      totalPoints += pt;
      pubCountInWindow += 1;
      if (isWosScopus(pub.pubType)) {
        wosScopusInWindow += 1;
      }
    }
    if (yr > 0 && isMainAuthor(pub.authorRole) && isWosScopus(pub.pubType)) {
      wosMainByYear.set(yr, (wosMainByYear.get(yr) || 0) + 1);
    }
  }

  totalPoints = round2(totalPoints);
  allTimePoints = round2(allTimePoints);

  // Check consecutive years (default: >= 3 WoS/Scopus main-author pubs/year for 3 consecutive recent years)
  const reqPerYear = Math.max(1, Number(config.excellentWosPerYear) || 3);
  const reqStreak = Math.max(1, Number(config.excellentConsecutiveYears) || 3);
  let excellentByPublications = false;
  let excellentStreakYears: number[] = [];

  for (const endYear of [referenceYear, referenceYear - 1]) {
    const streak: number[] = [];
    for (let y = endYear - reqStreak + 1; y <= endYear; y++) {
      if ((wosMainByYear.get(y) || 0) >= reqPerYear) {
        streak.push(y);
      }
    }
    if (streak.length >= reqStreak) {
      excellentByPublications = true;
      excellentStreakYears = streak;
      break;
    }
  }

  return {
    windowYears,
    fromYear,
    toYear,
    totalPoints,
    allTimePoints,
    pubCountInWindow,
    wosScopusInWindow,
    meetsSupervisor: totalPoints >= config.supervisorMinPoints,
    meetsSeminar: totalPoints >= config.seminarMinPoints,
    meetsReviewer: totalPoints >= config.reviewerMinPoints,
    meetsCouncil: totalPoints >= config.councilMinPoints,
    excellentByPublications,
    excellentStreakYears,
  };
}

export function getSupervisionWeight(
  role: SupervisionRole,
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG
): number {
  switch (role) {
    case 'independent':
      return Number(config.weightIndependent ?? 1.0);
    case 'primary':
      return Number(config.weightPrimary ?? 0.5);
    case 'secondary':
      return Number(config.weightSecondary ?? 0.3);
    case 'co':
      return Number(config.weightCo ?? 0.5);
    default:
      return 0;
  }
}

export function getBaseQuotaByTitle(
  academicRank: AcademicRank | string | undefined,
  academicDegree: AcademicDegree | string | undefined,
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG
): number {
  const rank = String(academicRank || '').toUpperCase().trim();
  const degree = String(academicDegree || '').toUpperCase().trim();
  if (rank === 'GS' || rank.includes('GIÁO SƯ') && !rank.includes('PHÓ')) {
    return Number(config.quotaGs ?? 7);
  }
  if (rank === 'PGS' || rank.includes('PHÓ GIÁO SƯ') || degree === 'TSKH') {
    return Number(config.quotaPgsTskh ?? 5);
  }
  if (degree === 'TS' || degree.includes('TIẾN SĨ')) {
    return Number(config.quotaTs ?? 3);
  }
  return 0;
}

export function calculateSupervisorQuotaAndHours(
  scientist: {
    academic_rank?: string | null;
    academic_degree?: string | null;
    special_quota_approved?: number | boolean | null;
    special_quota_limit?: number | null;
    has_major_grant_scholarship?: number | boolean | null;
  },
  supervisions: Array<{
    role: SupervisionRole;
    study_status?: StudyStatus | string | null;
    is_active?: number | boolean | null;
    is_completed?: number | boolean | null;
  }>,
  researchEval?: ScientistResearchEvaluation | null,
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG
): SupervisorQuotaEvaluation {
  const countedSet = new Set<string>(config.quotaCountedStatuses || ['studying', 'extended', 'ready_defense']);
  const countsByRole: Record<SupervisionRole, number> = {
    independent: 0,
    primary: 0,
    secondary: 0,
    co: 0,
  };

  let equivalentLoad = 0;
  let activeStudentCount = 0;

  for (const sup of supervisions) {
    if (sup.is_active === 0 || sup.is_active === false) continue;
    if (sup.is_completed === 1 || sup.is_completed === true) continue;
    if (sup.study_status && !countedSet.has(String(sup.study_status))) continue;
    const r = sup.role;
    if (r in countsByRole) {
      countsByRole[r] += 1;
      equivalentLoad += getSupervisionWeight(r, config);
      activeStudentCount += 1;
    }
  }

  equivalentLoad = round2(equivalentLoad);
  const baseQuota = getBaseQuotaByTitle(scientist.academic_rank || '', scientist.academic_degree || '', config);
  const isSpecialApproved = Boolean(scientist.special_quota_approved);
  const effectiveQuota =
    isSpecialApproved && scientist.special_quota_limit && Number(scientist.special_quota_limit) > baseQuota
      ? Number(scientist.special_quota_limit)
      : baseQuota;

  const eligibleForSpecialRequest = Boolean(
    researchEval?.excellentByPublications || scientist.has_major_grant_scholarship
  );
  const standardHours = round2(equivalentLoad * Number(config.standardHoursPerUnit || 50));
  const utilizationRatio = effectiveQuota > 0 ? round2(equivalentLoad / effectiveQuota) : equivalentLoad > 0 ? 1.5 : 0;

  let status: 'ok' | 'near_limit' | 'over_limit' = 'ok';
  if (effectiveQuota > 0 && equivalentLoad > effectiveQuota) {
    status = 'over_limit';
  } else if (effectiveQuota > 0 && equivalentLoad >= effectiveQuota * 0.8) {
    status = 'near_limit';
  } else if (effectiveQuota === 0 && equivalentLoad > 0) {
    status = 'over_limit';
  }

  return {
    baseQuota,
    effectiveQuota,
    isSpecialApproved,
    eligibleForSpecialRequest,
    activeStudentCount,
    countsByRole,
    equivalentLoad,
    standardHours,
    utilizationRatio,
    status,
  };
}

export function getVietnamTodayIso(now: Date = new Date()): string {
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().slice(0, 10);
}

export function diffDaysFromVietnamToday(targetDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!targetDate) return null;
  const trimmed = String(targetDate).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const todayIso = getVietnamTodayIso(now);
  const todayMs = Date.UTC(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1, Number(todayIso.slice(8, 10)));
  const targetMs = Date.UTC(Number(trimmed.slice(0, 4)), Number(trimmed.slice(5, 7)) - 1, Number(trimmed.slice(8, 10)));
  return Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));
}

function buildDeadlineMetric(
  date: string | null | undefined,
  warnDays: number,
  urgentDays: number,
  isCompleted: boolean,
  now: Date
): DeadlineMetric {
  if (!date || !String(date).trim()) {
    return { date: null, daysLeft: null, level: 'none', label: 'Chưa thiết lập' };
  }
  const iso = String(date).trim().slice(0, 10);
  if (isCompleted) {
    return { date: iso, daysLeft: null, level: 'completed', label: 'Đã hoàn tất' };
  }
  const daysLeft = diffDaysFromVietnamToday(iso, now);
  if (daysLeft === null) {
    return { date: iso, daysLeft: null, level: 'none', label: 'Không hợp lệ' };
  }
  if (daysLeft < 0) {
    return { date: iso, daysLeft, level: 'overdue', label: `Quá hạn ${Math.abs(daysLeft)} ngày` };
  }
  if (daysLeft === 0) {
    return { date: iso, daysLeft: 0, level: 'urgent', label: 'Hết hạn hôm nay' };
  }
  if (daysLeft <= urgentDays) {
    return { date: iso, daysLeft, level: 'urgent', label: `Còn ${daysLeft} ngày` };
  }
  if (daysLeft <= warnDays) {
    return { date: iso, daysLeft, level: 'warning', label: `Còn ${daysLeft} ngày` };
  }
  return { date: iso, daysLeft, level: 'safe', label: `Còn ${daysLeft} ngày` };
}

export function computeDeadlinesCountdown(
  phd: {
    standard_deadline?: string | null;
    max_deadline?: string | null;
    output_fl_review_deadline?: string | null;
    ir_due_date?: string | null;
    ir_result?: string | null;
    study_status?: string | null;
    is_completed?: number | boolean | null;
  },
  config: Regulation3638Config = DEFAULT_REGULATION_3638_CONFIG,
  includeConfidential = false,
  now: Date = new Date()
): PhdDeadlinesSummary {
  const closed = Boolean(
    phd.is_completed ||
    phd.study_status === 'graduated' ||
    phd.study_status === 'defended' ||
    phd.study_status === 'withdrawn'
  );

  const summary: PhdDeadlinesSummary = {
    standard: buildDeadlineMetric(phd.standard_deadline, config.deadlineWarnDays, config.deadlineUrgentDays, closed, now),
    max: buildDeadlineMetric(phd.max_deadline, config.deadlineWarnDays, config.deadlineUrgentDays, closed, now),
    outputFlReview: buildDeadlineMetric(phd.output_fl_review_deadline, config.flWarnDays, Math.min(20, config.flWarnDays), closed, now),
  };

  if (includeConfidential) {
    const irDone = closed || Boolean(phd.ir_result && String(phd.ir_result).trim());
    summary.irDue = buildDeadlineMetric(phd.ir_due_date, config.irWarnDays * 2, config.irWarnDays, irDone, now);
  }
  return summary;
}

export function formatTitleDisplay(rank?: string | null, degree?: string | null): string {
  const r = String(rank || '').trim();
  const d = String(degree || '').trim();
  if (r && d) return `${r}.${d}`;
  return r || d || 'Chuyên gia';
}
