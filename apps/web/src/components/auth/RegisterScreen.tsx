import { useState, type FormEvent } from 'react';
import { NICK_MAX_LENGTH, NICK_MIN_LENGTH, isValidNickFormat } from '@paguessr/shared';
import { register, type PublicUser } from '../../api/auth';
import { AuthLayout } from './AuthLayout';
import { AvatarPicker } from './AvatarPicker';

const PASSWORD_MIN_LENGTH = 6;

export function RegisterScreen({
  onSuccess,
  onGoToLogin,
}: {
  onSuccess: (user: PublicUser, recoveryCode: string) => void;
  onGoToLogin: () => void;
}) {
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarId, setAvatarId] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isValidNickFormat(nick)) {
      setError(
        `O nick precisa ter entre ${NICK_MIN_LENGTH} e ${NICK_MAX_LENGTH} caracteres, só letras, números e "_".`
      );
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const { user, recoveryCode } = await register(nick, password, avatarId);
      onSuccess(user, recoveryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Criar conta" subtitle="Escolha um nick e um avatar pra começar a jogar.">
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}
        <div className="auth-field">
          <label htmlFor="register-nick">Nick</label>
          <input
            id="register-nick"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            minLength={NICK_MIN_LENGTH}
            maxLength={NICK_MAX_LENGTH}
            autoComplete="username"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="register-password">Senha</label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="register-confirm-password">Confirmar senha</label>
          <input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="auth-field">
          <label>Avatar</label>
          <AvatarPicker value={avatarId} onChange={setAvatarId} />
        </div>
        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Criando conta...' : 'Criar conta'}
        </button>
        <div className="auth-links">
          <button type="button" onClick={onGoToLogin}>
            Já tenho conta
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
