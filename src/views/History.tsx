import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { CATEGORIES, CATEGORY_LABEL } from '../../shared/model';
import type { UserAggregates } from '../../shared/engine';
import { Tex } from '../components/Tex';
import { Button, Link, Message } from '../components/ui';
import { signIn } from '../lib/auth';
import { loadAggregates, loadHistory, type SessionDoc } from '../lib/progress';
import { playPath } from '../lib/router';
import { useIndex } from '../lib/useContent';

const fmtScore = (n: number) => (n > 0 ? `+${n}` : String(n));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : '—');

export function History({ user, ready }: { user: User | null; ready: boolean }) {
  if (!ready) return <Message>Cargando…</Message>;
  if (!user)
    return (
      <div className="space-y-3">
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

  const titles = useMemo(() => {
    const map = new Map<string, { title: string; path: string }>();
    if (index.status === 'ok')
      for (const s of index.data.subjects)
        for (const t of s.topics) for (const p of t.problems) map.set(p.id, { title: p.title, path: playPath(s.id, t.id, p.id) });
    return map;
  }, [index]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

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
      (e: unknown) => alive && (fail(e), setLoading(false)),
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
      (e: unknown) => (fail(e), setLoading(false)),
    );
  };

  if (error) return <Message tone="error">{error}</Message>;
  if (agg === undefined) return <Message>Cargando…</Message>;
  if (agg === null) return <Message>Todavía no jugaste ninguna partida con sesión iniciada.</Message>;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Partidas" value={String(agg.played)} />
        <Stat label="Puntaje total" value={fmtScore(agg.score)} />
        <Stat label="A la primera" value={pct(agg.firstTry, agg.steps)} />
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
              return (
                <tr key={c} className="border-t border-[var(--line)]">
                  <td className="py-1">{CATEGORY_LABEL[c]}</td>
                  <td className="py-1 text-right tabular-nums">{s?.steps ?? 0}</td>
                  <td className="py-1 text-right tabular-nums">{s ? pct(s.firstTry, s.steps) : '—'}</td>
                  <td className="py-1 text-right tabular-nums">{s ? fmtScore(s.score) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Partidas</h2>
        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
          {items.map((it) => {
            const ref = titles.get(it.problemId);
            return (
              <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  {ref ? (
                    <Link to={ref.path} className="hover:underline">
                      <Tex>{ref.title}</Tex>
                    </Link>
                  ) : (
                    it.problemId
                  )}
                  <span className="block text-xs text-[var(--muted)]">
                    {it.finishedAt?.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · {it.firstTry}/{it.steps} a
                    la primera
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{fmtScore(it.score)}</span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}
