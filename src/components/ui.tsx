import type { CSSProperties, ReactNode } from 'react';
import { linkTo } from '../lib/router';

export function Link({ to, className, style, children }: { to: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <a href={to} onClick={linkTo(to)} className={className} style={style}>
      {children}
    </a>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  title?: string;
}) {
  const base = 'rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
  const styles =
    variant === 'primary'
      ? 'bg-[var(--ink)] text-[var(--paper)] hover:opacity-85'
      : 'border border-[var(--line)] hover:bg-[var(--paper-2)]';
  return (
    <button type="button" className={`${base} ${styles}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Message({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return <p className={tone === 'error' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}>{children}</p>;
}

export function Dots({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span aria-label={`Dificultad ${n} de ${max}`} className="tracking-tight text-[var(--muted)]">
      {'●'.repeat(n)}
      <span className="opacity-30">{'●'.repeat(Math.max(0, max - n))}</span>
    </span>
  );
}

/** Grupo de opciones excluyentes (radio con aspecto de botones). */
export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
  render,
  disabled,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  render: (v: T) => ReactNode;
  disabled?: (v: T) => boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled?.(o)}
            onClick={() => onChange(o)}
            className={`rounded-md border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--line)] hover:border-[var(--ink)]'
            }`}
          >
            {render(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {children}
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </fieldset>
  );
}
