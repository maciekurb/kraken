import React, { useId } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { OverlayPortal } from './OverlayPortal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'ocean' | 'cult';
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}) => {
  const { t } = useI18n();
  const titleId = useId();

  const confirmBtnClass =
    tone === 'ocean'
      ? 'btn-ocean'
      : tone === 'cult'
        ? 'btn-cult'
        : 'btn-primary';

  return (
    <OverlayPortal
      open={open}
      onClose={onCancel}
      variant="modal"
      zIndex={85}
      ariaLabelledBy={titleId}
      testId={testId}
    >
      <div className="crimson-ribbon" style={{ marginTop: 0 }}>
        <h3 id={titleId}>{title}</h3>
      </div>
      <p style={{ margin: '0.25rem 0 1rem', lineHeight: 1.48 }}>{description}</p>
      <div className="confirm-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={onCancel}
          data-testid={`${testId}-cancel`}
        >
          {cancelLabel ?? t('confirmCancel')}
        </button>
        <button
          type="button"
          className={`btn ${confirmBtnClass}`}
          onClick={onConfirm}
          data-testid={`${testId}-confirm`}
        >
          {confirmLabel}
        </button>
      </div>
    </OverlayPortal>
  );
};
