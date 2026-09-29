// src/components/Modal.tsx — accessible dialog: overlay 70%, Esc closes, focus moves in and returns.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (f.length === 0) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}
        className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-[16px] bg-white shadow-[var(--shadow-overlay)] sm:rounded-[16px]`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6 sm:px-8">
          <h2 id="modal-title" className="t-title-md">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted hover:bg-canvas hover:text-ink">
            <IconClose />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-3 sm:px-8">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-4 sm:px-8">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
