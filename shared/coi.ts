import type { CoiCheckResult, CoiIssue, Regulation3638Config, ScientistResearchEvaluation } from './types';

export interface CoiScientistCandidate {
  id: number;
  full_name: string;
  title_display?: string;
  email?: string;
  work_unit?: string;
  is_internal: number;
  member_role?: string;
  researchEvaluation?: ScientistResearchEvaluation;
}

export function evaluateAcademicCoi(input: {
  targetType: 'seminar' | 'independent_reviewer' | 'defense_council';
  candidates: CoiScientistCandidate[];
  supervisorIds: number[];
  declinedIrText?: string;
  phdPubAuthors?: string[];
  config: Regulation3638Config;
}): CoiCheckResult {
  const errors: CoiIssue[] = [];
  const warnings: CoiIssue[] = [];
  const supSet = new Set(input.supervisorIds.map(Number));
  const declinedLower = String(input.declinedIrText || '').toLowerCase();
  const seenIds = new Set<number>();

  for (const cand of input.candidates) {
    if (!cand || !cand.id) continue;
    const displayName = `${cand.title_display ? cand.title_display + ' ' : ''}${cand.full_name}`.trim();

    if (seenIds.has(cand.id)) {
      errors.push({
        severity: 'error',
        code: 'DUPLICATE_MEMBER',
        scientistId: cand.id,
        scientistName: displayName,
        message: `${displayName} bị chọn trùng trong cùng danh sách.`,
      });
      continue;
    }
    seenIds.add(cand.id);

    // 1. Supervisor conflict of interest
    if (supSet.has(Number(cand.id))) {
      if (input.targetType === 'independent_reviewer') {
        errors.push({
          severity: 'error',
          code: 'SUPERVISOR_AS_IR',
          scientistId: cand.id,
          scientistName: displayName,
          message: `Không được chọn CBHD (${displayName}) làm Phản biện độc lập cho chính NCS này.`,
        });
      } else if (
        input.targetType === 'defense_council' &&
        ['chair', 'reviewer_1', 'reviewer_2', 'reviewer_3'].includes(cand.member_role || '')
      ) {
        errors.push({
          severity: 'error',
          code: 'SUPERVISOR_AS_KEY_COUNCIL_ROLE',
          scientistId: cand.id,
          scientistName: displayName,
          message: `CBHD (${displayName}) không được làm Chủ tịch hoặc Phản biện trong HĐ Đánh giá LATS.`,
        });
      } else if (input.targetType === 'defense_council') {
        warnings.push({
          severity: 'warning',
          code: 'SUPERVISOR_ON_DEFENSE_COUNCIL',
          scientistId: cand.id,
          scientistName: displayName,
          message: `${displayName} là CBHD của NCS — lưu ý Quy chế về vai trò đại diện tập thể hướng dẫn trong HĐ.`,
        });
      }
    }

    // 2. Previously declined IR
    if (
      input.targetType === 'independent_reviewer' &&
      declinedLower &&
      (declinedLower.includes(cand.full_name.toLowerCase()) ||
        (cand.email && declinedLower.includes(cand.email.toLowerCase())))
    ) {
      warnings.push({
        severity: 'warning',
        code: 'PREVIOUSLY_DECLINED_IR',
        scientistId: cand.id,
        scientistName: displayName,
        message: `${displayName} xuất hiện trong danh sách Phản biện độc lập đã từ chối của hồ sơ này.`,
      });
    }

    // 3. Coauthor check with PhD publications (for IR & Defense reviewers)
    if (
      (input.targetType === 'independent_reviewer' ||
        (input.targetType === 'defense_council' && ['reviewer_1', 'reviewer_2', 'reviewer_3'].includes(cand.member_role || ''))) &&
      input.phdPubAuthors?.length
    ) {
      const nameLower = cand.full_name.toLowerCase();
      const matchedCoauthor = input.phdPubAuthors.some((a) => a.toLowerCase().includes(nameLower));
      if (matchedCoauthor) {
        warnings.push({
          severity: 'warning',
          code: 'COAUTHOR_CONFLICT',
          scientistId: cand.id,
          scientistName: displayName,
          message: `${displayName} có tên trùng đồng tác giả công bố của NCS (cần kiểm tra xung đột lợi ích).`,
        });
      }
    }

    // 4. Quy chế 3638 5-year points check
    const r = cand.researchEvaluation;
    if (r) {
      if (input.targetType === 'seminar' && !r.meetsSeminar) {
        warnings.push({
          severity: 'warning',
          code: 'BELOW_3638_SEMINAR',
          scientistId: cand.id,
          scientistName: displayName,
          message: `${displayName} mới đạt ${r.totalPoints}đ / ${input.config.seminarMinPoints}đ chuẩn Seminar (5 năm).`,
        });
      } else if (input.targetType === 'independent_reviewer' && !r.meetsReviewer) {
        warnings.push({
          severity: 'warning',
          code: 'BELOW_3638_IR',
          scientistId: cand.id,
          scientistName: displayName,
          message: `${displayName} mới đạt ${r.totalPoints}đ / ${input.config.reviewerMinPoints}đ chuẩn Phản biện độc lập (5 năm).`,
        });
      } else if (input.targetType === 'defense_council' && !r.meetsCouncil) {
        warnings.push({
          severity: 'warning',
          code: 'BELOW_3638_COUNCIL',
          scientistId: cand.id,
          scientistName: displayName,
          message: `${displayName} mới đạt ${r.totalPoints}đ / ${input.config.councilMinPoints}đ chuẩn HĐ Đánh giá LATS (5 năm).`,
        });
      }
    }
  }

  // 5. Defense council structure checks
  if (input.targetType === 'defense_council' && input.candidates.length > 0) {
    const validCands = input.candidates.filter((c) => c.id > 0);
    if (validCands.length < 7) {
      warnings.push({
        severity: 'warning',
        code: 'COUNCIL_SIZE_UNDER_7',
        message: `HĐ Đánh giá LATS hiện có ${validCands.length} thành viên (theo Quy chế 3638 thông thường gồm 7 thành viên).`,
      });
    }
    const externalCount = validCands.filter((c) => Number(c.is_internal) === 0).length;
    if (externalCount < 3) {
      warnings.push({
        severity: 'warning',
        code: 'COUNCIL_EXTERNAL_LOW',
        message: `HĐ Đánh giá LATS mới có ${externalCount} thành viên ngoài UET (cần đảm bảo đủ tỷ lệ chuyên gia ngoài cơ sở đào tạo).`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
