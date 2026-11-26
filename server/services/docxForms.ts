import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  AUTHOR_ROLE_LABELS,
  COMMITTEE_MEMBER_ROLE_LABELS,
  PUBLICATION_TYPE_LABELS,
  SUPERVISION_ROLE_LABELS,
} from '../../shared/regulation3638';
import type { AuthorRole, PublicationType, SupervisionRole } from '../../shared/types';

function fmtDateVN(iso?: string | null): string {
  if (!iso) return '..../..../20....';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const THIN_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
};

function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    font: 'Times New Roman',
    size: opts.size ?? 24, // 12pt
    bold: opts.bold,
    italics: opts.italics,
  });
}

function p(
  children: TextRun | TextRun[] | string,
  opts: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}
) {
  const arr = typeof children === 'string' ? [run(children)] : Array.isArray(children) ? children : [children];
  return new Paragraph({
    alignment: opts.alignment ?? AlignmentType.LEFT,
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 276 },
    children: arr,
  });
}

function kvLine(label: string, value: string) {
  return p([run(`${label}: `, { bold: true }), run(value || '—')], { after: 80 });
}

function buildOfficialHeaderTable(docNo = 'Số: ....../ĐHCN-CTSV') {
  const now = new Date();
  const dateLine = `Hà Nội, ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [
              p(run('ĐẠI HỌC QUỐC GIA HÀ NỘI', { size: 22 }), { alignment: AlignmentType.CENTER, after: 40 }),
              p(run('TRƯỜNG ĐẠI HỌC CÔNG NGHỆ', { bold: true, size: 22 }), { alignment: AlignmentType.CENTER, after: 60 }),
              p(run(docNo, { size: 22 }), { alignment: AlignmentType.CENTER, after: 40 }),
            ],
          }),
          new TableCell({
            width: { size: 55, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [
              p(run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 22 }), { alignment: AlignmentType.CENTER, after: 40 }),
              p(run('Độc lập - Tự do - Hạnh phúc', { bold: true, size: 24 }), { alignment: AlignmentType.CENTER, after: 60 }),
              p(run(dateLine, { italics: true, size: 22 }), { alignment: AlignmentType.CENTER, after: 40 }),
            ],
          }),
        ],
      }),
    ],
  });
}

function makeSimpleTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          borders: THIN_BORDERS,
          shading: { fill: 'F1F5F9' },
          children: [p(run(h, { bold: true, size: 21 }), { after: 40, before: 40 })],
        })
    ),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map(
          (cell) =>
            new TableCell({
              borders: THIN_BORDERS,
              children: [p(run(cell || '—', { size: 21 }), { after: 40, before: 40 })],
            })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

export async function generatePhdDocxForm(
  templateCode: 'compliance_3638' | 'committee_seminar' | 'committee_defense' | 'ir_invitation',
  phd: any
): Promise<{ buffer: Buffer; filename: string }> {
  const titleText = phd.adjusted_dissertation_title || phd.dissertation_title || '(Chưa cập nhật tên đề tài)';
  const supsText = (phd.supervisions || [])
    .map((s: any) => `${s.title_display || ''} ${s.full_name} (${SUPERVISION_ROLE_LABELS[s.role as SupervisionRole] || s.role})`.trim())
    .join('; ');

  const children: Array<Paragraph | Table> = [];

  if (templateCode === 'compliance_3638') {
    children.push(
      buildOfficialHeaderTable(),
      p(run('PHIẾU KIỂM TRA ĐIỀU KIỆN BẢO VỆ LUẬN ÁN TIẾN SĨ', { bold: true, size: 28 }), {
        alignment: AlignmentType.CENTER,
        before: 240,
        after: 60,
      }),
      p(run('(Theo Quy chế đào tạo tiến sĩ tại ĐHQGHN — QĐ 3638/QĐ-ĐHQGHN)', { italics: true, size: 22 }), {
        alignment: AlignmentType.CENTER,
        after: 200,
      }),
      kvLine('Họ và tên Nghiên cứu sinh', phd.full_name),
      kvLine('Mã NCS / Khóa tuyển sinh', `${phd.phd_code} · ${phd.cohort || '—'}`),
      kvLine('Đơn vị / Ngành đào tạo', `${phd.faculty_name || '—'} — Ngành ${phd.major_name || '—'}`),
      kvLine('Tên đề tài luận án', titleText),
      kvLine('Tập thể hướng dẫn', supsText || 'Chưa phân công'),
      kvLine('Thời gian đào tạo', `${fmtDateVN(phd.training_start_date)} → Hạn chuẩn: ${fmtDateVN(phd.standard_deadline)} · Hạn tối đa: ${fmtDateVN(phd.max_deadline)}`),
      kvLine('Tín chỉ tích lũy', `${phd.accumulated_credits ?? 0} tín chỉ`),
      kvLine('Chuẩn đầu ra Ngoại ngữ', `${phd.output_foreign_language || 'Chưa cập nhật'} (Hạn xét lại: ${fmtDateVN(phd.output_fl_review_deadline)})`),
      kvLine('Seminar tổng thể / BV cấp cơ sở', `${phd.seminar_decision_no || '—'} · Ngày ${fmtDateVN(phd.seminar_date)} · Kết quả: ${phd.seminar_result || '—'}`),
      p(
        [
          run('Tổng hợp điểm công bố 3638: ', { bold: true }),
          run(
            `${phd.publicationEvaluation?.totalPoints ?? 0} điểm (${phd.publicationEvaluation?.wosScopusCount ?? 0} bài WoS/Scopus) — Kết luận: ${phd.publicationEvaluation?.status === 'met' ? 'ĐẠT CHUẨN 3638' : 'CHƯA ĐẠT CHUẨN'}`
          ),
        ],
        { before: 120, after: 120 }
      ),
      makeSimpleTable(
        ['TT', 'Năm', 'Tên công trình / Tạp chí', 'Loại & Vai trò', 'Điểm', 'Xác minh'],
        (phd.publications || []).length
          ? phd.publications.map((pub: any, idx: number) => [
              String(idx + 1),
              String(pub.pub_year || ''),
              `${pub.title}${pub.venue ? ' — ' + pub.venue : ''}`,
              `${PUBLICATION_TYPE_LABELS[pub.pub_type as PublicationType] || pub.pub_type} (${AUTHOR_ROLE_LABELS[pub.author_role as AuthorRole] || pub.author_role})`,
              `${pub.calculated_point}đ`,
              pub.verified ? 'Đã XM' : 'Chờ XM',
            ])
          : [['—', '—', 'Chưa có công bố khoa học', '—', '0đ', '—']]
      ),
      p(run('PHÒNG CÔNG TÁC SINH VIÊN', { bold: true }), { alignment: AlignmentType.RIGHT, before: 300, after: 40 }),
      p(run('(Ký, ghi rõ họ tên)', { italics: true, size: 22 }), { alignment: AlignmentType.RIGHT })
    );
  } else if (templateCode === 'committee_seminar' || templateCode === 'committee_defense') {
    const isDefense = templateCode === 'committee_defense';
    const members = isDefense ? phd.defense_members || [] : phd.seminar_members || [];
    children.push(
      buildOfficialHeaderTable(),
      p(
        run(
          isDefense
            ? 'TỜ TRÌNH THÀNH LẬP HỘI ĐỒNG ĐÁNH GIÁ LUẬN ÁN TIẾN SĨ'
            : 'TỜ TRÌNH THÀNH LẬP HỘI ĐỒNG ĐÁNH GIÁ TỔNG THỂ (SEMINAR)',
          { bold: true, size: 28 }
        ),
        { alignment: AlignmentType.CENTER, before: 240, after: 160 }
      ),
      p([run('Kính gửi: ', { bold: true }), run('Hiệu trưởng Trường Đại học Công nghệ — ĐHQGHN')]),
      kvLine('Nghiên cứu sinh', `${phd.full_name} (Mã NCS: ${phd.phd_code})`),
      kvLine('Ngành / Khoa đào tạo', `${phd.major_name || '—'} — ${phd.faculty_name || '—'}`),
      kvLine('Tên đề tài luận án', titleText),
      kvLine('Tập thể CBHD', supsText || '—'),
      kvLine('Số QĐ / Ngày dự kiến', `${(isDefense ? phd.defense_council_decision_no : phd.seminar_decision_no) || 'Dự thảo'} · Ngày ${fmtDateVN(isDefense ? phd.defense_date : phd.seminar_date)}`),
      p(run('Danh sách thành viên Hội đồng đề xuất:', { bold: true }), { before: 120, after: 100 }),
      makeSimpleTable(
        ['TT', 'Học hàm, Học vị & Họ tên', 'Đơn vị công tác', 'Chức danh HĐ'],
        members.length
          ? members.map((m: any, idx: number) => [
              String(idx + 1),
              `${m.title_display || ''} ${m.full_name}`.trim(),
              m.work_unit || '—',
              COMMITTEE_MEMBER_ROLE_LABELS[m.member_role] || m.member_role,
            ])
          : [['—', 'Chưa phân công thành viên hội đồng', '—', '—']]
      ),
      p(run('TRƯỞNG PHÒNG CÔNG TÁC SINH VIÊN', { bold: true }), { alignment: AlignmentType.RIGHT, before: 300, after: 40 }),
      p(run('(Ký, ghi rõ họ tên)', { italics: true, size: 22 }), { alignment: AlignmentType.RIGHT })
    );
  } else {
    // ir_invitation — STRICTLY ANONYMIZED (no PhD student name/code/supervisors!)
    children.push(
      buildOfficialHeaderTable('Số: ....../GM-ĐHCN (MẬT)'),
      p(run('GIẤY MỜI PHẢN BIỆN ĐỘC LẬP LUẬN ÁN TIẾN SĨ', { bold: true, size: 28 }), {
        alignment: AlignmentType.CENTER,
        before: 240,
        after: 60,
      }),
      p(run('(Tài liệu mật — Đã ẩn thông tin định danh Nghiên cứu sinh và CBHD theo Quy chế 3638)', { italics: true, size: 22 }), {
        alignment: AlignmentType.CENTER,
        after: 200,
      }),
      p([run('Kính gửi: ', { bold: true }), run('Quý Thầy/Cô Chuyên gia Phản biện độc lập')]),
      p(
        'Trường Đại học Công nghệ — Đại học Quốc gia Hà Nội trân trọng kính mời Quý Thầy/Cô nhận xét phản biện độc lập cho bản thảo Luận án Tiến sĩ sau:'
      ),
      kvLine('Mã hồ sơ phản biện kín', `UET-IR-${phd.id}`),
      kvLine('Ngành đào tạo', phd.major_name || '—'),
      kvLine('Tên đề tài luận án', titleText),
      kvLine('Hạn gửi lại Phiếu nhận xét', fmtDateVN(phd.ir_due_date)),
      p(
        'Đề nghị Quý Thầy/Cô giữ bí mật tuyệt đối quá trình phản biện độc lập và gửi lại bản nhận xét (kèm bản xác nhận không xung đột lợi ích) về Phòng Công tác sinh viên trước thời hạn nêu trên.',
        { before: 120 }
      ),
      p(run('TL. HIỆU TRƯỞNG — TRƯỞNG PHÒNG CÔNG TÁC SINH VIÊN', { bold: true }), {
        alignment: AlignmentType.RIGHT,
        before: 300,
        after: 40,
      })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const safeCode = String(phd.phd_code || `NCS_${phd.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileCode = templateCode === 'ir_invitation' ? `UET_GiayMoi_PBDL_AnDanh_${phd.id}.docx` : `UET_${templateCode}_${safeCode}.docx`;
  return { buffer, filename: fileCode };
}

export async function generateScientistCvDocx(sci: any): Promise<{ buffer: Buffer; filename: string }> {
  const fromYear = sci.researchEvaluation?.fromYear ?? new Date().getFullYear() - 4;
  const toYear = sci.researchEvaluation?.toYear ?? new Date().getFullYear();
  const pubsInWindow = (sci.publications || []).filter((pub: any) => Number(pub.pub_year) >= fromYear);

  const doc = new Document({
    sections: [
      {
        children: [
          buildOfficialHeaderTable(),
          p(run('LÝ LỊCH KHOA HỌC & BẢNG KÊ CÔNG BỐ 5 NĂM', { bold: true, size: 28 }), {
            alignment: AlignmentType.CENTER,
            before: 240,
            after: 60,
          }),
          p(run(`(Giai đoạn ${fromYear} – ${toYear} · Đánh giá theo Quy chế 3638/QĐ-ĐHQGHN)`, { italics: true, size: 22 }), {
            alignment: AlignmentType.CENTER,
            after: 200,
          }),
          kvLine('Họ và tên', `${sci.title_display ? sci.title_display + ' ' : ''}${sci.full_name}`),
          kvLine('Học hàm / Học vị / Năm công nhận', `${sci.academic_rank || '—'} / ${sci.academic_degree || '—'} (${sci.recognition_year || '—'})`),
          kvLine('Chuyên ngành', sci.specialization || '—'),
          kvLine('Đơn vị công tác', sci.work_unit || '—'),
          kvLine('Email / Điện thoại', `${sci.email || '—'} · ${sci.phone || '—'}`),
          kvLine(
            `Tổng điểm NCKH 3638 (${fromYear}–${toYear})`,
            `${sci.researchEvaluation?.totalPoints ?? 0} điểm · ${sci.researchEvaluation?.wosScopusInWindow ?? 0} bài WoS/Scopus`
          ),
          p(run(`Danh mục công bố khoa học (${pubsInWindow.length} công trình):`, { bold: true }), { before: 140, after: 100 }),
          makeSimpleTable(
            ['TT', 'Năm', 'Tên bài báo / Công trình', 'Tạp chí / Hội nghị', 'Phân loại', 'Điểm 3638'],
            pubsInWindow.length
              ? pubsInWindow.map((pub: any, idx: number) => [
                  String(idx + 1),
                  String(pub.pub_year || ''),
                  pub.title,
                  pub.venue || '—',
                  PUBLICATION_TYPE_LABELS[pub.pub_type as PublicationType] || pub.pub_type,
                  `${pub.calculated_point}đ`,
                ])
              : [['—', '—', 'Chưa có công bố trong giai đoạn này', '—', '—', '0đ']]
          ),
          p(run('XÁC NHẬN CỦA NGƯỜI KHAI', { bold: true }), { alignment: AlignmentType.RIGHT, before: 300, after: 40 }),
          p(run('(Ký và ghi rõ họ tên)', { italics: true, size: 22 }), { alignment: AlignmentType.RIGHT }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = String(sci.full_name || `CB_${sci.id}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return { buffer, filename: `UET_LyLichKhoaHoc_5Nam_${safeName}.docx` };
}
