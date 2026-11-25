import { toast } from 'sonner';

export function formatDateVN(iso?: string | null): string {
  if (!iso) return '—';
  const clean = String(iso).trim().slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return clean;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDateTimeVN(raw?: string | null): string {
  if (!raw) return '—';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/);
  if (!m) return formatDateVN(s);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`;
}

export async function copyValue(value: string | null | undefined, label: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Đã sao chép ${label}: ${value}`);
  } catch {
    toast.error('Không thể sao chép vào clipboard.');
  }
}

export function computePhdLifecycleStage(phd: any): number {
  if (!phd) return 0;
  if (phd.is_completed || phd.study_status === 'graduated' || phd.diploma_serial_no) return 5;
  if (phd.defense_date || phd.defense_council_decision_no || phd.ir1_sent_date || phd.ir_due_date) return 4;
  if (phd.seminar_date || phd.seminar_decision_no || phd.study_status === 'ready_defense') return 3;
  if ((phd.publications?.length || 0) > 0 || (phd.progress_reports?.length || 0) > 0 || phd.dissertation_title) return 2;
  if ((phd.accumulated_credits || 0) > 0 || (phd.completed_courses?.length || 0) > 0) return 1;
  return 0;
}

export const PHD_LIFECYCLE_STAGES = [
  'Tuyển sinh & Văn bằng',
  'Học phần & Đề cương',
  'Nghiên cứu & Công bố',
  'Seminar tổng thể',
  'PBĐL & Bảo vệ LATS',
  'Cấp bằng & Kết thúc',
] as const;
