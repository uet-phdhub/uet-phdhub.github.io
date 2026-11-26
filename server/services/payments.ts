import XLSX from 'xlsx';
import { COMMITTEE_MEMBER_ROLE_LABELS } from '../../shared/regulation3638';
import type { FeeActivityType, FeeRateItem, PaymentItemRow } from '../../shared/types';
import { db } from '../db';

function findFeeRate(
  rates: FeeRateItem[],
  activityType: FeeActivityType,
  roleCode: string
): { unitAmount: number; pitRate: number; pitThreshold: number } {
  const exact = rates.find((r) => r.activity_type === activityType && r.role_code === roleCode && r.active);
  if (exact) {
    return {
      unitAmount: Number(exact.unit_amount || 0),
      pitRate: Number(exact.pit_tax_rate ?? 0.1),
      pitThreshold: Number(exact.pit_threshold ?? 2000000),
    };
  }
  const fallback = rates.find((r) => r.activity_type === activityType && r.active);
  return {
    unitAmount: Number(fallback?.unit_amount || 0),
    pitRate: Number(fallback?.pit_tax_rate ?? 0.1),
    pitThreshold: Number(fallback?.pit_threshold ?? 2000000),
  };
}

export function computePitTax(
  grossAmount: number,
  isInternal: number,
  pitTaxRate: number,
  pitThreshold: number,
  taxExemptDeclared: boolean
): { taxAmount: number; netAmount: number } {
  if (Number(isInternal) === 1 || taxExemptDeclared || grossAmount < pitThreshold) {
    return { taxAmount: 0, netAmount: Math.round(grossAmount) };
  }
  const tax = Math.round(grossAmount * pitTaxRate);
  return { taxAmount: tax, netAmount: Math.round(grossAmount - tax) };
}

function getMissingPaymentFields(sci: any): string[] {
  const missing: string[] = [];
  if (!String(sci?.cccd || '').trim()) missing.push('CCCD');
  if (!String(sci?.tax_code || '').trim()) missing.push('MST');
  if (!String(sci?.bank_account || '').trim()) missing.push('STK');
  if (!String(sci?.bank_name || '').trim()) missing.push('Ngân hàng');
  return missing;
}

