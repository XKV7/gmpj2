import { useUI, ui } from '../store/ui';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => ui.dismissToast(t.id)}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'sparkles'} size={18} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
