import { DEFAULT_REGULATION_3638_CONFIG } from '../../shared/regulation3638';
import { ADMIN_EMAIL } from '../config';
import { createDatabaseClient, db, setDb } from '../db';

export const V1_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS faculties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  faculty_id INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (faculty_id) REFERENCES faculties(id)
);

CREATE TABLE IF NOT EXISTS scientists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  academic_rank TEXT DEFAULT '',
  academic_degree TEXT DEFAULT 'TS',
  title_display TEXT DEFAULT '',
  recognition_year INTEGER,
  specialization TEXT DEFAULT '',
  work_unit TEXT DEFAULT '',
  is_internal INTEGER NOT NULL DEFAULT 1,
  email TEXT UNIQUE,
  phone TEXT DEFAULT '',
  bank_account TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  cccd TEXT DEFAULT '',
  tax_code TEXT DEFAULT '',
  is_supervisor INTEGER NOT NULL DEFAULT 0,
  is_seminar_member INTEGER NOT NULL DEFAULT 0,
  is_independent_reviewer INTEGER NOT NULL DEFAULT 0,
  is_defense_council_member INTEGER NOT NULL DEFAULT 0,
  supervisor_eligible_roles TEXT DEFAULT '["independent","primary","secondary","co"]',
  special_quota_approved INTEGER NOT NULL DEFAULT 0,
  special_quota_limit INTEGER,
  special_quota_reason TEXT DEFAULT '',
  special_quota_decision TEXT DEFAULT '',
  has_major_grant_scholarship INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS phd_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phd_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  dob TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  email TEXT UNIQUE,
  phone TEXT DEFAULT '',
  faculty_id INTEGER,
  major_id INTEGER,
  cohort TEXT DEFAULT '',
  cohort_id INTEGER,
  regulation_version_id INTEGER,

  work_unit TEXT DEFAULT '',
  admission_category TEXT DEFAULT '',
  entrance_foreign_language TEXT DEFAULT '',
  graduated_major_applied TEXT DEFAULT '',
  supplementary_courses TEXT DEFAULT '',
  degree_verification_status TEXT DEFAULT 'pending',
  degree_verification_note TEXT DEFAULT '',
  enrollment_date TEXT DEFAULT '',
  admission_decision_no TEXT DEFAULT '',
  admission_decision_date TEXT DEFAULT '',

  training_start_date TEXT DEFAULT '',
  standard_deadline TEXT DEFAULT '',
  max_deadline TEXT DEFAULT '',
  output_foreign_language TEXT DEFAULT '',
  output_fl_review_deadline TEXT DEFAULT '',

  accumulated_credits REAL DEFAULT 0,
  completed_courses_json TEXT DEFAULT '[]',
  study_status TEXT NOT NULL DEFAULT 'studying',

  dissertation_title TEXT DEFAULT '',
  topic_supervisor_decision_no TEXT DEFAULT '',
  topic_supervisor_decision_date TEXT DEFAULT '',

  progress_report_summary TEXT DEFAULT '',
  training_changes_json TEXT DEFAULT '[]',
  doctoral_seminars_json TEXT DEFAULT '[]',
  teaching_and_academic_activities TEXT DEFAULT '',
  thesis_progress_by_term TEXT DEFAULT '',

  seminar_decision_no TEXT DEFAULT '',
  seminar_date TEXT DEFAULT '',
  seminar_result TEXT DEFAULT '',
  title_change_decision_no TEXT DEFAULT '',
  adjusted_dissertation_title TEXT DEFAULT '',

  ir1_scientist_id INTEGER,
  ir1_info TEXT DEFAULT '',
  ir1_sent_date TEXT DEFAULT '',
  ir2_scientist_id INTEGER,
  ir2_info TEXT DEFAULT '',
  ir2_sent_date TEXT DEFAULT '',
  ir_due_date TEXT DEFAULT '',
  ir_declined_info TEXT DEFAULT '',
  ir3_scientist_id INTEGER,
  ir3_info TEXT DEFAULT '',
  ir3_sent_date TEXT DEFAULT '',
  ir_result TEXT DEFAULT '',
  ir_notes TEXT DEFAULT '',

  defense_council_decision_no TEXT DEFAULT '',
  defense_council_decision_date TEXT DEFAULT '',
  defense_date TEXT DEFAULT '',
  post_defense_resubmit_date TEXT DEFAULT '',
  dossier_completion_evidences TEXT DEFAULT '',
  final_dossier_submit_date TEXT DEFAULT '',
  appraisal_status TEXT DEFAULT '',
  appraisal_result TEXT DEFAULT '',

  diploma_serial_no TEXT DEFAULT '',
  diploma_registry_no TEXT DEFAULT '',
  degree_award_decision_no TEXT DEFAULT '',
  diploma_signed_date TEXT DEFAULT '',
  graduation_year INTEGER,
  diploma_received_date TEXT DEFAULT '',
  other_notes TEXT DEFAULT '',
  is_completed INTEGER NOT NULL DEFAULT 0,

  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (faculty_id) REFERENCES faculties(id),
  FOREIGN KEY (major_id) REFERENCES majors(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'phd_student',
  is_supervisor INTEGER NOT NULL DEFAULT 0,
  scientist_id INTEGER,
  phd_student_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (scientist_id) REFERENCES scientists(id),
  FOREIGN KEY (phd_student_id) REFERENCES phd_students(id)
);

