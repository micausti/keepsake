import type { SizeOption } from '../domain/sizes.ts';

interface Props {
  id: string;
  label: string;
  options: readonly SizeOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SizeSelect({ id, label, options, value, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
