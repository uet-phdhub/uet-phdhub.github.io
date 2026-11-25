import crypto from 'crypto';
import * as XLSX from 'xlsx';
import {
  computeDeadlinesCountdown,
  formatTitleDisplay,
  STUDY_STATUS_LABELS,
  SUPERVISION_ROLE_LABELS,
} from '../../shared/regulation3638';
import type { AuthUser, Regulation3638Config, StudyStatus } from '../../shared/types';
import { db } from '../db';
import { recordAudit } from './audit';

function normHeader(h: unknown): string {
  return String(h || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(val).trim();
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const vnMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, '0')}-${vnMatch[1].padStart(2, '0')}`;
  }
  return s;
}

function parseStudyStatus(raw: string): StudyStatus {
  const s = normHeader(raw);
  if (s.includes('cấp bằng') || s === 'graduated') return 'graduated';
  if (s.includes('đã bảo vệ') || s === 'defended') return 'defended';
  if (s.includes('chờ bảo vệ') || s === 'ready_defense') return 'ready_defense';
  if (s.includes('gia hạn') || s === 'extended') return 'extended';
  if (s.includes('bảo lưu') || s.includes('tạm dừng') || s === 'deferred') return 'deferred';
  if (s.includes('thôi học') || s.includes('hết hạn') || s === 'withdrawn') return 'withdrawn';
  return 'studying';
}

const PHD_HEADER_ALIASES: Record<string, string[]> = {
  phd_code: ['mã ncs', 'ma ncs', 'phd_code', 'mã học viên', 'mã sv'],
  full_name: ['họ và tên', 'ho va ten', 'họ tên', 'full_name'],
  dob: ['ngày sinh', 'ngay sinh', 'dob'],
  email: ['email', 'email liên hệ', 'email vnu'],
  phone: ['điện thoại', 'sđt', 'số điện thoại', 'phone'],
  faculty_name: ['khoa', 'khoa/viện', 'đơn vị đào tạo'],
  major_name: ['ngành', 'chuyên ngành', 'ngành đào tạo'],
  cohort: ['khóa', 'khóa/đợt', 'đợt tuyển sinh', 'cohort'],
  work_unit: ['đơn vị công tác', 'cơ quan công tác', 'work_unit'],
  admission_category: ['đối tượng', 'doi tuong'],
  entrance_foreign_language: ['chuẩn đầu vào ngoại ngữ', 'cđv ngoại ngữ', 'ngoại ngữ đầu vào'],
  graduated_major_applied: ['ngành tốt nghiệp ths/đh', 'ngành tốt nghiệp', 'ngành tốt nghiệp ths/đh (đăng ký dự thi)'],
  supplementary_courses: ['học bổ sung'],
  degree_verification_status: ['xác minh văn bằng', 'xác minh văn bằng, cc'],
  enrollment_date: ['ngày nhập học'],
  admission_decision_no: ['qđ công nhận ncs', 'số qđ công nhận ncs'],
  training_start_date: ['thời điểm bắt đầu tính thời gian đào tạo', 'ngày bắt đầu đào tạo'],
  standard_deadline: ['ngày hết hạn đào tạo chuẩn', 'hạn đào tạo chuẩn'],
  max_deadline: ['ngày hết hạn đào tạo tối đa', 'hạn đào tạo tối đa'],
  output_foreign_language: ['chuẩn đầu ra ngoại ngữ', 'chuẩn đầu ta ngoại ngữ', 'cđr ngoại ngữ'],
  output_fl_review_deadline: ['thời hạn phải xét lại cđr nn', 'hạn xét lại cđr nn'],
  accumulated_credits: ['số tín chỉ tích lũy', 'tín chỉ tích lũy'],
  study_status: ['tình trạng học', 'trình trạng học', 'trạng thái'],
  dissertation_title: ['tên đề tài lats', 'tên đề tài', 'đề tài luận án'],
  topic_supervisor_decision_no: ['qđ giao đề tài và cbhd', 'số qđ giao đề tài'],
  teaching_and_academic_activities: ['công tác trợ giảng, sinh hoạt chuyên môn', 'công tác trợ giảng'],
  thesis_progress_by_term: ['tiến độ luận án update theo kỳ', 'tiến độ luận án'],
  seminar_decision_no: ['số qđ hđ seminar tổng thể/cấp cơ sở', 'số qđ seminar'],
  seminar_date: ['ngày seminar tổng thể/bv cấp cơ sở', 'ngày seminar'],
  seminar_result: ['kết quả đánh giá tổng thể/cấp cơ sở', 'kết quả seminar'],
  title_change_decision_no: ['số qđ điều chỉnh tên đề tài'],
  adjusted_dissertation_title: ['tên đề tài mới'],
  defense_council_decision_no: ['số qđ hội đồng đánh giá lats', 'số qđ hđ đánh giá lats'],
  defense_council_decision_date: ['ngày qđ thành lập hội đồng đánh giá lats'],
  defense_date: ['ngày bảo vệ'],
  post_defense_resubmit_date: ['ngày nộp lại theo quyết nghị hội đồng'],
  final_dossier_submit_date: ['ngày nộp hồ sơ cuối cùng'],
  appraisal_status: ['thẩm định'],
  appraisal_result: ['kết quả thẩm định'],
  diploma_serial_no: ['số hiệu bằng'],
  diploma_registry_no: ['số vào sổ'],
  degree_award_decision_no: ['số qđ công nhận học vị và cấp bằng'],
  diploma_signed_date: ['ngày ký cấp bằng'],
  graduation_year: ['năm tốt nghiệp'],
  diploma_received_date: ['ngày nhận bằng', 'ngày nhận bằng (ncs nhận bằng)'],
  other_notes: ['ghi chú khác', 'ghi chú'],
};

const SCIENTIST_HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['họ và tên', 'họ tên', 'full_name'],
  academic_rank: ['học hàm', 'chức danh'],
  academic_degree: ['học vị', 'trình độ'],
  title_combined: ['học hàm/học vị', 'học hàm / học vị'],
  recognition_year: ['năm công nhận học hàm/học vị', 'năm công nhận'],
  specialization: ['chuyên ngành/ lĩnh vực chuyên môn', 'chuyên ngành', 'lĩnh vực chuyên môn'],
  work_unit: ['đơn vị công tác hiện tại', 'đơn vị công tác', 'cơ quan'],
  email: ['email'],
  phone: ['điện thoại', 'sđt', 'số điện thoại'],
  bank_account: ['số tài khoản', 'stk'],
  bank_name: ['tại ngân hàng', 'ngân hàng'],
  cccd: ['số cccd', 'cccd', 'cmnd/cccd'],
  tax_code: ['mã số thuế tncn', 'mã số thuế', 'mst'],
  roles_text: ['vai trò', 'nhóm danh sách', 'loại cán bộ'],
};

function mapHeaderColumns(headerRow: unknown[], aliasMap: Record<string, string[]>): Map<number, string> {
  const result = new Map<number, string>();
  headerRow.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (!h) return;
    for (const [field, aliases] of Object.entries(aliasMap)) {
      if (aliases.some((a) => h === a || h.startsWith(a + ' (') || (a.length >= 6 && h.includes(a)))) {
        if (!Array.from(result.values()).includes(field)) {
          result.set(idx, field);
        }
        break;
      }
    }
  });
  return result;
}

export function buildPhdTemplateWorkbook(): Buffer {
  const headers = [
    'Mã NCS', 'Họ và tên', 'Ngày sinh', 'Email', 'Điện thoại', 'Khoa/Viện', 'Ngành đào tạo', 'Khóa/Đợt',
    'Đơn vị công tác', 'Đối tượng', 'Chuẩn đầu vào ngoại ngữ', 'Ngành tốt nghiệp ThS/ĐH', 'Học bổ sung',
    'Xác minh văn bằng, CC', 'Ngày nhập học', 'QĐ Công nhận NCS', 'Thời điểm bắt đầu tính thời gian đào tạo',
    'Ngày hết hạn đào tạo chuẩn', 'Ngày hết hạn đào tạo tối đa', 'Chuẩn đầu ra ngoại ngữ', 'Thời hạn phải xét lại CĐR NN',
    'Số tín chỉ tích lũy', 'Tình trạng học', 'Tên đề tài LATS', 'QĐ giao đề tài và CBHD',
    'Công tác trợ giảng, sinh hoạt chuyên môn', 'Tiến độ luận án update theo kỳ', 'Ghi chú khác',
  ];
  const sample = [
    'NCS202501', 'Nguyễn Văn Mẫu', '1996-05-12', 'ncs202501@vnu.edu.vn', '0912345678',
    'Khoa Công nghệ Thông tin', 'Khoa học máy tính', 'QH-2025-Đợt 1',
    'Trường ĐH Công nghệ - ĐHQGHN', 'Từ Thạc sĩ (Đề án học bổng)', 'IELTS 6.5', 'Khoa học máy tính (ThS)', 'Không',
    'Đã xác minh', '2025-09-01', '1234/QĐ-ĐHCN', '2025-09-01',
    '2028-09-01', '2030-09-01', 'IELTS 6.5 (đạt)', '2027-09-01',
    '12', 'Đang học', 'Nghiên cứu mô hình ngôn ngữ lớn tin cậy cho tiếng Việt', '1450/QĐ-ĐHCN',
    'Trợ giảng môn Trí tuệ nhân tạo HK1 2025-2026', 'Đang hoàn thiện Tổng quan nghiên cứu (35%)', '',
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach_NCS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildScientistTemplateWorkbook(): Buffer {
  const headers = [
    'Họ và Tên', 'Học hàm/Học vị', 'Năm công nhận học hàm/học vị', 'Chuyên ngành/ Lĩnh vực chuyên môn',
    'Đơn vị công tác hiện tại', 'Email', 'Điện thoại', 'Số tài khoản', 'Tại ngân hàng',
    'Số CCCD', 'Mã số thuế TNCN', 'Vai trò',
  ];
  const sample = [
    'Nguyễn Minh Khoa', 'PGS.TS', '2021', 'Khoa học máy tính / Trí tuệ nhân tạo',
    'Khoa Công nghệ Thông tin, Trường ĐH Công nghệ - ĐHQGHN', 'khoanm@vnu.edu.vn', '0988112233',
    '19034567890011', 'Techcombank - CN Cầu Giấy', '001082012345', '8023456789', 'CBHD, Seminar, PBĐL, Hội đồng',
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach_CanBo');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function previewPhdImport(buffer: Buffer, filename: string, userId: number) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel không có sheet dữ liệu.');
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
  if (rawRows.length < 2) throw new Error('File Excel không có dòng dữ liệu nào.');

  const colMap = mapHeaderColumns(rawRows[0], PHD_HEADER_ALIASES);
  if (!Array.from(colMap.values()).includes('phd_code') && !Array.from(colMap.values()).includes('full_name')) {
    throw new Error('Không tìm thấy cột "Mã NCS" hoặc "Họ và tên". Vui lòng dùng file mẫu chuẩn của hệ thống.');
  }

  const faculties = (await db.execute('SELECT id, code, name, short_name FROM faculties')).rows as any[];
  const majors = (await db.execute('SELECT id, code, name, faculty_id FROM majors')).rows as any[];
  const existingPhds = (await db.execute('SELECT id, phd_code, email, full_name FROM phd_students')).rows as any[];
  const byCode = new Map(existingPhds.map((p) => [String(p.phd_code).toLowerCase(), p]));
  const byEmail = new Map(existingPhds.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]));

  const rows: any[] = [];
  let createCount = 0;
  let updateCount = 0;
  let errorCount = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (!raw || raw.every((c) => String(c || '').trim() === '')) continue;

    const record: Record<string, any> = {};
    colMap.forEach((field, idx) => {
      const val = raw[idx];
      if (field.endsWith('_date') || field.endsWith('_deadline') || field === 'dob') {
        record[field] = parseExcelDate(val);
      } else {
        record[field] = String(val ?? '').trim();
      }
    });

    const errors: string[] = [];
    if (!record.phd_code) errors.push('Thiếu Mã NCS');
    if (!record.full_name) errors.push('Thiếu Họ và tên');

    if (record.faculty_name) {
      const fn = normHeader(record.faculty_name);
      const foundFac = faculties.find(
        (f) => normHeader(f.name) === fn || normHeader(f.code) === fn || normHeader(f.short_name) === fn || normHeader(f.name).includes(fn)
      );
      if (foundFac) record.faculty_id = Number(foundFac.id);
    }
    if (record.major_name) {
      const mn = normHeader(record.major_name);
      const foundMaj = majors.find((m) => normHeader(m.name) === mn || normHeader(m.code) === mn || normHeader(m.name).includes(mn));
      if (foundMaj) {
        record.major_id = Number(foundMaj.id);
        if (!record.faculty_id) record.faculty_id = Number(foundMaj.faculty_id);
      }
    }
    if (record.study_status) {
      record.study_status = parseStudyStatus(record.study_status);
    } else {
      record.study_status = 'studying';
    }
    if (record.accumulated_credits) {
      const cr = Number(String(record.accumulated_credits).replace(',', '.'));
      record.accumulated_credits = Number.isFinite(cr) ? cr : 0;
    }
    if (record.email) record.email = record.email.toLowerCase();

    const matched =
      (record.phd_code && byCode.get(record.phd_code.toLowerCase())) ||
      (record.email && byEmail.get(record.email.toLowerCase())) ||
      null;

    const action = errors.length > 0 ? 'error' : matched ? 'update' : 'create';
    if (action === 'error') errorCount++;
    else if (action === 'update') updateCount++;
    else createCount++;

    rows.push({
      rowNumber: i + 1,
      action,
      existingId: matched ? Number(matched.id) : null,
      errors,
      data: record,
    });
  }

  const previewId = crypto.randomUUID();
  const summary = { total: rows.length, create: createCount, update: updateCount, error: errorCount, sheetName };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO import_previews (id, import_type, created_by_user_id, filename, summary_json, rows_json, status, expires_at)
          VALUES (?, 'phd_students', ?, ?, ?, ?, 'preview', ?)`,
    args: [previewId, userId, filename, JSON.stringify(summary), JSON.stringify(rows), expiresAt],
  });

  return { previewId, filename, summary, rows };
}

