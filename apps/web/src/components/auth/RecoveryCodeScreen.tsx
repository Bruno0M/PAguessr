import { useState } from 'react';
import { AuthLayout } from './AuthLayout';
import './RecoveryCodeScreen.css';

export function RecoveryCodeScreen({
  recoveryCode,
  onContinue,
}: {
  recoveryCode: string;
  onContinue: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de clipboard: sem problema, o código já está visível na tela.
    }
  };

  return (
    <AuthLayout
      title="Guarde seu código de recuperação"
      subtitle="Esse código só aparece uma vez. Se você esquecer a senha, é ele que permite criar uma nova — sem ele, a única saída é criar outra conta."
    >
      <div className="recovery-code-box">
        <span className="recovery-code-value">{recoveryCode}</span>
        <button type="button" className="recovery-copy-btn" onClick={handleCopy}>
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <label className="recovery-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Eu salvei meu código de recuperação em um lugar seguro.
      </label>
      <button type="button" className="auth-submit" disabled={!confirmed} onClick={onContinue}>
        Continuar
      </button>
    </AuthLayout>
  );
}
