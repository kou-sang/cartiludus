import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { problemStatus, type Progress } from '../../shared/session';
import { loadAggregates } from '../lib/progress';
import { Tex } from '../components/Tex';
import { Dots, Link, Message } from '../components/ui';
import { playPath, subjectPath } from '../lib/router';
import { useIndex } from '../lib/useContent';

export function Catalog({ subject: subjectId, user }: { subject: string; user: User | null }) {
  const index = useIndex();
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    if (!user) return setProgress({});
    loadAggregates(user.uid).then(
      (a) => setProgress(a?.progress ?? {}),
      () => setProgress({}),
    );
  }, [user]);

  if (index.status === 'loading') return <Message>Cargando…</Message>;
  if (index.status === 'error') return <Message tone="error">{index.error}</Message>;

  const subject = index.data.subjects.find((s) => s.id === subjectId);
  if (!subject) return <Message tone="error">Materia no encontrada.</Message>;

  return (
    <div className="anim-in space-y-8">
      {[subject].map((subject) => (
        <section key={subject.id}>
          <div className="text-sm text-[var(--muted)]">
            <Link to={subjectPath(subject.id)} className="hover:underline">
              Configurar partida
            </Link>
          </div>
          <h2 className="mb-1 text-lg font-semibold">{subject.name} · todos los problemas</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Jugá un problema puntual con los tiempos del contenido.</p>
          <div className="space-y-2">
            {subject.topics.map((topic) => {
              const isOpen = open === topic.id;
              return (
                <div key={topic.id} className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--paper-2)]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : topic.id)}
                  >
                    <span className="font-medium">{topic.name}</span>
                    <span className="text-sm text-[var(--muted)]">
                      {topic.problems.length} problemas {isOpen ? '▴' : '▾'}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="anim-reveal border-t border-[var(--line)]">
                      {topic.problems.map((p) => (
                        <li key={p.id}>
                          <Link
                            to={playPath(subject.id, topic.id, p.id)}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--paper)]"
                          >
                            <span>
                              <Tex>{p.title}</Tex>
                            </span>
                            <span className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">
                              {p.difficulty !== undefined && <Dots n={p.difficulty} />}
                              <StatusBadge {...problemStatus(progress, p.id, p.version, p.steps)} steps={p.steps} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatusBadge({ done, rev, complete, steps }: { done: number; rev: number; complete: boolean; steps: number }) {
  if (complete)
    return (
      <span className="text-[var(--ok)]" title={rev ? `${rev} pasos para repasar` : 'Resuelto'}>
        ✓ resuelto{rev ? ` · ${rev} a repasar` : ''}
      </span>
    );
  if (done > 0)
    return (
      <span title="Pasos resueltos">
        {done}/{steps} pasos
      </span>
    );
  return <span>{steps} pasos</span>;
}
