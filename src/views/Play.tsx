import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { CATEGORIES, CATEGORY_LABEL, type Problem } from '../../shared/model';
import {
  isFinished,
  isStepDone,
  newGame,
  reduce,
  shuffledOrder,
  stepResult,
  summarize,
  type GameAction,
  type GameState,
} from '../../shared/engine';
import { Tex } from '../components/Tex';
import { Button, Link, Message } from '../components/ui';
import { saveSession } from '../lib/progress';
import { playPath } from '../lib/router';
import { useProblem, type ProblemRef } from '../lib/useContent';

export function Play({ subject, topic, id, user }: { subject: string; topic: string; id: string; user: User | null }) {
  const ref = useProblem(subject, topic, id);
  if (ref.status === 'loading') return <Message>Cargando…</Message>;
  if (ref.status === 'error') return <Message tone="error">{ref.error}</Message>;
  // `key` reinicia la partida al cambiar de problema.
  return <Game key={ref.data.problem.id} data={ref.data} subject={subject} topic={topic} user={user} />;
}

type Action = GameAction | { type: 'reset'; problem: Problem };

function Game({ data, subject, topic, user }: { data: ProblemRef; subject: string; topic: string; user: User | null }) {
  const { problem, siblings, topicName } = data;
  const [round, setRound] = useState(0);
  const [state, dispatch] = useReducer(
    (s: GameState, a: Action) => (a.type === 'reset' ? newGame(a.problem, Date.now()) : reduce(problem, s, a)),
    problem,
    (p) => newGame(p, Date.now()),
  );
  // Orden de cartas: nuevo en cada partida.
  const orders = useMemo(() => problem.steps.map((s) => shuffledOrder(s.cards.length)), [problem, round]);

  const finished = isFinished(problem, state);
  const step = problem.steps[state.stepIndex]!;
  const st = state.steps[state.stepIndex]!;
  const done = isStepDone(st);
  const order = orders[state.stepIndex]!;
  const runningScore = state.steps.reduce((acc, s, i) => acc + (i <= state.stepIndex ? stepResult(s).score : 0), 0);

  const restart = () => {
    setRound((r) => r + 1);
    dispatch({ type: 'reset', problem });
  };

  // Atajos: 1–4 elige carta, P pista, Enter siguiente.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= order.length) dispatch({ type: 'pick', card: order[n - 1]! });
      else if (e.key === 'p' || e.key === 'P') dispatch({ type: 'hint' });
      else if (e.key === 'Enter' && done && !finished) dispatch({ type: 'next' });
    },
    [order, done, finished],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const idx = siblings.indexOf(problem.id);
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  return (
    <div className="space-y-6">
      <div className="text-sm text-[var(--muted)]">
        <Link to="/" className="hover:underline">
          Catálogo
        </Link>{' '}
        / {topicName}
      </div>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-4">
        <h2 className="mb-2 text-lg font-semibold">
          <Tex>{problem.title}</Tex>
        </h2>
        <p className="leading-relaxed">
          <Tex>{problem.statement}</Tex>
        </p>
      </section>

      <Progress problem={problem} state={state} score={runningScore} />

      <section key={`${round}-${state.stepIndex}`} className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-medium leading-relaxed">
            <Tex>{step.prompt}</Tex>
          </h3>
          {step.timeLimitSec !== undefined && (
            <Timer seconds={step.timeLimitSec} stopped={done} onExpire={() => dispatch({ type: 'timeout' })} />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {order.map((cardIndex, pos) => (
            <CardView
              key={cardIndex}
              n={pos + 1}
              text={step.cards[cardIndex]!.text}
              explanation={step.cards[cardIndex]!.explanation}
              correct={step.cards[cardIndex]!.correct}
              picked={st.solvedWith === cardIndex || st.wrong.includes(cardIndex)}
              reveal={done}
              disabled={done || st.wrong.includes(cardIndex)}
              onPick={() => dispatch({ type: 'pick', card: cardIndex })}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!done && (
            <Button variant="ghost" onClick={() => dispatch({ type: 'hint' })} disabled={st.hintUsed} title="Usar la pista: el acierto vale 0 (tecla P)">
              {st.hintUsed ? 'Pista usada' : 'Pista'}
            </Button>
          )}
          {done && !finished && (
            <Button onClick={() => dispatch({ type: 'next' })} title="Enter">
              Siguiente paso
            </Button>
          )}
          <StepVerdict state={st} />
        </div>

        {st.hintUsed && (
          <p className="rounded-md border border-dashed border-[var(--line)] px-3 py-2 text-sm">
            <span className="font-medium">Pista: </span>
            <Tex>{step.hint}</Tex>
          </p>
        )}
      </section>

      {finished && (
        <Summary
          problem={problem}
          state={state}
          user={user}
          onRestart={restart}
          nextPath={nextId ? playPath(subject, topic, nextId) : undefined}
        />
      )}
    </div>
  );
}

function Progress({ problem, state, score }: { problem: Problem; state: GameState; score: number }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <ol className="flex gap-1.5" aria-label="Pasos">
        {problem.steps.map((s, i) => {
          const st = state.steps[i]!;
          const r = stepResult(st);
          const doneStep = isStepDone(st);
          const color = !doneStep
            ? i === state.stepIndex
              ? 'bg-[var(--ink)]'
              : 'bg-[var(--line)]'
            : r.firstTry
              ? 'bg-[var(--ok)]'
              : r.solved
                ? 'bg-[var(--muted)]'
                : 'bg-[var(--accent)]';
          return <li key={s.id} className={`h-2 w-8 rounded-full ${color}`} title={`Paso ${i + 1}`} />;
        })}
      </ol>
      <span className="tabular-nums text-[var(--muted)]">
        Paso {state.stepIndex + 1}/{problem.steps.length} · Puntaje {score > 0 ? `+${score}` : score}
      </span>
    </div>
  );
}

function CardView(props: {
  n: number;
  text: string;
  explanation: string;
  correct: boolean;
  picked: boolean;
  reveal: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const { n, text, explanation, correct, picked, reveal, disabled, onPick } = props;
  const showExpl = picked || reveal;
  const tone =
    picked && !correct
      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]'
      : (picked || reveal) && correct
        ? 'border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]'
        : reveal
          ? 'border-[var(--line)] opacity-70'
          : 'border-[var(--line)] hover:border-[var(--ink)] hover:-translate-y-0.5';
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={picked}
      className={`flex min-h-24 flex-col gap-2 rounded-lg border-2 bg-[var(--paper)] p-3 text-left transition disabled:cursor-default ${tone}`}
    >
      <span className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded border border-[var(--line)] px-1.5 text-xs text-[var(--muted)]">{n}</span>
        <span className="leading-relaxed">
          <Tex>{text}</Tex>
        </span>
      </span>
      {showExpl && (
        <span className="border-t border-[var(--line)] pt-2 text-sm text-[var(--muted)]">
          <span className={`font-medium ${correct ? 'text-[var(--ok)]' : 'text-[var(--accent)]'}`}>{correct ? 'Correcta. ' : 'Incorrecta. '}</span>
          <Tex>{explanation}</Tex>
        </span>
      )}
    </button>
  );
}

function StepVerdict({ state }: { state: GameState['steps'][number] }) {
  if (!isStepDone(state)) return state.wrong.length > 0 ? <span className="text-sm text-[var(--accent)]">−{state.wrong.length}</span> : null;
  const r = stepResult(state);
  const label = state.timedOut ? 'Tiempo agotado' : r.firstTry ? '¡A la primera!' : state.hintUsed && state.wrong.length === 0 ? 'Con pista' : 'Resuelto';
  return (
    <span className={`text-sm font-medium ${r.score > 0 ? 'text-[var(--ok)]' : r.score < 0 ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
      {label} · {r.score > 0 ? `+${r.score}` : r.score}
    </span>
  );
}

function Timer({ seconds, stopped, onExpire }: { seconds: number; stopped: boolean; onExpire: () => void }) {
  const [deadline] = useState(() => Date.now() + seconds * 1000);
  const [left, setLeft] = useState(seconds * 1000);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    if (stopped) return;
    const tick = () => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) expire.current();
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [deadline, stopped]);

  const s = Math.ceil(left / 1000);
  const urgent = !stopped && left < 15_000;
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 font-mono text-sm tabular-nums ${urgent ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)]'}`}
      aria-live="off"
      title="Tiempo restante"
    >
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; error: string };

function Summary({
  problem,
  state,
  user,
  onRestart,
  nextPath,
}: {
  problem: Problem;
  state: GameState;
  user: User | null;
  onRestart: () => void;
  nextPath?: string;
}) {
  const summary = useMemo(() => summarize(problem, state), [problem, state]);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const savedFor = useRef<GameState | null>(null);

  useEffect(() => {
    if (!user || savedFor.current === state) return;
    savedFor.current = state;
    setSave({ status: 'saving' });
    saveSession(user.uid, problem, summary, state.startedAt).then(
      () => setSave({ status: 'saved' }),
      (e: unknown) => setSave({ status: 'error', error: e instanceof Error ? e.message : String(e) }),
    );
  }, [user, problem, state, summary]);

  return (
    <section className="space-y-4 rounded-lg border-2 border-[var(--ink)] p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Resumen</h3>
        <span className="text-2xl font-semibold tabular-nums">{summary.score > 0 ? `+${summary.score}` : summary.score}</span>
      </div>
      <p className="text-sm text-[var(--muted)]">
        {summary.firstTry}/{summary.steps} pasos a la primera · {plural(summary.hintsUsed, 'pista', 'pistas')} ·{' '}
        {plural(summary.timeouts, 'tiempo agotado', 'tiempos agotados')}
      </p>
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
                <td className="py-1 text-right tabular-nums">{s.score > 0 ? `+${s.score}` : s.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-sm">
        {!user && <span className="text-[var(--muted)]">Sin sesión: el progreso no se guarda.</span>}
        {save.status === 'saving' && <span className="text-[var(--muted)]">Guardando…</span>}
        {save.status === 'saved' && <span className="text-[var(--ok)]">Guardado en tu historial.</span>}
        {save.status === 'error' && <span className="text-[var(--accent)]">No se pudo guardar: {save.error}</span>}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={onRestart}>
          Jugar de nuevo
        </Button>
        {nextPath ? (
          <Link to={nextPath} className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-85">
            Siguiente problema
          </Link>
        ) : (
          <Link to="/" className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-85">
            Volver al catálogo
          </Link>
        )}
      </div>
    </section>
  );
}
