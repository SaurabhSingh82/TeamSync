import type { ReactNode } from 'react'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

interface ConfirmDialogProps {
  title: string
  description: ReactNode
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      closeDisabled={busy}
      description={description}
      onClose={onCancel}
      title={title}
    >
      <div className="flex justify-end gap-3">
        <Button autoFocus disabled={busy} onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button disabled={busy} onClick={onConfirm} type="button" variant="danger">
          {busy ? 'Please wait…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