export async function previewPaymentBatch(input: {
  periodFrom?: string;
  periodTo?: string;
  activities?: FeeActivityType[];
  hideIrPhdIdentity?: boolean;
  fiscalYear?: string;
}) {
  const periodFrom = String(input.periodFrom || '').trim();
  const periodTo = String(input.periodTo || '').trim();
  const hideIr = input.hideIrPhdIdentity !== false;
  const activities = new Set<FeeActivityType>(
    input.activities?.length ? input.activities : ['seminar', 'independent_review', 'defense_council']
  );

  const [ratesRes, sciRes, paidRes] = await Promise.all([
    db.execute('SELECT * FROM fee_rates WHERE active = 1 ORDER BY id ASC'),
    db.execute('SELECT * FROM scientists'),
    db.execute(`
      SELECT pi.source_type, pi.source_id
      FROM payment_items pi
      JOIN payment_batches pb ON pb.id = pi.batch_id
      WHERE pb.status IN ('confirmed', 'paid')
    `),
  ]);

  const allRates = ratesRes.rows as unknown as FeeRateItem[];
  const yearRates = input.fiscalYear
    ? allRates.filter((r) => r.fiscal_year === input.fiscalYear)
    : allRates;
  const activeRates = yearRates.length ? yearRates : allRates;

  const sciMap = new Map<number, any>((sciRes.rows as any[]).map((s) => [Number(s.id), s]));
  const alreadyPaid = new Set<string>(
    (paidRes.rows as any[]).map((r) => `${r.source_type}:${r.source_id}`)
  );

  const items: PaymentItemRow[] = [];

  // 1. Seminar & Defense Council members
  if (activities.has('seminar') || activities.has('defense_council')) {
    const cmRows = (
      await db.execute(`
        SELECT cm.*, p.phd_code, p.full_name as phd_name, p.seminar_date, p.defense_date
        FROM phd_committee_members cm
        JOIN phd_students p ON p.id = cm.phd_student_id
        ORDER BY cm.id ASC
      `)
    ).rows as any[];

    for (const cm of cmRows) {
      const activityType: FeeActivityType = cm.committee_type === 'seminar' ? 'seminar' : 'defense_council';
      if (!activities.has(activityType)) continue;

      const eventDate = String(
        cm.event_date || (cm.committee_type === 'seminar' ? cm.seminar_date : cm.defense_date) || ''
      ).slice(0, 10);
      if (periodFrom && eventDate && eventDate < periodFrom) continue;
      if (periodTo && eventDate && eventDate > periodTo) continue;

      const sourceId = `cm-${cm.id}`;
      if (alreadyPaid.has(`${activityType}:${sourceId}`)) continue;

      const sci = sciMap.get(Number(cm.scientist_id));
      if (!sci) continue;

      const rate = findFeeRate(activeRates, activityType, cm.member_role || 'member');
      const roleLabel = COMMITTEE_MEMBER_ROLE_LABELS[cm.member_role] || cm.member_role;
      const gross = rate.unitAmount;
      const { taxAmount, netAmount } = computePitTax(gross, sci.is_internal, rate.pitRate, rate.pitThreshold, false);

      items.push({
        scientist_id: Number(sci.id),
        scientist_name: sci.full_name,
        title_display: sci.title_display || '',
        work_unit: sci.work_unit || '',
        is_internal: Number(sci.is_internal || 0),
        cccd: sci.cccd || '',
        tax_code: sci.tax_code || '',
        bank_account: sci.bank_account || '',
        bank_name: sci.bank_name || '',
        source_type: activityType,
        source_id: sourceId,
        role_code: cm.member_role || 'member',
        phd_code: cm.phd_code,
        phd_name: cm.phd_name,
        description: `${activityType === 'seminar' ? 'HĐ Seminar' : 'HĐ Đánh giá LATS'} (${roleLabel}) — ${cm.phd_code} ${cm.phd_name}`,
        quantity: 1,
        unit_amount: rate.unitAmount,
        gross_amount: gross,
        tax_amount: taxAmount,
        net_amount: netAmount,
        tax_exempt_declared: 0,
        missing_payment_fields: getMissingPaymentFields(sci),
      });
    }
  }

  // 2. Independent Reviewers (IR 1, 2, 3) — with anonymization option!
  if (activities.has('independent_review')) {
    const phds = (
      await db.execute(`
        SELECT id, phd_code, full_name,
               ir1_scientist_id, ir1_sent_date,
               ir2_scientist_id, ir2_sent_date,
               ir3_scientist_id, ir3_sent_date
        FROM phd_students
        WHERE ir1_scientist_id IS NOT NULL OR ir2_scientist_id IS NOT NULL OR ir3_scientist_id IS NOT NULL
      `)
    ).rows as any[];

    const rate = findFeeRate(activeRates, 'independent_review', 'reviewer');
    for (const p of phds) {
      const slots = [
        { slot: 1, sciId: p.ir1_scientist_id, sentDate: p.ir1_sent_date },
        { slot: 2, sciId: p.ir2_scientist_id, sentDate: p.ir2_sent_date },
        { slot: 3, sciId: p.ir3_scientist_id, sentDate: p.ir3_sent_date },
      ];
      for (const s of slots) {
        if (!s.sciId) continue;
        const sentDate = String(s.sentDate || '').slice(0, 10);
        if (periodFrom && sentDate && sentDate < periodFrom) continue;
        if (periodTo && sentDate && sentDate > periodTo) continue;

        const sourceId = `ir-${p.id}-s${s.slot}`;
        if (alreadyPaid.has(`independent_review:${sourceId}`)) continue;

        const sci = sciMap.get(Number(s.sciId));
        if (!sci) continue;

        const gross = rate.unitAmount;
        const { taxAmount, netAmount } = computePitTax(gross, sci.is_internal, rate.pitRate, rate.pitThreshold, false);

        items.push({
          scientist_id: Number(sci.id),
          scientist_name: sci.full_name,
          title_display: sci.title_display || '',
          work_unit: sci.work_unit || '',
          is_internal: Number(sci.is_internal || 0),
          cccd: sci.cccd || '',
          tax_code: sci.tax_code || '',
          bank_account: sci.bank_account || '',
          bank_name: sci.bank_name || '',
          source_type: 'independent_review',
          source_id: sourceId,
          role_code: 'reviewer',
          phd_code: hideIr ? 'PBĐL-ẨN' : p.phd_code,
          phd_name: hideIr ? 'Hồ sơ phản biện độc lập (Ẩn danh)' : p.full_name,
          description: hideIr
            ? `Phản biện độc lập LATS (Hồ sơ mật #${p.id}.${s.slot})`
            : `Phản biện độc lập #${s.slot} — ${p.phd_code} ${p.full_name}`,
          quantity: 1,
          unit_amount: rate.unitAmount,
          gross_amount: gross,
          tax_amount: taxAmount,
          net_amount: netAmount,
          tax_exempt_declared: 0,
          missing_payment_fields: getMissingPaymentFields(sci),
        });
      }
    }
  }

  // Re-evaluate cumulative per-scientist PIT threshold (in Vietnam, PIT 10% triggers if a batch payment to external person >= threshold)
  const pitRate = Number(activeRates[0]?.pit_tax_rate ?? 0.1);
  const pitThreshold = Number(activeRates[0]?.pit_threshold ?? 2000000);
  const grossByExternalSci = new Map<number, number>();
  for (const it of items) {
    if (it.is_internal === 0) {
      grossByExternalSci.set(it.scientist_id, (grossByExternalSci.get(it.scientist_id) || 0) + it.gross_amount);
    }
  }
  for (const it of items) {
    if (it.is_internal === 0 && !it.tax_exempt_declared) {
      const totalForSci = grossByExternalSci.get(it.scientist_id) || 0;
      if (totalForSci >= pitThreshold) {
        it.tax_amount = Math.round(it.gross_amount * pitRate);
        it.net_amount = Math.round(it.gross_amount - it.tax_amount);
      } else {
        it.tax_amount = 0;
        it.net_amount = Math.round(it.gross_amount);
      }
    }
  }

  const totalGross = items.reduce((s, i) => s + i.gross_amount, 0);
  const totalTax = items.reduce((s, i) => s + i.tax_amount, 0);
  const totalNet = items.reduce((s, i) => s + i.net_amount, 0);
  const warningMissingCount = items.filter((i) => (i.missing_payment_fields?.length || 0) > 0).length;

  return {
    items,
    summary: {
      count: items.length,
      totalGross,
      totalTax,
      totalNet,
      pitRate,
      pitThreshold,
      warningMissingCount,
    },
  };
}

