// Motor de partida de Cartiludus: funciones puras, sin React ni Firebase.
//
// Puntaje por paso:
//   +1  acierto a la primera, sin pista y sin tiempo agotado
//   −1  por cada carta incorrecta elegida
//    0  por acertar tarde (después de errores) o con pista
//   −1  extra si se agota el tiempo (el paso queda fallado y se revela la respuesta)
// Piso de −3 por paso (las reglas de Firestore validan score ≥ −3·pasos).
import { CATEGORIES, CATEGORY_OF_KIND, type Category, type Problem } from './model';

export const STEP_FLOOR = -3;

export interface StepState {
  /** Índices (en `step.cards`) de las cartas incorrectas elegidas, en orden. */
  wrong: number[];
  /** Índice de la carta correcta elegida, si se acertó. */
  solvedWith: number | null;
  hintUsed: boolean;
  timedOut: boolean;
}

export interface GameState {
  problemId: string;
  problemVersion: number;
  stepIndex: number;
  steps: StepState[];
  startedAt: number;
}

export type GameAction =
  | { type: 'pick'; card: number }
  | { type: 'hint' }
  | { type: 'timeout' }
  | { type: 'next' };

export function newGame(problem: Problem, now: number): GameState {
  return {
    problemId: problem.id,
    problemVersion: problem.version,
    stepIndex: 0,
    steps: problem.steps.map(() => ({ wrong: [], solvedWith: null, hintUsed: false, timedOut: false })),
    startedAt: now,
  };
}

export const isStepDone = (s: StepState): boolean => s.solvedWith !== null || s.timedOut;

export function isFinished(problem: Problem, state: GameState): boolean {
  return state.stepIndex === problem.steps.length - 1 && isStepDone(state.steps[state.stepIndex]!);
}

export function reduce(problem: Problem, state: GameState, action: GameAction): GameState {
  const i = state.stepIndex;
  const current = state.steps[i]!;
  const step = problem.steps[i]!;
  const replace = (s: StepState): GameState => ({ ...state, steps: state.steps.map((x, j) => (j === i ? s : x)) });

  switch (action.type) {
    case 'pick': {
      const card = step.cards[action.card];
      if (!card || isStepDone(current) || current.wrong.includes(action.card)) return state;
      return replace(card.correct ? { ...current, solvedWith: action.card } : { ...current, wrong: [...current.wrong, action.card] });
    }
    case 'hint':
      return isStepDone(current) || current.hintUsed ? state : replace({ ...current, hintUsed: true });
    case 'timeout':
      return isStepDone(current) ? state : replace({ ...current, timedOut: true });
    case 'next':
      return isStepDone(current) && i < problem.steps.length - 1 ? { ...state, stepIndex: i + 1 } : state;
  }
}

export interface StepResult {
  score: number;
  firstTry: boolean;
  solved: boolean;
}

export function stepResult(s: StepState): StepResult {
  const solved = s.solvedWith !== null && !s.timedOut;
  const firstTry = solved && s.wrong.length === 0 && !s.hintUsed;
  const raw = (firstTry ? 1 : 0) - s.wrong.length - (s.timedOut ? 1 : 0);
  return { score: Math.max(STEP_FLOOR, raw), firstTry, solved };
}

export interface CategoryStats {
  steps: number;
  firstTry: number;
  score: number;
}

export type ByCategory = Partial<Record<Category, CategoryStats>>;

export interface GameSummary {
  score: number;
  steps: number;
  firstTry: number;
  hintsUsed: number;
  timeouts: number;
  byCategory: ByCategory;
}

export function summarize(problem: Problem, state: GameState): GameSummary {
  const summary: GameSummary = { score: 0, steps: problem.steps.length, firstTry: 0, hintsUsed: 0, timeouts: 0, byCategory: {} };
  problem.steps.forEach((step, i) => {
    const s = state.steps[i]!;
    const r = stepResult(s);
    summary.score += r.score;
    summary.firstTry += r.firstTry ? 1 : 0;
    summary.hintsUsed += s.hintUsed ? 1 : 0;
    summary.timeouts += s.timedOut ? 1 : 0;
    const cat = CATEGORY_OF_KIND[step.kind];
    const acc = (summary.byCategory[cat] ??= { steps: 0, firstTry: 0, score: 0 });
    acc.steps += 1;
    acc.firstTry += r.firstTry ? 1 : 0;
    acc.score += r.score;
  });
  return summary;
}

/** Agregados de `pq_users/{uid}`. */
export interface UserAggregates {
  played: number;
  score: number;
  steps: number;
  firstTry: number;
  byCategory: ByCategory;
}

export function mergeAggregates(prev: UserAggregates | undefined, s: GameSummary): UserAggregates {
  const byCategory: ByCategory = {};
  for (const cat of CATEGORIES) {
    const a = prev?.byCategory[cat];
    const b = s.byCategory[cat];
    if (!a && !b) continue;
    byCategory[cat] = {
      steps: (a?.steps ?? 0) + (b?.steps ?? 0),
      firstTry: (a?.firstTry ?? 0) + (b?.firstTry ?? 0),
      score: (a?.score ?? 0) + (b?.score ?? 0),
    };
  }
  return {
    played: (prev?.played ?? 0) + 1,
    score: (prev?.score ?? 0) + s.score,
    steps: (prev?.steps ?? 0) + s.steps,
    firstTry: (prev?.firstTry ?? 0) + s.firstTry,
    byCategory,
  };
}

/** Permutación aleatoria de 0..n-1 (Fisher–Yates). `random` inyectable para tests. */
export function shuffledOrder(n: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
