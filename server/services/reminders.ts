import { computeDeadlinesCountdown, getVietnamTodayIso } from '../../shared/regulation3638';
import { db } from '../db';
import { createNotification } from './email';
import { getRegulationConfig } from './settings';

export async function scanAndQueueDeadlineReminders(actorUserId?: number | null) {
  const config = await getRegulationConfig();
  const todayIso = getVietnamTodayIso();
  const monthBucket = todayIso.slice(0, 7);

  const phds = (
    await db.execute(`
      SELECT p.id, p.phd_code, p.full_name, p.email, p.standard_deadline, p.max_deadline,
             p.output_fl_review_deadline, p.ir_due_date, p.ir_result, p.study_status, p.is_completed
      FROM phd_students p
      WHERE p.is_completed = 0
        AND p.study_status NOT IN ('graduated', 'defended', 'withdrawn')
    `)
  ).rows as any[];

  const staffRows = (
    await db.execute(`SELECT id, email FROM users WHERE role IN ('admin', 'staff') AND active = 1`)
  ).rows as Array<{ id: number; email: string }>;

  const supRows = (
    await db.execute(`
      SELECT ps.phd_student_id, s.email, s.full_name
      FROM phd_supervisions ps
      JOIN scientists s ON s.id = ps.scientist_id
      WHERE ps.is_active = 1 AND s.email IS NOT NULL AND s.email != ''
    `)
  ).rows as Array<{ phd_student_id: number; email: string; full_name: string }>;

  const supByPhd = new Map<number, Array<{ email: string; full_name: string }>>();
  for (const r of supRows) {
    const pid = Number(r.phd_student_id);
    if (!supByPhd.has(pid)) supByPhd.set(pid, []);
    supByPhd.get(pid)!.push({ email: r.email, full_name: r.full_name });
  }

  let createdCount = 0;
  const details: Array<{ phdCode: string; kind: string; level: string }> = [];

  for (const phd of phds) {
    const dl = computeDeadlinesCountdown(phd, config, true);
    const pid = Number(phd.id);
    const supervisors = supByPhd.get(pid) || [];

    // 1. Standard & Max Training Deadlines -> notify NCS + CBHD + CTSV Staff
    const trainingChecks = [
      { key: 'standard', label: 'hạn đào tạo chuẩn', metric: dl.standard },
      { key: 'max', label: 'hạn đào tạo tối đa', metric: dl.max },
    ];
    for (const chk of trainingChecks) {
      if (['warning', 'urgent', 'overdue'].includes(chk.metric.level)) {
        const subject = `[UET PhDHub] Nhắc ${chk.label}: ${phd.full_name} (${phd.phd_code}) — ${chk.metric.label}`;
        const body = `Nghiên cứu sinh ${phd.full_name} (Mã NCS: ${phd.phd_code}) có mốc ${chk.label} là ngày ${chk.metric.date} (${chk.metric.label}). Đề nghị rà soát tiến độ đào tạo, hoàn thiện thủ tục gia hạn hoặc chuẩn bị hồ sơ bảo vệ theo quy định.`;

        const recipients = new Set<string>();
        if (phd.email) recipients.add(String(phd.email).toLowerCase());
        supervisors.forEach((s) => recipients.add(s.email.toLowerCase()));
        staffRows.forEach((st) => recipients.add(st.email.toLowerCase()));

        for (const email of recipients) {
          const dedupeKey = `deadline:${pid}:${chk.key}:${chk.metric.level}:${monthBucket}:${email}`;
          const created = await createNotification({
            recipient_email: email,
            phd_student_id: pid,
            type: `deadline_${chk.key}`,
            subject,
            body,
            delivery_mode: 'website_and_email',
            dedupe_key: dedupeKey,
            created_by_user_id: actorUserId ?? null,
          });
          if (created) createdCount++;
        }
        details.push({ phdCode: phd.phd_code, kind: chk.key, level: chk.metric.level });
      }
    }

    // 2. Output Foreign Language Review Deadline -> notify NCS + CTSV Staff
    if (['warning', 'urgent', 'overdue'].includes(dl.outputFlReview.level)) {
      const subject = `[UET PhDHub] Nhắc hạn xét lại CĐR Ngoại ngữ: ${phd.full_name} (${phd.phd_code})`;
      const body = `Nghiên cứu sinh ${phd.full_name} (${phd.phd_code}) có thời hạn xét lại Chuẩn đầu ra Ngoại ngữ vào ngày ${dl.outputFlReview.date} (${dl.outputFlReview.label}). Vui lòng cập nhật chứng chỉ ngoại ngữ đạt chuẩn trước thời hạn.`;
      const recipients = new Set<string>();
      if (phd.email) recipients.add(String(phd.email).toLowerCase());
      staffRows.forEach((st) => recipients.add(st.email.toLowerCase()));

      for (const email of recipients) {
        const dedupeKey = `deadline:${pid}:output_fl:${dl.outputFlReview.level}:${monthBucket}:${email}`;
        const created = await createNotification({
          recipient_email: email,
          phd_student_id: pid,
          type: 'deadline_fl',
          subject,
          body,
          delivery_mode: 'website_and_email',
          dedupe_key: dedupeKey,
          created_by_user_id: actorUserId ?? null,
        });
        if (created) createdCount++;
      }
      details.push({ phdCode: phd.phd_code, kind: 'output_fl', level: dl.outputFlReview.level });
    }

    // 3. Independent Review Due Date -> STRICTLY CONFIDENTIAL: ONLY CTSV Admin & Staff!
    if (dl.irDue && ['warning', 'urgent', 'overdue'].includes(dl.irDue.level)) {
      const subject = `[MẬT - Phòng CTSV] Hạn nhận xét Phản biện độc lập: ${phd.full_name} (${phd.phd_code})`;
      const body = `[Thông báo nội bộ Phòng CTSV] Hồ sơ NCS ${phd.full_name} (${phd.phd_code}) có hạn nộp nhận xét Phản biện độc lập ngày ${dl.irDue.date} (${dl.irDue.label}). Vui lòng đôn đốc phản biện độc lập (không chuyển tiếp thông tin mật này tới NCS/CBHD).`;

      for (const st of staffRows) {
        const email = st.email.toLowerCase();
        const dedupeKey = `deadline:${pid}:ir_due:${dl.irDue.level}:${todayIso}:${email}`;
        const created = await createNotification({
          recipient_user_id: st.id,
          recipient_email: email,
          phd_student_id: pid,
          type: 'deadline_ir_confidential',
          subject,
          body,
          delivery_mode: 'website_and_email',
          dedupe_key: dedupeKey,
          created_by_user_id: actorUserId ?? null,
        });
        if (created) createdCount++;
      }
      details.push({ phdCode: phd.phd_code, kind: 'ir_due', level: dl.irDue.level });
    }
  }

  return { scannedPhds: phds.length, notificationsCreated: createdCount, matchedDeadlines: details };
}