export function exportPaymentBatchWorkbook(
  batch: any,
  items: PaymentItemRow[],
  supervisors: any[]
): Buffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Accounting Payment List
  const payRows = items.map((it, idx) => ({
    'STT': idx + 1,
    'Họ và tên': `${it.title_display ? it.title_display + ' ' : ''}${it.scientist_name || ''}`.trim(),
    'Đơn vị công tác': it.work_unit || '',
    'Phân loại': Number(it.is_internal) === 1 ? 'Trong UET' : 'Ngoài Trường',
    'Nội dung chi': it.description,
    'Số lượng': it.quantity,
    'Đơn giá (VNĐ)': it.unit_amount,
    'Thành tiền (VNĐ)': it.gross_amount,
    'Thuế TNCN 10% (VNĐ)': it.tax_amount,
    'Thực nhận (VNĐ)': it.net_amount,
    'Miễn thuế (08/CK)': it.tax_exempt_declared ? 'Có' : '',
    'Số CCCD': it.cccd || '',
    'Mã số thuế TNCN': it.tax_code || '',
    'Số tài khoản': it.bank_account || '',
    'Ngân hàng': it.bank_name || '',
  }));

  payRows.push({
    'STT': '' as any,
    'Họ và tên': 'TỔNG CỘNG',
    'Đơn vị công tác': '',
    'Phân loại': '',
    'Nội dung chi': batch.title || '',
    'Số lượng': items.reduce((s, i) => s + i.quantity, 0),
    'Đơn giá (VNĐ)': '' as any,
    'Thành tiền (VNĐ)': items.reduce((s, i) => s + i.gross_amount, 0),
    'Thuế TNCN 10% (VNĐ)': items.reduce((s, i) => s + i.tax_amount, 0),
    'Thực nhận (VNĐ)': items.reduce((s, i) => s + i.net_amount, 0),
    'Miễn thuế (08/CK)': '',
    'Số CCCD': '',
    'Mã số thuế TNCN': '',
    'Số tài khoản': '',
    'Ngân hàng': '',
  });

  const ws1 = XLSX.utils.json_to_sheet(payRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'BangKe_ThuLao');

  // Sheet 2: Supervisor Standard Hours Summary
  const supRows = supervisors.map((s, idx) => ({
    'STT': idx + 1,
    'Họ và tên': `${s.title_display ? s.title_display + ' ' : ''}${s.full_name}`.trim(),
    'Đơn vị công tác': s.work_unit || '',
    'NCS Độc lập (1.0)': s.quotaEvaluation?.countsByRole?.independent ?? 0,
    'NCS Chính (0.5)': s.quotaEvaluation?.countsByRole?.primary ?? 0,
    'NCS Phụ (0.3)': s.quotaEvaluation?.countsByRole?.secondary ?? 0,
    'NCS Đồng HD (0.5)': s.quotaEvaluation?.countsByRole?.co ?? 0,
    'Tổng quy đổi': s.quotaEvaluation?.equivalentLoad ?? 0,
    'Định mức trần': s.quotaEvaluation?.effectiveQuota ?? 0,
    'Giờ chuẩn hướng dẫn': s.quotaEvaluation?.standardHours ?? 0,
    'Điểm NCKH 3638 (5 năm)': s.researchEvaluation?.totalPoints ?? 0,
  }));
  const ws2 = XLSX.utils.json_to_sheet(supRows.length ? supRows : [{ 'Thông báo': 'Chưa có dữ liệu CBHD' }]);
  XLSX.utils.book_append_sheet(wb, ws2, 'GioChuan_CBHD');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
