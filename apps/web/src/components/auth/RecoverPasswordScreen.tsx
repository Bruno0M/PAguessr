import { useState, type FormEvent } from 'react';
import { recoverPassword, type PublicUser } from '../../api/auth';
import { AuthError, AuthLayout } from './AuthLayout';

const PASSWORD_MIN_LENGTH = 6;

export function RecoverPasswordScreen({
  onSuccess,
  onGoToLogin,
}: {
  onSuccess: (user: PublicUser) => void;
  onGoToLogin: () => void;
}) {
  const [nick, setNick] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const { user } = await recoverPassword(nick, recoveryCode, newPassword);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível recuperar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe seu nick e o código de recuperação mostrado na criação da conta."
      onBack={onGoToLogin}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}
        <div className="auth-field">
          <label htmlFor="recover-nick">Nick</label>
          <input
            id="recover-nick"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="recover-code">Código de recuperação</label>
          <input
            id="recover-code"
            className="auth-input-code"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="recover-new-password">Nova senha</label>
          <input
            id="recover-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="recover-confirm-password">Confirmar nova senha</label>
          <input
            id="recover-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit" className="game-cta auth-submit" disabled={submitting}>
          {submitting ? 'Recuperando...' : 'Trocar senha e entrar'}
        </button>
        <div className="auth-links">
          <button type="button" onClick={onGoToLogin}>
            Voltar ao login
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
