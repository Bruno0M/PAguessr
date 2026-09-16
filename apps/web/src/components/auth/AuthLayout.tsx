import { useEffect, useRef, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import './AuthLayout.css';

export function AuthLayout({
  eyebrow = 'Conta',
  title,
  subtitle,
  onBack,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);

  // Esc volta uma tela, como no menu do título. Com algo já digitado não faz nada:
  // o Esc também fecha o autocompletar do navegador e não pode descartar o formulário.
  useEffect(() => {
    if (!onBack) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return;
      const inputs = Array.from(panelRef.current?.querySelectorAll('input') ?? []);
      if (inputs.some((input) => input.type !== 'checkbox' && input.value !== '')) return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  return (
    <div className="auth-screen">
      <main className="game-card auth-panel" ref={panelRef}>
        <p className="auth-eyebrow">{eyebrow}</p>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </main>
      <p className="game-hint auth-hint" aria-hidden="true">
        <span>
          <kbd>
            <svg viewBox="0 0 16 16">
              <path d="M12.5 3.5v4.5H4.5M7.5 5 4.5 8l3 3" />
            </svg>
          </kbd>
          Confirmar
        </span>
        {onBack && (
          <span>
            <kbd>Esc</kbd>
            Voltar
          </span>
        )}
      </p>
      <p className="game-version auth-version">
        v{__APP_VERSION__} · {__BUILD_DATE__}
      </p>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div className="auth-error" role="alert">
      <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
