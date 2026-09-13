import { AVATAR_COUNT } from '@paguessr/shared';
import { AvatarSvg } from './avatars';
import './AvatarPicker.css';

export function AvatarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (id: number) => void;
}) {
  const options = Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1);

  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Escolha um avatar">
      {options.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={`avatar-option${value === id ? ' selected' : ''}`}
          onClick={() => onChange(id)}
        >
          <AvatarSvg id={id} />
        </button>
      ))}
    </div>
  );
}