export async function commitPhdImport(previewId: string, actor: AuthUser) {
  const row = (
    await db.execute({ sql: "SELECT * FROM import_previews WHERE id = ? AND import_type = 'phd_students'", args: [previewId] })
  ).rows[0] as any;
  if (!row) throw new Error('Không tìm thấy bản xem trước import.');
  if (row.status === 'committed') {
    return { alreadyCommitted: true, summary: JSON.parse(row.summary_json) };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('Bản xem trước đã hết hạn (quá 30 phút). Vui lòng tải lại file Excel.');
  }

  const items = JSON.parse(row.rows_json) as any[];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const editableFields = [
    'full_name', 'dob', 'email', 'phone', 'faculty_id', 'major_id', 'cohort',
    'work_unit', 'admission_category', 'entrance_foreign_language', 'graduated_major_applied',
    'supplementary_courses', 'degree_verification_status', 'enrollment_date', 'admission_decision_no',
    'training_start_date', 'standard_deadline', 'max_deadline', 'output_foreign_language',
    'output_fl_review_deadline', 'accumulated_credits', 'study_status', 'dissertation_title',
    'topic_supervisor_decision_no', 'teaching_and_academic_activities', 'thesis_progress_by_term',
    'seminar_decision_no', 'seminar_date', 'seminar_result', 'title_change_decision_no',
    'adjusted_dissertation_title', 'defense_council_decision_no', 'defense_council_decision_date',
    'defense_date', 'post_defense_resubmit_date', 'final_dossier_submit_date', 'appraisal_status',
    'appraisal_result', 'diploma_serial_no', 'diploma_registry_no', 'degree_award_decision_no',
    'diploma_signed_date', 'graduation_year', 'diploma_received_date', 'other_notes',
  ];

  for (const item of items) {
    if (item.action === 'error') {
      skipped++;
      continue;
    }
    const d = item.data;
    if (item.action === 'update' && item.existingId) {
      const sets: string[] = [];
      const args: any[] = [];
      for (const f of editableFields) {
        if (d[f] !== undefined && d[f] !== '') {
          sets.push(`${f} = ?`);
          args.push(d[f]);
        }
      }
      if (sets.length > 0) {
        sets.push("updated_at = datetime('now', '+7 hours')");
        sets.push('revision = revision + 1');
        args.push(item.existingId);
        await db.execute({ sql: `UPDATE phd_students SET ${sets.join(', ')} WHERE id = ?`, args });
        updated++;
      } else {
        skipped++;
      }
    } else {
      const cols = ['phd_code'];
      const vals: any[] = [d.phd_code];
      for (const f of editableFields) {
        if (d[f] !== undefined && d[f] !== '') {
          cols.push(f);
          vals.push(d[f]);
        }
      }
      await db.execute({
        sql: `INSERT INTO phd_students (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        args: vals,
      });
      created++;
    }
  }

  await db.execute({ sql: "UPDATE import_previews SET status = 'committed' WHERE id = ?", args: [previewId] });
  await recordAudit(actor, 'import_commit', 'phd_students', previewId, `Import Excel NCS (${row.filename}): tạo mới ${created}, cập nhật ${updated}, bỏ qua ${skipped}`);
  return { created, updated, skipped };
}

function splitRankAndDegree(combined: string, rankRaw: string, degreeRaw: string) {
  let rank = String(rankRaw || '').trim();
  let degree = String(degreeRaw || '').trim();
  const c = String(combined || '').toUpperCase();
  if (!rank) {
    if (c.includes('PGS')) rank = 'PGS';
    else if (c.includes('GS')) rank = 'GS';
  }
  if (!degree) {
    if (c.includes('TSKH')) degree = 'TSKH';
    else if (c.includes('TS') || c.includes('TIẾN SĨ')) degree = 'TS';
    else if (c.includes('THS')) degree = 'ThS';
  }
  return { rank, degree, titleDisplay: formatTitleDisplay(rank, degree) };
}

export async function previewScientistImport(buffer: Buffer, filename: string, userId: number) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel không có sheet dữ liệu.');
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
  if (rawRows.length < 2) throw new Error('File Excel không có dòng dữ liệu nào.');

  const colMap = mapHeaderColumns(rawRows[0], SCIENTIST_HEADER_ALIASES);
  if (!Array.from(colMap.values()).includes('full_name')) {
    throw new Error('Không tìm thấy cột "Họ và Tên". Vui lòng dùng file mẫu chuẩn của hệ thống.');
  }

  const existing = (await db.execute('SELECT id, email, full_name FROM scientists')).rows as any[];
  const byEmail = new Map(existing.filter((s) => s.email).map((s) => [String(s.email).toLowerCase(), s]));
  const byName = new Map(existing.map((s) => [normHeader(s.full_name), s]));

  const rows: any[] = [];
  let createCount = 0;
  let updateCount = 0;
  let errorCount = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (!raw || raw.every((c) => String(c || '').trim() === '')) continue;

    const rec: Record<string, any> = {};
    colMap.forEach((field, idx) => {
      rec[field] = String(raw[idx] ?? '').trim();
    });

    const errors: string[] = [];
    if (!rec.full_name) errors.push('Thiếu Họ và tên');

    const { rank, degree, titleDisplay } = splitRankAndDegree(rec.title_combined, rec.academic_rank, rec.academic_degree);
    rec.academic_rank = rank;
    rec.academic_degree = degree;
    rec.title_display = titleDisplay;
    rec.recognition_year = rec.recognition_year ? Number(rec.recognition_year) || null : null;
    if (rec.email) rec.email = rec.email.toLowerCase();

    const rt = normHeader(rec.roles_text || 'cbhd');
    rec.is_supervisor = rt.includes('cbhd') || rt.includes('hướng dẫn') || !rec.roles_text ? 1 : 0;
    rec.is_seminar_member = rt.includes('seminar') || rt.includes('tổng thể') ? 1 : 0;
    rec.is_independent_reviewer = rt.includes('pbđl') || rt.includes('phản biện') ? 1 : 0;
    rec.is_defense_council_member = rt.includes('hội đồng') || rt.includes('hđ') ? 1 : 0;
    rec.is_internal = rec.email?.endsWith('@vnu.edu.vn') || normHeader(rec.work_unit).includes('công nghệ') ? 1 : 0;

    const matched =
      (rec.email && byEmail.get(rec.email)) ||
      (rec.full_name && byName.get(normHeader(rec.full_name))) ||
      null;

    const action = errors.length > 0 ? 'error' : matched ? 'update' : 'create';
    if (action === 'error') errorCount++;
    else if (action === 'update') updateCount++;
    else createCount++;

    rows.push({
      rowNumber: i + 1,
      action,
      existingId: matched ? Number(matched.id) : null,
      errors,
      data: rec,
    });
  }

  const previewId = crypto.randomUUID();
  const summary = { total: rows.length, create: createCount, update: updateCount, error: errorCount, sheetName };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO import_previews (id, import_type, created_by_user_id, filename, summary_json, rows_json, status, expires_at)
          VALUES (?, 'scientists', ?, ?, ?, ?, 'preview', ?)`,
    args: [previewId, userId, filename, JSON.stringify(summary), JSON.stringify(rows), expiresAt],
  });

  return { previewId, filename, summary, rows };
}

export async function commitScientistImport(previewId: string, actor: AuthUser) {
  const row = (
    await db.execute({ sql: "SELECT * FROM import_previews WHERE id = ? AND import_type = 'scientists'", args: [previewId] })
  ).rows[0] as any;
  if (!row) throw new Error('Không tìm thấy bản xem trước import Cán bộ.');
  if (row.status === 'committed') {
    return { alreadyCommitted: true, summary: JSON.parse(row.summary_json) };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('Bản xem trước đã hết hạn. Vui lòng tải lại file Excel.');
  }

  const items = JSON.parse(row.rows_json) as any[];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const fields = [
    'full_name', 'academic_rank', 'academic_degree', 'title_display', 'recognition_year',
    'specialization', 'work_unit', 'is_internal', 'email', 'phone', 'bank_account', 'bank_name',
    'cccd', 'tax_code', 'is_supervisor', 'is_seminar_member', 'is_independent_reviewer', 'is_defense_council_member',
  ];

  for (const item of items) {
    if (item.action === 'error') {
      skipped++;
      continue;
    }
    const d = item.data;
    if (item.action === 'update' && item.existingId) {
      const sets: string[] = [];
      const args: any[] = [];
      for (const f of fields) {
        if (d[f] !== undefined && d[f] !== '' && d[f] !== null) {
          sets.push(`${f} = ?`);
          args.push(d[f]);
        }
      }
      sets.push("updated_at = datetime('now', '+7 hours')");
      args.push(item.existingId);
      await db.execute({ sql: `UPDATE scientists SET ${sets.join(', ')} WHERE id = ?`, args });
      updated++;
    } else {
      const cols: string[] = [];
      const vals: any[] = [];
      for (const f of fields) {
        if (d[f] !== undefined && d[f] !== '') {
          cols.push(f);
          vals.push(d[f]);
        }
      }
      await db.execute({
        sql: `INSERT INTO scientists (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        args: vals,
      });
      created++;
    }
  }

  await db.execute({ sql: "UPDATE import_previews SET status = 'committed' WHERE id = ?", args: [previewId] });
  await recordAudit(actor, 'import_commit', 'scientists', previewId, `Import Excel Cán bộ (${row.filename}): tạo mới ${created}, cập nhật ${updated}, bỏ qua ${skipped}`);
  return { created, updated, skipped };
}

export function exportPhdListWorkbook(phds: any[], config: Regulation3638Config, includeConfidential: boolean): Buffer {
  const rows = phds.map((p, index) => {
    const dl = computeDeadlinesCountdown(p, config, includeConfidential);
    const supByRole = (role: string) =>
      (p.supervisions || [])
        .filter((s: any) => s.role === role)
        .map((s: any) => `${s.title_display || ''} ${s.full_name}`.trim())
        .join('; ');
    const allSups = (p.supervisions || [])
      .map((s: any) => `${s.title_display || ''} ${s.full_name} (${SUPERVISION_ROLE_LABELS[s.role as keyof typeof SUPERVISION_ROLE_LABELS] || s.role})`.trim())
      .join('; ');

    const base: Record<string, any> = {
      'STT': index + 1,
      'Mã NCS': p.phd_code,
      'Họ và tên': p.full_name,
      'Ngày sinh': p.dob || '',
      'Email': p.email || '',
      'Điện thoại': p.phone || '',
      'Khoa/Viện': p.faculty_name || '',
      'Ngành đào tạo': p.major_name || '',
      'Khóa/Đợt': p.cohort || '',
      'Đơn vị công tác': p.work_unit || '',
      'Đối tượng': p.admission_category || '',
      'Chuẩn đầu vào ngoại ngữ': p.entrance_foreign_language || '',
      'Ngành tốt nghiệp ThS/ĐH': p.graduated_major_applied || '',
      'Học bổ sung': p.supplementary_courses || '',
      'Xác minh văn bằng, CC': p.degree_verification_status || '',
      'Ngày nhập học': p.enrollment_date || '',
      'QĐ Công nhận NCS': p.admission_decision_no || '',
      'Thời điểm bắt đầu tính TGĐT': p.training_start_date || '',
      'Ngày hết hạn ĐT chuẩn': p.standard_deadline || '',
      'Ngày hết hạn ĐT tối đa': p.max_deadline || '',
      'Đếm lùi hạn chuẩn': dl.standard.label,
      'Đếm lùi hạn tối đa': dl.max.label,
      'Chuẩn đầu ra ngoại ngữ': p.output_foreign_language || '',
      'Thời hạn xét lại CĐR NN': p.output_fl_review_deadline || '',
      'Số tín chỉ tích lũy': p.accumulated_credits ?? 0,
      'Tình trạng học': STUDY_STATUS_LABELS[p.study_status as StudyStatus] || p.study_status,
      'Tên đề tài LATS': p.dissertation_title || '',
      'Cán bộ hướng dẫn (Tổng)': allSups,
      'CBHD độc lập': supByRole('independent'),
      'CB hướng dẫn chính': supByRole('primary'),
      'CB hướng dẫn phụ': supByRole('secondary'),
      'CB đồng hướng dẫn': supByRole('co'),
      'QĐ giao đề tài và CBHD': p.topic_supervisor_decision_no || '',
      'Báo cáo tiến độ': p.progress_report_summary || '',
      'Công tác trợ giảng, SHCM': p.teaching_and_academic_activities || '',
      'Số công bố / Điểm 3638': `${p.publicationEvaluation?.totalCount ?? 0} CT (${p.publicationEvaluation?.totalPoints ?? 0}đ)`,
      'Mức độ đạt yêu cầu công bố': p.publicationEvaluation?.label || '',
      'Tiến độ luận án theo kỳ': p.thesis_progress_by_term || '',
      'Số QĐ HĐ Seminar tổng thể': p.seminar_decision_no || '',
      'Ngày Seminar tổng thể': p.seminar_date || '',
      'Kết quả đánh giá tổng thể': p.seminar_result || '',
      'Số QĐ điều chỉnh tên đề tài': p.title_change_decision_no || '',
      'Tên đề tài mới': p.adjusted_dissertation_title || '',
    };

    if (includeConfidential) {
      Object.assign(base, {
        'PBĐL 1': p.ir1_info || '',
        'Ngày gửi PBĐL 1': p.ir1_sent_date || '',
        'PBĐL 2': p.ir2_info || '',
        'Ngày gửi PBĐL 2': p.ir2_sent_date || '',
        'Hạn nộp nhận xét PBĐL': p.ir_due_date || '',
        'PBĐL từ chối': p.ir_declined_info || '',
        'PBĐL 3': p.ir3_info || '',
        'Ngày gửi PBĐL 3': p.ir3_sent_date || '',
        'Kết quả phản biện ĐL': p.ir_result || '',
      });
    }

    Object.assign(base, {
      'Số QĐ HĐ đánh giá LATS': p.defense_council_decision_no || '',
      'Ngày QĐ thành lập HĐ': p.defense_council_decision_date || '',
      'Ngày bảo vệ': p.defense_date || '',
      'Ngày nộp lại theo QN HĐ': p.post_defense_resubmit_date || '',
      'Minh chứng hoàn thiện hồ sơ': p.dossier_completion_evidences || '',
      'Ngày nộp hồ sơ cuối cùng': p.final_dossier_submit_date || '',
      'Thẩm định': p.appraisal_status || '',
      'Kết quả thẩm định': p.appraisal_result || '',
      'Số hiệu bằng': p.diploma_serial_no || '',
      'Số vào sổ': p.diploma_registry_no || '',
      'Số QĐ công nhận học vị & cấp bằng': p.degree_award_decision_no || '',
      'Ngày ký cấp bằng': p.diploma_signed_date || '',
      'Năm tốt nghiệp': p.graduation_year || '',
      'Ngày nhận bằng': p.diploma_received_date || '',
      'Ghi chú khác': p.other_notes || '',
      'Kết thúc': p.is_completed ? 'Đã kết thúc' : 'Đang quản lý',
    });

    return base;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Thông báo': 'Không có dữ liệu NCS' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach_NCS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function exportSupervisorQuotaWorkbook(scientists: any[]): Buffer {
  const rows = scientists.map((s, idx) => ({
    'STT': idx + 1,
    'Họ và Tên': s.full_name,
    'Học hàm/Học vị': s.title_display || formatTitleDisplay(s.academic_rank, s.academic_degree),
    'Năm công nhận': s.recognition_year || '',
    'Chuyên ngành': s.specialization || '',
    'Đơn vị công tác': s.work_unit || '',
    'Email': s.email || '',
    'NCS Độc lập (1.0)': s.quotaEvaluation?.countsByRole?.independent ?? 0,
    'NCS Chính (0.5)': s.quotaEvaluation?.countsByRole?.primary ?? 0,
    'NCS Phụ (0.3)': s.quotaEvaluation?.countsByRole?.secondary ?? 0,
    'NCS Đồng HD (0.5)': s.quotaEvaluation?.countsByRole?.co ?? 0,
    'Tổng quy đổi Quota': s.quotaEvaluation?.equivalentLoad ?? 0,
    'Định mức chuẩn': s.quotaEvaluation?.baseQuota ?? 0,
    'Định mức hiệu lực': s.quotaEvaluation?.effectiveQuota ?? 0,
    'Trạng thái Quota': s.quotaEvaluation?.status === 'over_limit' ? 'Vượt định mức' : s.quotaEvaluation?.status === 'near_limit' ? 'Cận định mức' : 'Hợp lệ',
    'Tổng giờ chuẩn HD': s.quotaEvaluation?.standardHours ?? 0,
    'Điểm 3638 (5 năm)': s.researchEvaluation?.totalPoints ?? 0,
    'Đạt chuẩn CBHD 3638': s.researchEvaluation?.meetsSupervisor ? 'Đạt' : 'Chưa đạt',
    'Đủ điều kiện trình tăng định mức': s.quotaEvaluation?.eligibleForSpecialRequest ? 'Có' : 'Không',
    'Đã duyệt tăng định mức': s.special_quota_approved ? `Có (${s.special_quota_limit || ''} - ${s.special_quota_decision || ''})` : 'Không',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Thông báo': 'Chưa có dữ liệu CBHD' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Quota_GioHuongDan');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function exportScientistPaymentWorkbook(scientists: any[], sheetTitle = 'DanhSach_CanBo'): Buffer {
  const rows = scientists.map((s, idx) => ({
    'STT': idx + 1,
    'Họ và Tên': s.full_name,
    'Học hàm/Học vị': s.title_display || formatTitleDisplay(s.academic_rank, s.academic_degree),
    'Năm công nhận': s.recognition_year || '',
    'Chuyên ngành': s.specialization || '',
    'Đơn vị công tác hiện tại': s.work_unit || '',
    'Email': s.email || '',
    'Điện thoại': s.phone || '',
    'Số tài khoản': s.bank_account || '',
    'Tại ngân hàng': s.bank_name || '',
    'Số CCCD': s.cccd || '',
    'Mã số thuế TNCN': s.tax_code || '',
    'Điểm công bố 3638 (5 năm)': s.researchEvaluation?.totalPoints ?? 0,
    'Số công bố (5 năm)': s.researchEvaluation?.pubCountInWindow ?? 0,
    'Vai trò CBHD': s.is_supervisor ? 'Có' : '',
    'Vai trò Seminar': s.is_seminar_member ? 'Có' : '',
    'Vai trò PBĐL': s.is_independent_reviewer ? 'Có' : '',
    'Vai trò HĐ Đánh giá': s.is_defense_council_member ? 'Có' : '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Thông báo': 'Chưa có dữ liệu Cán bộ' }]);
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
