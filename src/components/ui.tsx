import type { ReactNode } from 'react';
import { linkTo } from '../lib/router';

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a href={to} onClick={linkTo(to)} className={className}>
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
