import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { CATEGORIES, CATEGORY_LABEL, type Problem } from '../../shared/model';
import { isFinished, isStepDone, newGame, reduce, shuffledOrder, stepResult, type GameAction, type GameState } from '../../shared/engine';
import {
  candidates,
  configFromQuery,
  effectiveStepLimit,
  pickProblems,
  stepLimitLabel,
  summarizeSession,
  type ProblemPick,
  type SessionConfig,
} from '../../shared/session';
import { Tex } from '../components/Tex';
import { Button, Link, Message } from '../components/ui';
import { loadIndex } from '../lib/content';
import { loadAggregates, saveSession } from '../lib/progress';
import { subjectPath } from '../lib/router';
import { errorMessage, loadProblems, useAsync } from '../lib/useContent';

const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------- Rutas ----------

/** /partida/<materia>?…: elige problemas al azar según la configuración. */
export function SessionFromConfig({ subject, search, user, ready }: { subject: string; search: string; user: User | null; ready: boolean }) {
  const config = useMemo(() => configFromQuery(subject, search), [subject, search]);
  const [round, setRound] = useState(0);
  const needsUser = config.mode === 'repaso';
  const state = useAsync(async () => {
    const index = await loadIndex();
    let review: Record<string, number> = {};
    if (needsUser) {
      if (!user) throw new Error('Ingresá para jugar el repaso de errores.');
      review = (await loadAggregates(user.uid))?.review ?? {};
    }
    const pool = candidates(index, config, review);
    if (pool.length === 0) throw new Error(needsUser ? 'No hay problemas para repasar en esas prácticas.' : 'No hay problemas con esa selección.');
    const picks = pickProblems(pool, config.count);
    return loadProblems(subject, picks);
  }, `${subject}${search}#${round}#${needsUser ? (user?.uid ?? (ready ? 'anon' : 'wait')) : ''}`);

  if (needsUser && !ready) return <Message>Cargando…</Message>;
  if (state.status === 'loading') return <Message>Barajando problemas…</Message>;
  if (state.status === 'error')
    return (
      <Message tone="error">
        {state.error}{' '}
        <Link to={subjectPath(subject)} className="underline">
          Volver a la configuración
        </Link>
      </Message>
    );
  return <Runner key={round} problems={state.data} config={config} user={user} onAgain={() => setRound((r) => r + 1)} />;
}

/** /jugar/<materia>/<tema>/<id>: un problema puntual. */
export function SessionSingle({ subject, topic, id, user }: { subject: string; topic: string; id: string; user: User | null }) {
  const config: SessionConfig = useMemo(
    () => ({ subject, topics: [topic], count: 1, stepLimit: 'contenido', totalMin: null, mode: 'nueva' }),
    [subject, topic],
  );
  const [round, setRound] = useState(0);
  const pick: ProblemPick[] = useMemo(() => [{ topic, id }], [topic, id]);
  const state = useAsync(() => loadProblems(subject, pick), `${subject}/${topic}/${id}`);
  if (state.status === 'loading') return <Message>Cargando…</Message>;
  if (state.status === 'error') return <Message tone="error">{state.error}</Message>;
  return <Runner key={`${id}#${round}`} problems={state.data} config={config} user={user} onAgain={() => setRound((r) => r + 1)} />;
}

// ---------- Partida ----------

