export type UserRole = 'admin' | 'staff' | 'supervisor' | 'phd_student';

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
