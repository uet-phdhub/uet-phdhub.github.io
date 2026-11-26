export type UserRole = 'admin' | 'staff' | 'supervisor' | 'phd_student';

export type PermissionCode =
  | 'phd:read_all'
  | 'phd:write_all'
  | 'phd:read_own'
  | 'ir:manage'
  | 'scientist:manage'
  | 'scientist:read_financial'
  | 'publication:verify'
  | 'request:create'
  | 'request:supervisor_review'
  | 'request:approve'
  | 'payment:manage'
  | 'forms:generate'
  | 'system:manage';

export type AcademicRank = 'GS' | 'PGS' | '';
export type AcademicDegree = 'TSKH' | 'TS' | 'ThS' | '';

export type SupervisionRole = 'independent' | 'primary' | 'secondary' | 'co';
export type CommitteeType = 'seminar' | 'defense';
export type CommitteeMemberRole = 'chair' | 'secretary' | 'reviewer_1' | 'reviewer_2' | 'reviewer_3' | 'member';

export type StudyStatus =
  | 'studying'
  | 'extended'
  | 'deferred'
  | 'ready_defense'
  | 'defended'
  | 'graduated'
  | 'withdrawn';

export type PublicationType =
  | 'wos_q1'
  | 'wos_q2'
  | 'wos_q3'
  | 'wos_q4'
  | 'scopus_journal'
  | 'intl_conf_scopus'
  | 'vn_hdgsnn_high'
  | 'vn_hdgsnn_std'
  | 'monograph_intl'
  | 'monograph_vn'
  | 'patent_intl'
  | 'patent_vn'
  | 'other';

export type AuthorRole = 'first' | 'corresponding' | 'main' | 'coauthor';

export interface Regulation3638Config {
  pubTypePoints: Record<PublicationType, number>;
  useMaxPointForMainAuthor: boolean;
  coauthorWeight: number;
  phdMinPoints: number;
  phdMinWosScopus: number;
  scientistWindowYears: number;
  supervisorMinPoints: number;
  reviewerMinPoints: number;
  councilMinPoints: number;
  seminarMinPoints: number;
  excellentWosPerYear: number;
  excellentConsecutiveYears: number;
  quotaGs: number;
  quotaPgsTskh: number;
  quotaTs: number;
  weightIndependent: number;
  weightPrimary: number;
  weightSecondary: number;
  weightCo: number;
  standardHoursPerUnit: number;
  quotaCountedStatuses: StudyStatus[];
  deadlineWarnDays: number;
  deadlineUrgentDays: number;
  flWarnDays: number;
  irWarnDays: number;
}

export interface CompletedCourseItem {
  code: string;
  name: string;
  credits: number;
  grade?: string;
  term?: string;
}

export interface TrainingChangeItem {
  date: string;
  changeType: string;
  decisionNo?: string;
  description: string;
}

export interface DoctoralSeminarItem {
  title: string;
  kind: 'chuyen_de' | 'tltq';
  credits?: number;
  completedDate?: string;
  scoreOrResult?: string;
}

export interface PublicationInput {
  id?: number;
  title: string;
  authors?: string;
  venue?: string;
  pubYear: number;
  itemKind?: 'article' | 'research_project' | 'patent' | 'conference';
  pubType: PublicationType;
  authorRole: AuthorRole;
  totalAuthors?: number;
  issnIsbn?: string;
  doiUrl?: string;
  hdgsnnMaxPoint?: number | null;
  calculatedPoint?: number;
  evidenceUrl?: string;
  evidenceDocId?: number | null;
  verified?: boolean;
  notes?: string;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture?: string | null;
  role: UserRole;
  is_supervisor: number;
  scientist_id?: number | null;
  phd_student_id?: number | null;
  token_version?: number;
  permissions?: PermissionCode[];
}

export interface FacultyItem {
  id: number;
  code: string;
  name: string;
  short_name?: string;
  active: number;
}

export interface MajorItem {
  id: number;
  code: string;
  name: string;
  faculty_id: number;
  faculty_name?: string;
  faculty_code?: string;
  active: number;
}

export interface RegulationVersionItem {
  id: number;
  code: string;
  name: string;
  effective_from: string;
  config: Regulation3638Config;
  is_default: number;
  revision: number;
  updated_at?: string;
}

export interface CohortItem {
  id: number;
  code: string;
  name?: string;
  regulation_version_id: number | null;
  regulation_code?: string;
  start_date: string;
  standard_months_master: number;
  max_months_master: number;
  standard_months_bachelor: number;
  max_months_bachelor: number;
  active: number;
}

