export function TitleBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="title-back" onClick={onBack} autoFocus>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3 5 8l5 5" />
      </svg>
      Voltar
    </button>
  );
}
