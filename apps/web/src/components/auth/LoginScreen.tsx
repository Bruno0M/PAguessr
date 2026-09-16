import { useState, type FormEvent } from 'react';
import { login, type PublicUser } from '../../api/auth';
import { AuthError, AuthLayout } from './AuthLayout';

export function LoginScreen({
  onSuccess,
  onGoToRegister,
  onGoToRecover,
  onGoToTitle,
}: {
  onSuccess: (user: PublicUser) => void;
  onGoToRegister: () => void;
  onGoToRecover: () => void;
  onGoToTitle: () => void;
}) {
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await login(nick, password);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Sua conta guarda seu recorde e sua posição no ranking."
      onBack={onGoToTitle}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}
        <div className="auth-field">
          <label htmlFor="login-nick">Nick</label>
          <input
            id="login-nick"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
        <div className="auth-links">
          <button type="button" onClick={onGoToRegister}>
            Criar conta
          </button>
          <button type="button" onClick={onGoToRecover}>
            Esqueci minha senha
          </button>
          <button type="button" onClick={onGoToTitle}>
            Voltar ao título
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