function Runner({ problems, config, user, onAgain }: { problems: Problem[]; config: SessionConfig; user: User | null; onAgain: () => void }) {
  const [startedAt] = useState(() => Date.now());
  const [games, setGames] = useState<GameState[]>(() => problems.map((p) => newGame(p, startedAt)));
  const [current, setCurrent] = useState(0);
  const [ended, setEnded] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const orders = useMemo(() => problems.map((p) => p.steps.map((s) => shuffledOrder(s.cards.length))), [problems]);

  const problem = problems[current]!;
  const game = games[current]!;
  const problemDone = isFinished(problem, game);
  const isLast = current === problems.length - 1;

  const dispatch = useCallback(
    (a: GameAction) => setGames((gs) => gs.map((g, i) => (i === current ? reduce(problems[i]!, g, a) : g))),
    [current, problems],
  );

  /** Corta la partida: el paso en curso cuenta como fallado sólo si ya se interactuó con él. */
  const endNow = useCallback(() => {
    setGames((gs) =>
      gs.map((g, i) => {
        if (i !== current) return g;
        const st = g.steps[g.stepIndex]!;
        return !isStepDone(st) && (st.wrong.length > 0 || st.hintsShown > 0) ? reduce(problems[i]!, g, { type: 'timeout' }) : g;
      }),
    );
    setEnded(true);
  }, [current, problems]);

  const advance = () => {
    if (!problemDone) return;
    if (isLast) setEnded(true);
    else {
      setCurrent((c) => c + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const totalDeadline = config.totalMin !== null ? startedAt + config.totalMin * 60_000 : null;

  if (ended)
    return <SessionSummary problems={problems} games={games} config={config} user={user} startedAt={startedAt} onAgain={onAgain} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
        <span>
          <Link to={subjectPath(config.subject)} className="hover:underline">
            Configuración
          </Link>{' '}
          · Problema {current + 1} de {problems.length} · Paso: {stepLimitLabel(config.stepLimit).toLowerCase()}
        </span>
        <span className="flex items-center gap-3">
          {totalDeadline !== null && <Countdown deadline={totalDeadline} onExpire={endNow} label="Tiempo total" big />}
          {problems.length > 1 &&
            (confirmEnd ? (
              <span className="anim-reveal flex items-center gap-2">
                <button type="button" className="font-medium text-[var(--accent)] underline" onClick={endNow}>
                  Terminar ahora
                </button>
                <button type="button" className="underline" onClick={() => setConfirmEnd(false)}>
                  Seguir
                </button>
              </span>
            ) : (
              <button type="button" className="underline" onClick={() => setConfirmEnd(true)}>
                Terminar partida
              </button>
            ))}
        </span>
      </div>

      {problems.length > 1 && <SessionBar problems={problems} games={games} current={current} />}

      <ProblemPlayer
        key={current}
        problem={problem}
        game={game}
        orders={orders[current]!}
        config={config}
        dispatch={dispatch}
        onAdvance={advance}
        advanceLabel={isLast ? 'Ver resumen' : 'Siguiente problema'}
      />
    </div>
  );
}

function SessionBar({ problems, games, current }: { problems: Problem[]; games: GameState[]; current: number }) {
  return (
    <ol className="flex gap-1" aria-label="Problemas">
      {problems.map((p, i) => {
        const g = games[i]!;
        const done = isFinished(p, g);
        const perfect = done && g.steps.every((s) => stepResult(s).firstTry);
        const color = done ? (perfect ? 'bg-[var(--ok)]' : 'bg-[var(--muted)]') : i === current ? 'bg-[var(--ink)]' : 'bg-[var(--line)]';
        return <li key={p.id} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${color}`} title={`Problema ${i + 1}`} />;
      })}
    </ol>
  );
}

// ---------- Problema ----------

/** Enunciado original: cada línea es un párrafo; las que empiezan con "(a)", "i)", etc. se muestran como ítems. */
function Statement({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, i) => {
        const item = /^\s*(\([a-z]\)|[ivx]+\))\s/.test(line);
        return (
          <p key={i} className={item ? 'pl-5' : undefined}>
            <Tex>{line.trim()}</Tex>
          </p>
        );
      })}
    </div>
  );
}

function ProblemPlayer({
  problem,
  game,
  orders,
  config,
  dispatch,
  onAdvance,
  advanceLabel,
}: {
  problem: Problem;
  game: GameState;
  orders: number[][];
  config: SessionConfig;
  dispatch: (a: GameAction) => void;
  onAdvance: () => void;
  advanceLabel: string;
}) {
  const current = game.stepIndex;
  const [viewing, setViewing] = useState(current);
  const [showStatement, setShowStatement] = useState(true);
  const reviewing = viewing !== current;
  const step = problem.steps[viewing]!;
  const st = game.steps[viewing]!;
  const curSt = game.steps[current]!;
  const curDone = isStepDone(curSt);
  const finished = isFinished(problem, game);
  const order = orders[viewing]!;
  const limit = effectiveStepLimit(config, problem.steps[current]!.timeLimitSec);
  const score = game.steps.reduce((acc, s, i) => acc + (i <= current ? stepResult(s).score : 0), 0);
  const [deadline, setDeadline] = useState(() => (limit ? Date.now() + limit * 1000 : null));

  // Nuevo paso → nuevo plazo y se vuelve a mirar el paso actual.
  useEffect(() => {
    setDeadline(limit ? Date.now() + limit * 1000 : null);
    setViewing(current);
  }, [current, limit]);

  const goTo = (i: number) => {
    if (i >= 0 && i <= current) setViewing(i);
  };

  // Atajos: 1–4 elige carta, P pista, Enter siguiente, ← → recorre pasos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') return goTo(viewing - 1);
      if (e.key === 'ArrowRight') return goTo(viewing + 1);
      if (reviewing) return;
      const n = Number(e.key);
      if (n >= 1 && n <= order.length) dispatch({ type: 'pick', card: order[n - 1]! });
      else if (e.key === 'p' || e.key === 'P') dispatch({ type: 'hint' });
      else if (e.key === 'Enter' && curDone) finished ? onAdvance() : dispatch({ type: 'next' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const stepDone = isStepDone(st);

  return (
    <div className="space-y-6">
      <section className="anim-in rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              <Tex>{problem.title}</Tex>
            </h2>
            {problem.source && <p className="text-xs text-[var(--muted)]">{problem.source}</p>}
          </div>
          <button type="button" className="shrink-0 text-xs underline" onClick={() => setShowStatement((v) => !v)}>
            {showStatement ? 'Ocultar enunciado' : 'Ver enunciado'}
          </button>
        </div>
        {showStatement && <Statement text={problem.statement} />}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <ol className="flex flex-wrap gap-1.5" aria-label="Pasos">
          {problem.steps.map((s, i) => {
            const x = game.steps[i]!;
            const r = stepResult(x);
            const color = !isStepDone(x)
              ? i === current
                ? 'bg-[var(--ink)]'
                : 'bg-[var(--line)]'
              : r.firstTry
                ? 'bg-[var(--ok)]'
                : r.solved
                  ? 'bg-[var(--muted)]'
                  : 'bg-[var(--accent)]';
            const reachable = i <= current;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goTo(i)}
                  title={reachable ? `Ver paso ${i + 1}` : `Paso ${i + 1}`}
                  aria-current={i === viewing ? 'step' : undefined}
                  className={`block h-2 w-7 rounded-full transition-all duration-300 disabled:cursor-default ${color} ${
                    i === viewing ? 'ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--paper)]' : ''
                  }`}
                />
              </li>
            );
          })}
        </ol>
        <span className="flex items-center gap-3">
          {deadline !== null && <Countdown deadline={deadline} stopped={curDone} onExpire={() => dispatch({ type: 'timeout' })} label="Tiempo del paso" />}
          <span className="tabular-nums text-[var(--muted)]">
            Paso {current + 1}/{problem.steps.length} ·{' '}
            <span key={score} className="anim-pop inline-block">
              Puntaje {fmt(score)}
            </span>
          </span>
        </span>
      </div>

      {reviewing && (
        <div className="anim-reveal flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-[var(--ink)] px-3 py-2 text-sm">
          <span>
            Revisando el paso {viewing + 1}. El paso actual es el {current + 1}
            {deadline !== null && !curDone ? ' y su reloj sigue corriendo' : ''}.
          </span>
          <span className="flex gap-3">
            <button type="button" className="underline disabled:opacity-40" disabled={viewing === 0} onClick={() => goTo(viewing - 1)}>
              ← Anterior
            </button>
            <button type="button" className="font-medium underline" onClick={() => setViewing(current)}>
              Volver al paso actual
            </button>
          </span>
        </div>
      )}

      <section key={viewing} className="anim-in space-y-4">
        <h3 className="text-base font-medium leading-relaxed">
          {step.item && <span className="mr-2 rounded bg-[var(--ink)] px-1.5 py-0.5 text-xs text-[var(--paper)]">Ítem {step.item}</span>}
          <Tex>{step.prompt}</Tex>
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          {order.map((cardIndex, pos) => {
            const card = step.cards[cardIndex]!;
            const wrongPicked = st.wrong.includes(cardIndex);
            const rightPicked = st.solvedWith === cardIndex;
            // Se revela la correcta sólo al resolver el paso o al agotarse su tiempo, nunca por errar.
            const state: CardState = wrongPicked ? 'wrong' : rightPicked ? 'right' : stepDone ? (card.correct ? 'revealed-right' : 'revealed') : 'idle';
            return (
              <CardView
                key={cardIndex}
                n={pos + 1}
                delay={reviewing ? 0 : pos * 60}
                text={card.text}
                explanation={card.explanation}
                correct={card.correct}
                state={state}
                disabled={reviewing || stepDone || wrongPicked}
                onPick={() => dispatch({ type: 'pick', card: cardIndex })}
              />
            );
          })}
        </div>

        {st.hintsShown > 0 && (
          <ol className="space-y-2">
            {step.hints.slice(0, st.hintsShown).map((h, i) => (
              <li key={i} className="anim-reveal rounded-md border border-dashed border-[var(--line)] px-3 py-2 text-sm">
                <span className="font-medium">Pista {i + 1}: </span>
                <Tex>{h}</Tex>
              </li>
            ))}
          </ol>
        )}

        {!reviewing && (
          <div className="flex flex-wrap items-center gap-3">
            {!stepDone && (
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: 'hint' })}
                disabled={st.hintsShown >= step.hints.length}
                title="Pedir una pista: el acierto pasa a valer 0 (tecla P)"
              >
                {st.hintsShown >= step.hints.length
                  ? 'Sin más pistas'
                  : st.hintsShown === 0
                    ? `Pedir pista (${step.hints.length})`
                    : `Otra pista (${st.hintsShown}/${step.hints.length})`}
              </Button>
            )}
            {stepDone && !finished && (
              <Button onClick={() => dispatch({ type: 'next' })} title="Enter">
                Siguiente paso
              </Button>
            )}
            {finished && (
              <Button onClick={onAdvance} title="Enter">
                {advanceLabel}
              </Button>
            )}
            {current > 0 && (
              <button type="button" className="text-sm underline" onClick={() => goTo(current - 1)} title="Flecha izquierda">
                ← Revisar pasos anteriores
              </button>
            )}
            <StepVerdict state={st} />
          </div>
        )}
      </section>
    </div>
  );
}

type CardState = 'idle' | 'wrong' | 'right' | 'revealed' | 'revealed-right';

function CardView(props: {
  n: number;
  delay: number;
  text: string;
  explanation: string;
  correct: boolean;
  state: CardState;
  disabled: boolean;
  onPick: () => void;
}) {
  const { n, delay, text, explanation, correct, state, disabled, onPick } = props;
  const tone: Record<CardState, string> = {
    idle: 'lift border-[var(--line)] hover:border-[var(--ink)]',
    wrong: 'anim-shake border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]',
    right: 'anim-pop border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]',
    'revealed-right': 'border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]',
    revealed: 'border-[var(--line)] opacity-70',
  };
  return (
    <div className="card-deal" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-pressed={state === 'wrong' || state === 'right'}
        className={`flex h-full min-h-24 w-full flex-col gap-2 rounded-lg border-2 bg-[var(--paper)] p-3 text-left transition-colors duration-200 disabled:cursor-default ${tone[state]}`}
      >
        <span className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded border border-[var(--line)] px-1.5 text-xs text-[var(--muted)]">{n}</span>
          <span className="leading-relaxed">
            <Tex>{text}</Tex>
          </span>
        </span>
        {state !== 'idle' && (
          <span className="anim-reveal border-t border-[var(--line)] pt-2 text-sm text-[var(--muted)]">
            <span className={`font-medium ${correct ? 'text-[var(--ok)]' : 'text-[var(--accent)]'}`}>{correct ? 'Correcta. ' : 'Incorrecta. '}</span>
            <Tex>{explanation}</Tex>
          </span>
        )}
      </button>
    </div>
  );
}

function StepVerdict({ state }: { state: GameState['steps'][number] }) {
  if (!isStepDone(state))
    return state.wrong.length > 0 ? (
      <span key={state.wrong.length} className="anim-pop text-sm text-[var(--accent)]">
        −{state.wrong.length}
      </span>
    ) : null;
  const r = stepResult(state);
  const label = state.timedOut ? 'Tiempo agotado' : r.firstTry ? '¡A la primera!' : state.hintsShown > 0 && state.wrong.length === 0 ? 'Con pista' : 'Resuelto';
  return (
    <span className={`anim-pop text-sm font-medium ${r.score > 0 ? 'text-[var(--ok)]' : r.score < 0 ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
      {label} · {fmt(r.score)}
    </span>
  );
}

function Countdown({ deadline, stopped, onExpire, label, big }: { deadline: number; stopped?: boolean; onExpire: () => void; label: string; big?: boolean }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - Date.now()));
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    if (stopped) return;
    const tick = () => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        expire.current();
      }
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [deadline, stopped]);

  const s = Math.ceil(left / 1000);
  const urgent = !stopped && left < (big ? 60_000 : 15_000);
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 font-mono tabular-nums ${big ? 'text-base' : 'text-sm'} ${
        urgent ? 'anim-pulse border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)]'
      }`}
      title={label}
      aria-label={label}
    >
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

// ---------- Resumen ----------

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; error: string };

function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setV(target);
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function SessionSummary({
  problems,
  games,
  config,
  user,
  startedAt,
  onAgain,
}: {
  problems: Problem[];
  games: GameState[];
  config: SessionConfig;
  user: User | null;
  startedAt: number;
  onAgain: () => void;
}) {
  const summary = useMemo(() => summarizeSession(problems.map((problem, i) => ({ problem, game: games[i]! }))), [problems, games]);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const saved = useRef(false);
  const shown = useCountUp(summary.score);
  const titles = useMemo(() => new Map(problems.map((p) => [p.id, p.title])), [problems]);

  useEffect(() => {
    if (!user || saved.current || summary.steps === 0) return;
    saved.current = true;
    setSave({ status: 'saving' });
    saveSession(user.uid, config, summary, startedAt).then(
      () => setSave({ status: 'saved' }),
      (e: unknown) => setSave({ status: 'error', error: errorMessage(e) }),
    );
  }, [user, config, summary, startedAt]);

  return (
    <section className="anim-in space-y-5 rounded-xl border-2 border-[var(--ink)] p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Resumen de la partida</h2>
        <span className="text-3xl font-semibold tabular-nums">{fmt(shown)}</span>
      </div>

      {summary.steps === 0 ? (
        <Message>No se jugó ningún paso.</Message>
      ) : (
        <>
          <p className="text-sm text-[var(--muted)]">
            {summary.firstTry}/{summary.steps} pasos a la primera · {plural(summary.hintsUsed, 'pista', 'pistas')} ·{' '}
            {plural(summary.timeouts, 'tiempo agotado', 'tiempos agotados')}
          </p>
          <div className="anim-grow h-2 overflow-hidden rounded-full bg-[var(--line)]">
            <div className="h-full bg-[var(--ok)]" style={{ width: `${(100 * summary.firstTry) / summary.steps}%` }} />
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="py-1 font-normal">Problema</th>
                <th className="py-1 text-right font-normal">A la primera</th>
                <th className="py-1 text-right font-normal">Puntaje</th>
              </tr>
            </thead>
            <tbody>
              {summary.problems.map((p, i) => (
                <tr key={p.id} className="anim-in border-t border-[var(--line)]" style={{ animationDelay: `${150 + i * 60}ms` }}>
                  <td className="py-1.5">
                    <Tex>{titles.get(p.id) ?? p.id}</Tex>
                    {!p.complete && <span className="ml-2 text-xs text-[var(--muted)]">(incompleto)</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {p.firstTry}/{p.steps}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(p.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="py-1 font-normal">Categoría</th>
                <th className="py-1 text-right font-normal">A la primera</th>
                <th className="py-1 text-right font-normal">Puntaje</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.filter((c) => summary.byCategory[c]).map((c) => {
                const s = summary.byCategory[c]!;
                return (
                  <tr key={c} className="border-t border-[var(--line)]">
                    <td className="py-1">{CATEGORY_LABEL[c]}</td>
                    <td className="py-1 text-right tabular-nums">
                      {s.firstTry}/{s.steps}
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmt(s.score)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <p className="text-sm">
        {!user && <span className="text-[var(--muted)]">Sin sesión: el progreso no se guarda.</span>}
        {save.status === 'saving' && <span className="text-[var(--muted)]">Guardando…</span>}
        {save.status === 'saved' && <span className="anim-reveal text-[var(--ok)]">Guardado en tu historial.</span>}
        {save.status === 'error' && <span className="text-[var(--accent)]">No se pudo guardar: {save.error}</span>}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onAgain}>Otra partida igual</Button>
        <Link to={subjectPath(config.subject)} className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-[var(--paper-2)]">
          Cambiar configuración
        </Link>
        {user && (
          <Link to="/historial" className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-[var(--paper-2)]">
            Historial
          </Link>
        )}
      </div>
    </section>
  );
}
