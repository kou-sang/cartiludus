import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  candidates,
  configToQuery,
  COUNT_OPTIONS,
  DEFAULT_CONFIG,
  STEP_LIMIT_OPTIONS,
  stepLimitLabel,
  TOTAL_OPTIONS,
  type Mode,
  type Progress,
  type SessionConfig,
} from '../../shared/session';
import { Button, Field, Link, Message, Segmented } from '../components/ui';
import { loadAggregates } from '../lib/progress';
import { catalogPath, navigate, sessionPath } from '../lib/router';
import { useIndex } from '../lib/useContent';

const storeKey = (subject: string) => `cartiludus.config.${subject}`;

function loadStored(subject: string): Partial<SessionConfig> {
  try {
    return JSON.parse(localStorage.getItem(storeKey(subject)) ?? '{}') as Partial<SessionConfig>;
  } catch {
    return {};
  }
}

export function Setup({ subject, user }: { subject: string; user: User | null }) {
  const index = useIndex();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [config, setConfig] = useState<SessionConfig | null>(null);

  const meta = index.status === 'ok' ? index.data.subjects.find((s) => s.id === subject) : undefined;

  // Config inicial: la última usada (si sigue siendo válida) o la de por defecto.
  useEffect(() => {
    if (!meta || config) return;
    const all = meta.topics.map((t) => t.id);
    const stored = loadStored(subject);
    const topics = (stored.topics ?? all).filter((t) => all.includes(t));
    setConfig({ ...DEFAULT_CONFIG(subject, all), ...stored, subject, topics: topics.length ? topics : all, mode: 'nueva' });
  }, [meta, subject, config]);

  useEffect(() => {
    if (!user) return setProgress(null);
    loadAggregates(user.uid).then(
      (a) => setProgress(a?.progress ?? {}),
      () => setProgress({}),
    );
  }, [user]);

  const pool = useMemo(
    () => (index.status === 'ok' && config ? candidates(index.data, config, progress ?? {}) : []),
    [index, config, progress],
  );
  const reviewCount = useMemo(
    () => (index.status === 'ok' && config ? candidates(index.data, { ...config, mode: 'repaso' }, progress ?? {}).length : 0),
    [index, config, progress],
  );

  if (index.status === 'loading' || (meta && !config)) return <Message>Cargando…</Message>;
  if (index.status === 'error') return <Message tone="error">{index.error}</Message>;
  if (!meta || !config) return <Message tone="error">Materia no encontrada.</Message>;

  const set = (patch: Partial<SessionConfig>) => setConfig({ ...config, ...patch });
  const toggleTopic = (id: string) =>
    set({ topics: config.topics.includes(id) ? config.topics.filter((t) => t !== id) : meta.topics.map((t) => t.id).filter((t) => t === id || config.topics.includes(t)) });

  const count = Math.min(config.count, pool.length);
  const canStart = pool.length > 0 && config.topics.length > 0;

  const start = () => {
    const final = { ...config, count };
    try {
      localStorage.setItem(storeKey(subject), JSON.stringify({ topics: final.topics, count: config.count, stepLimit: final.stepLimit, totalMin: final.totalMin }));
    } catch {
      /* almacenamiento no disponible */
    }
    navigate(sessionPath(subject, configToQuery(final)));
  };

  return (
    <div className="anim-in space-y-7">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">
            <Link to="/" className="hover:underline">
              Materias
            </Link>
          </div>
          <h2 className="text-xl font-semibold">{meta.name}</h2>
        </div>
        <Link to={catalogPath(subject)} className="text-sm underline">
          Ver todos los problemas
        </Link>
      </div>

      <Field
        label="Modo"
        hint={
          config.mode === 'repaso'
            ? 'Sólo los pasos que resolviste con errores, pista o fuera de tiempo. Salen del repaso al resolverlos a la primera.'
            : !user
              ? 'Ingresá para guardar tu avance y habilitar el repaso de errores.'
              : 'Los pasos que ya resolviste no se repiten: los problemas a medias continúan donde quedaron.'
        }
      >
        <Segmented<Mode>
          label="Modo"
          options={['nueva', 'repaso']}
          value={config.mode}
          onChange={(mode) => set({ mode })}
          disabled={(m) => m === 'repaso' && (!user || reviewCount === 0)}
          render={(m) => (m === 'nueva' ? 'Partida nueva' : `Repaso de errores${user && progress ? ` (${reviewCount})` : ''}`)}
        />
      </Field>

      <Field label="Prácticas">
        <div className="mb-2 flex gap-3 text-xs">
          <button type="button" className="underline" onClick={() => set({ topics: meta.topics.map((t) => t.id) })}>
            Todas
          </button>
          <button type="button" className="underline" onClick={() => set({ topics: [] })}>
            Ninguna
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {meta.topics.map((t) => {
            const on = config.topics.includes(t.id);
            return (
              <label
                key={t.id}
                className={`lift flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 text-sm ${on ? 'border-[var(--ink)]' : 'border-[var(--line)] opacity-70'}`}
              >
                <input type="checkbox" checked={on} onChange={() => toggleTopic(t.id)} className="accent-[var(--ink)]" />
                <span className="flex-1">{t.name}</span>
                <span className="text-xs text-[var(--muted)]">{t.problems.length}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <Field label="Cantidad de problemas" hint={`${pool.length} ${config.mode === 'repaso' ? 'con pasos para repasar' : user ? 'con pasos sin resolver' : 'disponibles'} con esta selección.`}>
        <Segmented<number>
          label="Cantidad de problemas"
          options={COUNT_OPTIONS}
          value={config.count}
          onChange={(c) => set({ count: c })}
          render={(c) => String(c)}
        />
      </Field>

      <Field label="Límite por paso" hint="Al agotarse, el paso cuenta −1 y se revela la respuesta.">
        <Segmented
          label="Límite por paso"
          options={STEP_LIMIT_OPTIONS}
          value={config.stepLimit}
          onChange={(stepLimit) => set({ stepLimit })}
          render={stepLimitLabel}
        />
      </Field>

      <Field label="Tiempo total" hint="Al agotarse, la partida termina con los pasos jugados hasta ese momento.">
        <Segmented
          label="Tiempo total"
          options={TOTAL_OPTIONS}
          value={config.totalMin}
          onChange={(totalMin) => set({ totalMin })}
          render={(m) => (m === null ? 'Sin límite' : `${m} min`)}
        />
      </Field>

      <div className="flex items-center gap-4 border-t border-[var(--line)] pt-5">
        <Button onClick={start} disabled={!canStart}>
          Comenzar · {count} {count === 1 ? 'problema' : 'problemas'}
        </Button>
        {!user && <span className="text-xs text-[var(--muted)]">Sin sesión: el progreso no se guarda.</span>}
      </div>
    </div>
  );
}
