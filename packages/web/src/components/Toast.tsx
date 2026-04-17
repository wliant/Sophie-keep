import { useToastStore } from '../state/toast';

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.level === 'error' ? 'error' : t.level === 'success' ? 'success' : ''}`}
        >
          <span>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            style={{
              marginLeft: '0.5rem',
              background: 'transparent',
              color: 'inherit',
              border: 'none',
              minHeight: 'auto',
              minWidth: 'auto',
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
