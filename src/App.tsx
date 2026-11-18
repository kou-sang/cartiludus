// Shell del paso 1: sesión opcional + catálogo de contenido. El juego por cartas llega en el paso siguiente.
import { useEffect, useState } from 'react';
import type { ContentIndex } from '../shared/model';
import { Tex } from './components/Tex';
import { loadIndex } from './lib/content';
import { logOut, signIn, useUser } from './lib/auth';

export function App() {
  const { user, ready } = useUser();
  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-8 flex items-center justify-between border-b border-[var(--line)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Cartiludus</h1>
        {ready &&
          (user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[var(--muted)]">{user.displayName ?? user.email}</span>
              <button className="underline" onClick={() => void logOut()}>
                Salir
              </button>
            </div>
          ) : (
            <button className="rounded border border-[var(--line)] px-3 py-1 text-sm" onClick={() => void signIn()}>
              Ingresar con Google
            </button>
          ))}
      </header>

      {error && <p className="text-[var(--accent)]">{error}</p>}
      {!index && !error && <p className="text-[var(--muted)]">Cargando…</p>}

      {index?.subjects.map((subject) => (
        <section key={subject.id} className="mb-6">
          <h2 className="mb-2 text-lg font-medium">{subject.name}</h2>
          {subject.topics.map((topic) => (
            <div key={topic.id} className="mb-3 rounded border border-[var(--line)] bg-[var(--paper-2)] p-3">
              <h3 className="font-medium">{topic.name}</h3>
              <ul className="mt-1 text-sm text-[var(--muted)]">
                {topic.problems.map((p) => (
                  <li key={p.id}>
                    <Tex>{p.title}</Tex> · {p.steps} pasos
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <footer className="mt-10 text-xs text-[var(--muted)]">v{__APP_VERSION__}{!user && ready && ' · sin sesión: el progreso no se guarda'}</footer>
    </div>
  );
}