export interface ReportingCycleItem {
  id: number;
  term_code: string;
  title: string;
  open_date: string;
  due_date: string;
  status: 'open' | 'closed';
  notes?: string;
  created_at?: string;
}

export type ChangeRequestType =
  | 'extension'
  | 'deferral'
  | 'topic_change'
  | 'supervisor_change'
  | 'special_quota';

export type ChangeRequestStatus =
  | 'submitted'
  | 'supervisor_approved'
  | 'needs_revision'
  | 'approved'
  | 'rejected';

export interface ChangeRequestItem {
  id: number;
  request_type: ChangeRequestType;
  phd_student_id?: number | null;
  phd_code?: string;
  phd_name?: string;
  scientist_id?: number | null;
  scientist_name?: string;
  created_by_user_id: number;
  created_by_name?: string;
  payload: Record<string, any>;
  reason: string;
  evidence_url?: string;
  status: ChangeRequestStatus;
  supervisor_comment?: string;
  supervisor_approved_by?: number | null;
  supervisor_approved_at?: string | null;
  admin_comment?: string;
  decision_no?: string;
  decision_date?: string;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type FeeActivityType = 'seminar' | 'independent_review' | 'defense_council' | 'supervision_hour';

export interface FeeRateItem {
  id: number;
  fiscal_year: string;
  activity_type: FeeActivityType;
  role_code: string;
  label: string;
  unit_amount: number;
  pit_tax_rate: number;
  pit_threshold: number;
  active: number;
}

export interface PaymentBatchItem {
  id: number;
  batch_code: string;
  title: string;
  period_from: string;
  period_to: string;
  hide_ir_phd_identity: number;
  status: 'draft' | 'confirmed' | 'paid';
  voucher_no?: string;
  total_gross: number;
  total_tax: number;
  total_net: number;
  item_count?: number;
  created_at?: string;
}

export interface PaymentItemRow {
  id?: number;
  batch_id?: number;
  scientist_id: number;
  scientist_name?: string;
  title_display?: string;
  work_unit?: string;
  is_internal?: number;
  cccd?: string;
  tax_code?: string;
  bank_account?: string;
  bank_name?: string;
  source_type: FeeActivityType;
  source_id: string;
  role_code: string;
  phd_code?: string;
  phd_name?: string;
  description: string;
  quantity: number;
  unit_amount: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  tax_exempt_declared: number;
  missing_payment_fields?: string[];
}

export interface EmailTemplateItem {
  code: string;
  name: string;
  subject_template: string;
  body_template: string;
  active: number;
  updated_at?: string;
}

export interface SystemBannerConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  bannerText: string;
  bannerTone: 'info' | 'warning';
}

export interface CoiIssue {
  severity: 'error' | 'warning';
  code: string;
  scientistId?: number;
  scientistName?: string;
  message: string;
}

export interface CoiCheckResult {
  valid: boolean;
  errors: CoiIssue[];
  warnings: CoiIssue[];
}

export interface DeadlineMetric {
  date: string | null;
  daysLeft: number | null;
  level: 'none' | 'safe' | 'warning' | 'urgent' | 'overdue' | 'completed';
  label: string;
}

export interface PhdDeadlinesSummary {
  standard: DeadlineMetric;
  max: DeadlineMetric;
  outputFlReview: DeadlineMetric;
  irDue?: DeadlineMetric;
}

export interface PhdPublicationEvaluation {
  totalPoints: number;
  mainAuthorPoints: number;
  wosScopusCount: number;
  totalCount: number;
  articleCount: number;
  projectCount: number;
  status: 'met' | 'in_progress' | 'not_met';
  label: string;
  meetsPoints: boolean;
  meetsWosScopus: boolean;
}

export interface ScientistResearchEvaluation {
  windowYears: number;
  fromYear: number;
  toYear: number;
  totalPoints: number;
  allTimePoints: number;
  pubCountInWindow: number;
  wosScopusInWindow: number;
  meetsSupervisor: boolean;
  meetsSeminar: boolean;
  meetsReviewer: boolean;
  meetsCouncil: boolean;
  excellentByPublications: boolean;
  excellentStreakYears: number[];
}

export interface SupervisorQuotaEvaluation {
  baseQuota: number;
  effectiveQuota: number;
  isSpecialApproved: boolean;
  eligibleForSpecialRequest: boolean;
  activeStudentCount: number;
  countsByRole: Record<SupervisionRole, number>;
  equivalentLoad: number;
  standardHours: number;
  utilizationRatio: number;
  status: 'ok' | 'near_limit' | 'over_limit';
}
