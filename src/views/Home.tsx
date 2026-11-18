import { Link, Message } from '../components/ui';
import { subjectPath } from '../lib/router';
import { useIndex } from '../lib/useContent';

const SOON = ['Estadística', 'Análisis Real'];

export function Home() {
  const index = useIndex();
  if (index.status === 'loading') return <Message>Cargando…</Message>;
  if (index.status === 'error') return <Message tone="error">{index.error}</Message>;
  const subjects = index.data.subjects;

  return (
    <div className="space-y-6">
      <div className="anim-in">
        <h2 className="text-xl font-semibold">Elegí la materia</h2>
        <p className="text-sm text-[var(--muted)]">Después configurás prácticas, cantidad de problemas y tiempos.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {subjects.map((s, i) => {
          const problems = s.topics.reduce((n, t) => n + t.problems.length, 0);
          return (
            <Link
              key={s.id}
              to={subjectPath(s.id)}
              className="lift card-deal block rounded-xl border-2 border-[var(--line)] bg-[var(--paper-2)] p-5 hover:border-[var(--ink)]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="block text-lg font-semibold">
                {s.name}
              </span>
              <span className="mt-1 block text-sm text-[var(--muted)]">
                {s.topics.length} prácticas · {problems} problemas
              </span>
            </Link>
          );
        })}
        {SOON.map((name, i) => (
          <div
            key={name}
            className="card-deal rounded-xl border-2 border-dashed border-[var(--line)] p-5 opacity-60"
            style={{ animationDelay: `${(subjects.length + i) * 70}ms` }}
          >
            <span className="block text-lg font-semibold">{name}</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">Próximamente</span>
          </div>
        ))}
      </div>
    </div>
  );
}
