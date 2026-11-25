import { DEFAULT_REGULATION_3638_CONFIG } from '../../shared/regulation3638';
import { ADMIN_EMAIL } from '../config';
import { createDatabaseClient, db, setDb } from '../db';

const SCHEMA_SQL = `
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

  -- Tuyển sinh & Văn bằng
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

  -- Thời hạn đào tạo & CĐR Ngoại ngữ
  training_start_date TEXT DEFAULT '',
  standard_deadline TEXT DEFAULT '',
  max_deadline TEXT DEFAULT '',
  output_foreign_language TEXT DEFAULT '',
  output_fl_review_deadline TEXT DEFAULT '',

  -- Học phần & Trạng thái
  accumulated_credits REAL DEFAULT 0,
  completed_courses_json TEXT DEFAULT '[]',
  study_status TEXT NOT NULL DEFAULT 'studying',

  -- Đề tài & CBHD
  dissertation_title TEXT DEFAULT '',
  topic_supervisor_decision_no TEXT DEFAULT '',
  topic_supervisor_decision_date TEXT DEFAULT '',

  -- Quá trình đào tạo & Nghiên cứu
  progress_report_summary TEXT DEFAULT '',
  training_changes_json TEXT DEFAULT '[]',
  doctoral_seminars_json TEXT DEFAULT '[]',
  teaching_and_academic_activities TEXT DEFAULT '',
  thesis_progress_by_term TEXT DEFAULT '',

  -- Đánh giá tổng thể / Seminar cấp cơ sở & Điều chỉnh tên đề tài
  seminar_decision_no TEXT DEFAULT '',
  seminar_date TEXT DEFAULT '',
  seminar_result TEXT DEFAULT '',
  title_change_decision_no TEXT DEFAULT '',
  adjusted_dissertation_title TEXT DEFAULT '',

  -- Phản biện độc lập (BẢO MẬT - chỉ admin & staff)
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

  -- Hội đồng đánh giá LATS & Thẩm định
  defense_council_decision_no TEXT DEFAULT '',
  defense_council_decision_date TEXT DEFAULT '',
  defense_date TEXT DEFAULT '',
  post_defense_resubmit_date TEXT DEFAULT '',
  dossier_completion_evidences TEXT DEFAULT '',
  final_dossier_submit_date TEXT DEFAULT '',
  appraisal_status TEXT DEFAULT '',
  appraisal_result TEXT DEFAULT '',

  -- Cấp bằng & Kết thúc
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

export async function initDb(overrideUrl?: string) {
  const { client, provider } = createDatabaseClient(overrideUrl);
  setDb(client, provider);
  await db.executeMultiple(SCHEMA_SQL);

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

  // Ensure default Quy chế 3638 settings exist
  await db.execute({
    sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    args: ['regulation_3638_config', JSON.stringify(DEFAULT_REGULATION_3638_CONFIG)],
  });

  // Ensure default primary admin exists
  if (ADMIN_EMAIL) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO users (email, name, role, is_supervisor, active)
            VALUES (?, ?, 'admin', 0, 1)`,
      args: [ADMIN_EMAIL, 'Quản trị viên Phòng CTSV'],
    });
  }
}
