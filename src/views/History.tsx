import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { CATEGORIES, CATEGORY_LABEL } from '../../shared/model';
import type { UserAggregates } from '../../shared/session';
import { Tex } from '../components/Tex';
import { Button, Link, Message } from '../components/ui';
import { signIn } from '../lib/auth';
import { loadAggregates, loadHistory, type SessionDoc } from '../lib/progress';
import { playPath, sessionPath } from '../lib/router';
import { errorMessage, useIndex } from '../lib/useContent';

const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null);

export function History({ user, ready }: { user: User | null; ready: boolean }) {
  if (!ready) return <Message>Cargando…</Message>;
  if (!user)
    return (
      <div className="anim-in space-y-3">
        <Message>Ingresá para ver tu historial. Sin sesión se puede jugar, pero el progreso no se guarda.</Message>
        <Button onClick={() => void signIn()}>Ingresar con Google</Button>
      </div>
    );
  return <HistoryFor uid={user.uid} />;
}

type Item = SessionDoc & { id: string };

function HistoryFor({ uid }: { uid: string }) {
  const index = useIndex();
  const [agg, setAgg] = useState<UserAggregates | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const lookup = useMemo(() => {
    const problems = new Map<string, { title: string; path: string }>();
    const topics = new Map<string, { name: string; subject: string; order: number }>();
    if (index.status === 'ok')
      for (const s of index.data.subjects)
        s.topics.forEach((t, i) => {
          topics.set(t.id, { name: t.name, subject: s.id, order: i });
          for (const p of t.problems) problems.set(p.id, { title: p.title, path: playPath(s.id, t.id, p.id) });
        });
    return { problems, topics };
  }, [index]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadAggregates(uid), loadHistory(uid)]).then(
      ([a, h]) => {
        if (!alive) return;
        setAgg(a);
        setItems(h.items);
        setCursor(h.cursor);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setError(errorMessage(e));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [uid]);

  const more = () => {
    if (!cursor) return;
    setLoading(true);
    loadHistory(uid, cursor).then(
      (h) => {
        setItems((prev) => [...prev, ...h.items]);
        setCursor(h.cursor);
        setLoading(false);
      },
      (e: unknown) => {
        setError(errorMessage(e));
        setLoading(false);
      },
    );
  };

  if (error) return <Message tone="error">{error}</Message>;
  if (agg === undefined) return <Message>Cargando…</Message>;
  if (agg === null) return <Message>Todavía no jugaste ninguna partida con sesión iniciada.</Message>;

  const reviewIds = Object.keys(agg.progress).filter((id) => (agg.progress[id]?.rev.length ?? 0) > 0);
  const reviewSteps = reviewIds.reduce((n, id) => n + (agg.progress[id]?.rev.length ?? 0), 0);
  const topicRows = Object.entries(agg.byTopic).sort(
    ([a], [b]) => (lookup.topics.get(a)?.order ?? 99) - (lookup.topics.get(b)?.order ?? 99),
  );
  const reviewSubject = reviewIds.length ? lookup.topics.get(topicRows[0]?.[0] ?? '')?.subject : undefined;
  const firstPct = pct(agg.firstTry, agg.steps);

  return (
    <div className="anim-in space-y-8">
      <section className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <Stat label="Partidas" value={String(agg.played)} delay={0} />
        <Stat label="Puntaje total" value={fmt(agg.score)} delay={60} />
        <Stat label="A la primera" value={firstPct === null ? '—' : `${firstPct} %`} delay={120} />
        <Stat label="Pasos a repasar" value={String(reviewSteps)} delay={180} />
      </section>

      {reviewIds.length > 0 && reviewSubject && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--line)] px-4 py-3 text-sm">
          <span>
            Tenés {reviewSteps} {reviewSteps === 1 ? 'paso' : 'pasos'} para repasar en {reviewIds.length}{' '}
            {reviewIds.length === 1 ? 'problema' : 'problemas'}.
          </span>
          <Link
            to={sessionPath(reviewSubject, `n=${Math.min(10, reviewIds.length)}&paso=contenido&modo=repaso`)}
            className="rounded-md bg-[var(--ink)] px-3 py-1.5 font-medium text-[var(--paper)] hover:opacity-85"
          >
            Repasar errores
          </Link>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Por práctica</h2>
        <div className="space-y-3">
          {topicRows.map(([id, s], i) => {
            const p = pct(s.firstTry, s.steps) ?? 0;
            return (
              <div key={id} className="anim-in text-sm" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="mb-1 flex justify-between gap-3">
                  <span>{lookup.topics.get(id)?.name ?? id}</span>
                  <span className="shrink-0 tabular-nums text-[var(--muted)]">
                    {s.problems} problemas · {p} % a la primera · {fmt(s.score)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                  <div className="anim-grow h-full bg-[var(--ok)]" style={{ width: `${p}%`, animationDelay: `${i * 50}ms` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Por categoría</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr>
              <th className="py-1 font-normal">Categoría</th>
              <th className="py-1 text-right font-normal">Pasos</th>
              <th className="py-1 text-right font-normal">A la primera</th>
              <th className="py-1 text-right font-normal">Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const s = agg.byCategory[c];
              const p = s ? pct(s.firstTry, s.steps) : null;
              return (
                <tr key={c} className="border-t border-[var(--line)]">
                  <td className="py-1">{CATEGORY_LABEL[c]}</td>
                  <td className="py-1 text-right tabular-nums">{s?.steps ?? 0}</td>
                  <td className="py-1 text-right tabular-nums">{p === null ? '—' : `${p} %`}</td>
                  <td className="py-1 text-right tabular-nums">{s ? fmt(s.score) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Partidas</h2>
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)]">
          {items.map((it) => {
            const isOpen = open === it.id;
            const topicLabel = it.topics.map((t) => (lookup.topics.get(t)?.name ?? t).split(' · ')[0]).join(', ');
            return (
              <li key={it.id} className="text-sm">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : it.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--paper-2)]"
                >
                  <span className="min-w-0">
                    <span className="block">
                      {it.problems.length} {it.problems.length === 1 ? 'problema' : 'problemas'}
                      {it.config.mode === 'repaso' && ' · repaso'} · {topicLabel}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      {it.finishedAt?.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · {it.firstTry}/{it.steps} a la
                      primera
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {fmt(it.score)} <span className="text-[var(--muted)]">{isOpen ? '▴' : '▾'}</span>
                  </span>
                </button>
                {isOpen && (
                  <ul className="anim-reveal space-y-1 bg-[var(--paper-2)] px-4 py-2">
                    {it.problems.map((p) => {
                      const ref = lookup.problems.get(p.id);
                      return (
                        <li key={p.id} className="flex justify-between gap-3">
                          {ref ? (
                            <Link to={ref.path} className="hover:underline">
                              <Tex>{ref.title}</Tex>
                            </Link>
                          ) : (
                            <span>{p.id}</span>
                          )}
                          <span className="shrink-0 tabular-nums text-[var(--muted)]">
                            {p.firstTry}/{p.steps} · {fmt(p.score)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          {cursor && (
            <Button variant="ghost" onClick={more} disabled={loading}>
              {loading ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div className="card-deal rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}
