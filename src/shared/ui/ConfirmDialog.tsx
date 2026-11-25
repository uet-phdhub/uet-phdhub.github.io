import { Button } from './Button';
import { Modal } from './Dialog';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  danger = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      widthClass="w-[min(440px,94vw)]"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Hủy
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={busy}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-slate-600 leading-relaxed">{description}</p>
    </Modal>
  );
}
