import { useState } from 'react';
import { Tex } from '../components/Tex';
import { Dots, Link, Message } from '../components/ui';
import { playPath } from '../lib/router';
import { useIndex } from '../lib/useContent';

export function Catalog() {
  const index = useIndex();
  const [open, setOpen] = useState<string | null>(null);

  if (index.status === 'loading') return <Message>Cargando…</Message>;
  if (index.status === 'error') return <Message tone="error">{index.error}</Message>;

  return (
    <div className="space-y-8">
      {index.data.subjects.map((subject) => (
        <section key={subject.id}>
          <h2 className="mb-3 text-lg font-semibold">{subject.name}</h2>
          <div className="space-y-2">
            {subject.topics.map((topic) => {
              const isOpen = open === topic.id;
              return (
                <div key={topic.id} className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)]">
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
                    <ul className="border-t border-[var(--line)]">
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
                              <span>{p.steps} pasos</span>
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
