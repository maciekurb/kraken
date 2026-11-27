import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

let activeScrollLocks = 0;
let savedBodyOverflow = '';

function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (activeScrollLocks === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeScrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeScrollLocks = Math.max(0, activeScrollLocks - 1);
    if (activeScrollLocks === 0) {
      document.body.style.overflow = savedBodyOverflow;
    }
  };
}

export interface OverlayPortalProps {
  open: boolean;
  onClose?: () => void;
  variant?: 'modal' | 'sheet';
  zIndex?: number;
  backdropClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  testId?: string;
  children: React.ReactNode;
}

/**
 * Portals modals, bottom sheets, and phase overlays directly to `document.body`
 * with reference-counted body scroll lock and Escape handling so `position: fixed`
 * always anchors cleanly to the live viewport (never trapped by ancestor transforms).
 */
export const OverlayPortal: React.FC<OverlayPortalProps> = ({
  open,
  onClose,
  variant = 'modal',
  zIndex,
  backdropClassName = '',
  panelClassName = '',
  ariaLabel,
  ariaLabelledBy,
  testId,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    return acquireBodyScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const isSheet = variant === 'sheet';
  const backdropClasses = [
    'phase-overlay-backdrop',
    isSheet ? 'overlay-variant-sheet' : 'overlay-variant-modal',
    backdropClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const panelClasses = [
    isSheet ? 'bottom-sheet-panel' : 'phase-overlay-modal',
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={backdropClasses}
      style={zIndex !== undefined ? { zIndex } : undefined}
      data-testid={testId}
      onClick={(e) => {
        if (onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={panelClasses}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {isSheet && <div className="sheet-grab-handle" aria-hidden="true" />}
        {children}
      </div>
    </div>,
    document.body
  );
};