CREATE TABLE IF NOT EXISTS phd_supervisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phd_student_id INTEGER NOT NULL,
  scientist_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  decision_no TEXT DEFAULT '',
  assigned_date TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (phd_student_id) REFERENCES phd_students(id) ON DELETE CASCADE,
  FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS phd_committee_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phd_student_id INTEGER NOT NULL,
  scientist_id INTEGER NOT NULL,
  committee_type TEXT NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'member',
  decision_no TEXT DEFAULT '',
  event_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (phd_student_id) REFERENCES phd_students(id) ON DELETE CASCADE,
  FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scientist_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scientist_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  pub_year INTEGER NOT NULL,
  pub_type TEXT NOT NULL DEFAULT 'wos_q2',
  author_role TEXT NOT NULL DEFAULT 'main',
  total_authors INTEGER DEFAULT 1,
  issn_isbn TEXT DEFAULT '',
  doi_url TEXT DEFAULT '',
  hdgsnn_max_point REAL,
  calculated_point REAL DEFAULT 0,
  evidence_url TEXT DEFAULT '',
  evidence_doc_id INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS phd_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phd_student_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  pub_year INTEGER NOT NULL,
  item_kind TEXT NOT NULL DEFAULT 'article',
  pub_type TEXT NOT NULL DEFAULT 'wos_q2',
  author_role TEXT NOT NULL DEFAULT 'first',
  total_authors INTEGER DEFAULT 1,
  issn_isbn TEXT DEFAULT '',
  doi_url TEXT DEFAULT '',
  hdgsnn_max_point REAL,
  calculated_point REAL DEFAULT 0,
  evidence_url TEXT DEFAULT '',
  evidence_doc_id INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (phd_student_id) REFERENCES phd_students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS phd_progress_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phd_student_id INTEGER NOT NULL,
  cycle_id INTEGER,
  academic_term TEXT NOT NULL,
  report_date TEXT NOT NULL,
  thesis_progress_percent INTEGER DEFAULT 0,
  summary TEXT NOT NULL,
  teaching_activities TEXT DEFAULT '',
  next_plan TEXT DEFAULT '',
  supervisor_comment TEXT DEFAULT '',
  supervisor_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_scientist_id INTEGER,
  reviewed_at TEXT,
  staff_note TEXT DEFAULT '',
  evidence_doc_id INTEGER,
  evidence_url TEXT DEFAULT '',
  submitted_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (phd_student_id) REFERENCES phd_students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  filename TEXT DEFAULT '',
  mime_type TEXT DEFAULT 'application/pdf',
  size_bytes INTEGER DEFAULT 0,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT DEFAULT '',
  drive_url TEXT DEFAULT '',
  is_confidential INTEGER NOT NULL DEFAULT 0,
  uploaded_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER,
  recipient_email TEXT NOT NULL,
  phd_student_id INTEGER,
  type TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'website_and_email',
  status TEXT NOT NULL DEFAULT 'queued',
  is_read INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_message_id TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  sent_at TEXT,
  dedupe_key TEXT,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS import_previews (
  id TEXT PRIMARY KEY,
  import_type TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_email TEXT DEFAULT '',
  actor_role TEXT DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  summary TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
`;

export const V2_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS regulation_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  effective_from TEXT DEFAULT '',
  config_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS cohorts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  regulation_version_id INTEGER,
  start_date TEXT DEFAULT '',
  standard_months_master INTEGER NOT NULL DEFAULT 36,
  max_months_master INTEGER NOT NULL DEFAULT 72,
  standard_months_bachelor INTEGER NOT NULL DEFAULT 48,
  max_months_bachelor INTEGER NOT NULL DEFAULT 84,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (regulation_version_id) REFERENCES regulation_versions(id)
);

CREATE TABLE IF NOT EXISTS reporting_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  open_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT DEFAULT '',
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type TEXT NOT NULL,
  phd_student_id INTEGER,
  scientist_id INTEGER,
  created_by_user_id INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  evidence_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted',
  supervisor_comment TEXT DEFAULT '',
  supervisor_approved_by INTEGER,
  supervisor_approved_at TEXT,
  admin_comment TEXT DEFAULT '',
  decision_no TEXT DEFAULT '',
  decision_date TEXT DEFAULT '',
  approved_by_user_id INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (phd_student_id) REFERENCES phd_students(id) ON DELETE CASCADE,
  FOREIGN KEY (scientist_id) REFERENCES scientists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fee_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year TEXT NOT NULL DEFAULT '2026',
  activity_type TEXT NOT NULL,
  role_code TEXT NOT NULL,
  label TEXT NOT NULL,
  unit_amount REAL NOT NULL DEFAULT 0,
  pit_tax_rate REAL NOT NULL DEFAULT 0.1,
  pit_threshold REAL NOT NULL DEFAULT 2000000,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  UNIQUE(fiscal_year, activity_type, role_code)
);

CREATE TABLE IF NOT EXISTS payment_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  period_from TEXT DEFAULT '',
  period_to TEXT DEFAULT '',
  hide_ir_phd_identity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  voucher_no TEXT DEFAULT '',
  total_gross REAL NOT NULL DEFAULT 0,
  total_tax REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  created_by_user_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS payment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  scientist_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  role_code TEXT DEFAULT '',
  phd_code TEXT DEFAULT '',
  phd_name TEXT DEFAULT '',
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_amount REAL NOT NULL DEFAULT 0,
  gross_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  tax_exempt_declared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  FOREIGN KEY (batch_id) REFERENCES payment_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (scientist_id) REFERENCES scientists(id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS secret_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_email TEXT DEFAULT '',
  resource_type TEXT NOT NULL,
  resource_id TEXT DEFAULT '',
  action TEXT NOT NULL,
  ip_address TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reason TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE INDEX IF NOT EXISTS idx_phd_students_faculty ON phd_students(faculty_id);
CREATE INDEX IF NOT EXISTS idx_phd_students_major ON phd_students(major_id);
CREATE INDEX IF NOT EXISTS idx_phd_students_status ON phd_students(study_status);
CREATE INDEX IF NOT EXISTS idx_phd_supervisions_phd ON phd_supervisions(phd_student_id);
CREATE INDEX IF NOT EXISTS idx_phd_supervisions_sci ON phd_supervisions(scientist_id);
CREATE INDEX IF NOT EXISTS idx_phd_committee_phd ON phd_committee_members(phd_student_id);
CREATE INDEX IF NOT EXISTS idx_phd_committee_sci ON phd_committee_members(scientist_id);
CREATE INDEX IF NOT EXISTS idx_sci_pubs_sci ON scientist_publications(scientist_id);
CREATE INDEX IF NOT EXISTS idx_phd_pubs_phd ON phd_publications(phd_student_id);
CREATE INDEX IF NOT EXISTS idx_docs_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notif_email ON notifications(recipient_email, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notif_dedupe ON notifications(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_requests_status ON change_requests(status, request_type);
CREATE INDEX IF NOT EXISTS idx_requests_phd ON change_requests(phd_student_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_batch ON payment_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_source ON payment_items(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_secret_access_created ON secret_access_logs(id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(id DESC);
`;

export const DEFAULT_UET_FACULTIES = [
  { code: 'FIT', name: 'Khoa Công nghệ Thông tin', short_name: 'CNTT' },
  { code: 'FET', name: 'Khoa Điện tử - Viễn thông', short_name: 'ĐTVT' },
  { code: 'FEMA', name: 'Khoa Cơ học kỹ thuật và Tự động hóa', short_name: 'CHKT & TĐH' },
  { code: 'FEPN', name: 'Khoa Vật lý kỹ thuật và Công nghệ nano', short_name: 'VLKT & CNNN' },
  { code: 'FCE', name: 'Khoa Công nghệ Xây dựng - Giao thông', short_name: 'CNXD - GT' },
  { code: 'FAT', name: 'Khoa Công nghệ Nông nghiệp', short_name: 'CNNN' },
  { code: 'IAI', name: 'Viện Trí tuệ Nhân tạo', short_name: 'Viện AI' },
  { code: 'SAE', name: 'Viện Công nghệ Hàng không Vũ trụ', short_name: 'Viện HKVT' },
];

export const DEFAULT_UET_MAJORS = [
  { code: '9480101', name: 'Khoa học máy tính', faculty_code: 'FIT' },
  { code: '9480102', name: 'Mạng máy tính và Truyền thông dữ liệu', faculty_code: 'FIT' },
  { code: '9480103', name: 'Kỹ thuật phần mềm', faculty_code: 'FIT' },
  { code: '9480104', name: 'Hệ thống thông tin', faculty_code: 'FIT' },
  { code: '9520203', name: 'Kỹ thuật điện tử', faculty_code: 'FET' },
  { code: '9520208', name: 'Kỹ thuật viễn thông', faculty_code: 'FET' },
  { code: '9520101', name: 'Cơ kỹ thuật', faculty_code: 'FEMA' },
  { code: '9510401', name: 'Vật liệu và linh kiện nano', faculty_code: 'FEPN' },
  { code: '9580201', name: 'Kỹ thuật xây dựng', faculty_code: 'FCE' },
];

export const DEFAULT_FEE_RATES = [
  { fiscal_year: '2026', activity_type: 'seminar', role_code: 'chair', label: 'HĐ Seminar — Chủ tịch', unit_amount: 600000 },
  { fiscal_year: '2026', activity_type: 'seminar', role_code: 'secretary', label: 'HĐ Seminar — Thư ký', unit_amount: 500000 },
  { fiscal_year: '2026', activity_type: 'seminar', role_code: 'reviewer_1', label: 'HĐ Seminar — Phản biện 1', unit_amount: 500000 },
  { fiscal_year: '2026', activity_type: 'seminar', role_code: 'reviewer_2', label: 'HĐ Seminar — Phản biện 2', unit_amount: 500000 },
  { fiscal_year: '2026', activity_type: 'seminar', role_code: 'member', label: 'HĐ Seminar — Ủy viên', unit_amount: 400000 },
  { fiscal_year: '2026', activity_type: 'independent_review', role_code: 'reviewer', label: 'Phản biện độc lập luận án tiến sĩ', unit_amount: 1500000 },
  { fiscal_year: '2026', activity_type: 'defense_council', role_code: 'chair', label: 'HĐ Đánh giá LATS — Chủ tịch', unit_amount: 1500000 },
  { fiscal_year: '2026', activity_type: 'defense_council', role_code: 'secretary', label: 'HĐ Đánh giá LATS — Thư ký', unit_amount: 1200000 },
  { fiscal_year: '2026', activity_type: 'defense_council', role_code: 'reviewer_1', label: 'HĐ Đánh giá LATS — Phản biện 1', unit_amount: 1500000 },
  { fiscal_year: '2026', activity_type: 'defense_council', role_code: 'reviewer_2', label: 'HĐ Đánh giá LATS — Phản biện 2', unit_amount: 1500000 },
  { fiscal_year: '2026', activity_type: 'defense_council', role_code: 'reviewer_3', label: 'HĐ Đánh giá LATS — Phản biện 3', unit_amount: 1500000 },
  { fiscal_year: '2026', activity_type: 'defense_council', role_code: 'member', label: 'HĐ Đánh giá LATS — Ủy viên', unit_amount: 1000000 },
  { fiscal_year: '2026', activity_type: 'supervision_hour', role_code: 'hour', label: 'Giờ chuẩn hướng dẫn NCS (tham chiếu)', unit_amount: 150000 },
];

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    code: 'deadline_standard',
    name: 'Nhắc hạn đào tạo chuẩn / tối đa',
    subject_template: '[UET PhDHub] Nhắc {{kind_label}}: {{full_name}} ({{phd_code}}) — {{days_label}}',
    body_template: 'Nghiên cứu sinh {{full_name}} (Mã NCS: {{phd_code}}) có mốc {{kind_label}} vào ngày {{deadline}} ({{days_label}}). Đề nghị rà soát tiến độ đào tạo, hoàn thiện thủ tục gia hạn hoặc chuẩn bị hồ sơ bảo vệ theo quy định.',
  },
  {
    code: 'deadline_fl',
    name: 'Nhắc hạn xét lại CĐR Ngoại ngữ',
    subject_template: '[UET PhDHub] Nhắc hạn xét lại CĐR Ngoại ngữ: {{full_name}} ({{phd_code}})',
    body_template: 'Nghiên cứu sinh {{full_name}} ({{phd_code}}) có thời hạn xét lại Chuẩn đầu ra Ngoại ngữ vào ngày {{deadline}} ({{days_label}}). Vui lòng cập nhật chứng chỉ ngoại ngữ đạt chuẩn trước thời hạn.',
  },
  {
    code: 'deadline_ir',
    name: 'Nhắc hạn Phản biện độc lập (Mật CTSV)',
    subject_template: '[MẬT - Phòng CTSV] Hạn nhận xét PBĐL: {{full_name}} ({{phd_code}})',
    body_template: '[Thông báo nội bộ Phòng CTSV] Hồ sơ NCS {{full_name}} ({{phd_code}}) có hạn nộp nhận xét Phản biện độc lập ngày {{deadline}} ({{days_label}}). Vui lòng đôn đốc phản biện độc lập.',
  },
  {
    code: 'progress_cycle',
    name: 'Nhắc nộp báo cáo tiến độ theo đợt',
    subject_template: '[UET PhDHub] Nhắc nộp {{cycle_title}} — Hạn {{due_date}}',
    body_template: 'Kính gửi {{full_name}}, hiện đang mở {{cycle_title}} (hạn chót {{due_date}}). Vui lòng truy cập hệ thống UET PhDHub để hoàn thiện báo cáo tiến độ đúng hạn.',
  },
  {
    code: 'request_status',
    name: 'Cập nhật trạng thái yêu cầu phê duyệt điện tử',
    subject_template: '[UET PhDHub] Cập nhật yêu cầu {{request_label}}: {{status_label}}',
    body_template: 'Yêu cầu {{request_label}} của {{full_name}} đã được cập nhật trạng thái: {{status_label}}. {{comment}}',
  },
];

