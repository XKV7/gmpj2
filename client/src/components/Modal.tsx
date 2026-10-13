import { useEffect, useRef, type ReactNode } from 'react';
import { ui } from '../store/ui';
import { Icon } from './Icon';

export function Modal({
  title, subtitle, children, footer, onClose, size = 'md', className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const close = onClose ?? ui.closeModal;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)');
    first?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} className={`modal modal-${size} ${className ?? ''}`} role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}>
        {title !== undefined && (
          <div className="modal-header">
            <div className="grow">
              <h2 className="modal-title">{title}</h2>
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
            <button className="icon-btn modal-close" onClick={close} aria-label="닫기">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