async function ensureColumn(table: string, column: string, ddl: string) {
  const info = (await db.execute(`PRAGMA table_info(${table})`)).rows as Array<{ name: string }>;
  if (!info.some((c) => c.name === column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export async function initDb(overrideUrl?: string) {
  const { client, provider } = createDatabaseClient(overrideUrl);
  setDb(client, provider);
  await db.executeMultiple(V1_SCHEMA_SQL);
  await db.executeMultiple(V2_SCHEMA_SQL);

  // Safe idempotent column migrations for existing v1 SQLite & live Cloudflare D1 databases
  await ensureColumn('users', 'token_version', 'token_version INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('users', 'expires_at', 'expires_at TEXT');
  await ensureColumn('users', 'last_login_at', 'last_login_at TEXT');
  await ensureColumn('phd_students', 'cohort_id', 'cohort_id INTEGER');
  await ensureColumn('phd_students', 'regulation_version_id', 'regulation_version_id INTEGER');
  await ensureColumn('phd_progress_reports', 'cycle_id', 'cycle_id INTEGER');
  await ensureColumn('scientists', 'revision', 'revision INTEGER NOT NULL DEFAULT 1');

  // Seed default UET faculties and PhD majors if empty
  const facCount = Number((await db.execute('SELECT COUNT(*) as c FROM faculties')).rows[0]?.c || 0);
  if (facCount === 0) {
    for (const f of DEFAULT_UET_FACULTIES) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO faculties (code, name, short_name) VALUES (?, ?, ?)',
        args: [f.code, f.name, f.short_name],
      });
    }
  }

  const majorCount = Number((await db.execute('SELECT COUNT(*) as c FROM majors')).rows[0]?.c || 0);
  if (majorCount === 0) {
    const facs = (await db.execute('SELECT id, code FROM faculties')).rows as Array<{ id: number; code: string }>;
    const facMap = new Map(facs.map((f) => [f.code, Number(f.id)]));
    for (const m of DEFAULT_UET_MAJORS) {
      const fid = facMap.get(m.faculty_code);
      if (fid) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO majors (code, name, faculty_id) VALUES (?, ?, ?)',
          args: [m.code, m.name, fid],
        });
      }
    }
  }

  // Ensure default Quy chế 3638 settings & regulation_versions exist
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: ['regulation_3638_config', JSON.stringify(DEFAULT_REGULATION_3638_CONFIG)],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: [
      'system_banner_config',
      JSON.stringify({
        maintenanceMode: false,
        maintenanceMessage: 'Hệ thống đang bảo trì định kỳ. Vui lòng quay lại sau ít phút.',
        bannerText: '',
        bannerTone: 'info',
      }),
    ],
  });

  const regVerCount = Number((await db.execute('SELECT COUNT(*) as c FROM regulation_versions')).rows[0]?.c || 0);
  if (regVerCount === 0) {
    const existingCfg = (await db.execute("SELECT value FROM settings WHERE key = 'regulation_3638_config'")).rows[0] as any;
    await db.execute({
      sql: `INSERT OR IGNORE INTO regulation_versions (code, name, effective_from, config_json, is_default)
            VALUES (?, ?, ?, ?, 1)`,
      args: [
        '3638/QĐ-ĐHQGHN',
        'Quy chế đào tạo tiến sĩ tại ĐHQGHN (QĐ 3638)',
        '2021-11-18',
        existingCfg?.value || JSON.stringify(DEFAULT_REGULATION_3638_CONFIG),
      ],
    });
  }

  // Seed default cohorts if empty
  const cohortCount = Number((await db.execute('SELECT COUNT(*) as c FROM cohorts')).rows[0]?.c || 0);
  if (cohortCount === 0) {
    const defVer = (await db.execute('SELECT id FROM regulation_versions WHERE is_default = 1 LIMIT 1')).rows[0] as any;
    const defVerId = defVer?.id ? Number(defVer.id) : null;
    const defaultCohorts = [
      ['QH-2021-Đợt 1', 'Khóa 2021 Đợt 1', '2021-09-01'],
      ['QH-2022-Đợt 2', 'Khóa 2022 Đợt 2', '2022-11-15'],
      ['QH-2023-Đợt 1', 'Khóa 2023 Đợt 1', '2023-10-01'],
      ['QH-2023-Đợt 2', 'Khóa 2023 Đợt 2', '2023-12-15'],
      ['QH-2024-Đợt 1', 'Khóa 2024 Đợt 1', '2024-09-15'],
      ['QH-2025-Đợt 1', 'Khóa 2025 Đợt 1', '2025-09-10'],
      ['QH-2026-Đợt 1', 'Khóa 2026 Đợt 1', '2026-09-15'],
    ];
    for (const [code, name, startDate] of defaultCohorts) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO cohorts (code, name, regulation_version_id, start_date)
              VALUES (?, ?, ?, ?)`,
        args: [code, name, defVerId, startDate],
      });
    }
  }

  // Seed default fee rates if empty
  const feeCount = Number((await db.execute('SELECT COUNT(*) as c FROM fee_rates')).rows[0]?.c || 0);
  if (feeCount === 0) {
    for (const fr of DEFAULT_FEE_RATES) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO fee_rates (fiscal_year, activity_type, role_code, label, unit_amount, pit_tax_rate, pit_threshold, active)
              VALUES (?, ?, ?, ?, ?, 0.1, 2000000, 1)`,
        args: [fr.fiscal_year, fr.activity_type, fr.role_code, fr.label, fr.unit_amount],
      });
    }
  }

  // Seed default email templates if empty
  const tplCount = Number((await db.execute('SELECT COUNT(*) as c FROM email_templates')).rows[0]?.c || 0);
  if (tplCount === 0) {
    for (const t of DEFAULT_EMAIL_TEMPLATES) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO email_templates (code, name, subject_template, body_template, active)
              VALUES (?, ?, ?, ?, 1)`,
        args: [t.code, t.name, t.subject_template, t.body_template],
      });
    }
  }

  // Ensure default primary admin exists
  if (ADMIN_EMAIL) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO users (email, name, role, is_supervisor, active)
            VALUES (?, ?, 'admin', 0, 1)`,
      args: [ADMIN_EMAIL, 'Quản trị viên Phòng CTSV'],
    });
  }
}
