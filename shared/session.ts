// Partida = varios problemas elegidos según la configuración. Funciones puras.
import { CATEGORIES, type ContentIndex, type Problem } from './model';
import { isStepDone, shuffledOrder, stepResult, summarize, type ByCategory, type CategoryStats, type GameState } from './engine';

// ---------- Configuración ----------

/** Límite por paso: el del contenido (`timeLimitSec`), ninguno, o segundos fijos. */
export type StepLimit = 'contenido' | 'ninguno' | number;
export type Mode = 'nueva' | 'repaso';

export interface SessionConfig {
  subject: string;
  topics: string[];
  count: number;
  stepLimit: StepLimit;
  /** Minutos de la partida completa; null = sin límite. */
  totalMin: number | null;
  mode: Mode;
}

export const COUNT_OPTIONS = [1, 2, 3, 5, 10] as const;
export const STEP_LIMIT_OPTIONS: StepLimit[] = ['contenido', 'ninguno', 30, 60, 120];
export const TOTAL_OPTIONS: Array<number | null> = [null, 5, 10, 20, 30];
export const MAX_PROBLEMS = 20;

export const DEFAULT_CONFIG = (subject: string, topics: string[]): SessionConfig => ({
  subject,
  topics,
  count: 3,
  stepLimit: 'contenido',
  totalMin: null,
  mode: 'nueva',
});

export function stepLimitLabel(l: StepLimit): string {
  if (l === 'contenido') return 'Según el problema';
  if (l === 'ninguno') return 'Sin límite';
  return `${l} s`;
}

/** Segundos efectivos para un paso, o undefined si no hay límite. */
export function effectiveStepLimit(config: Pick<SessionConfig, 'stepLimit'>, contentLimit: number | undefined): number | undefined {
  if (config.stepLimit === 'ninguno') return undefined;
  if (config.stepLimit === 'contenido') return contentLimit;
  return config.stepLimit;
}

/** Config ↔ query string (`/partida/<materia>?temas=…&n=…&paso=…&total=…&modo=…`). */
export function configToQuery(c: SessionConfig): string {
  const q = new URLSearchParams({ temas: c.topics.join(','), n: String(c.count), paso: String(c.stepLimit), modo: c.mode });
  if (c.totalMin !== null) q.set('total', String(c.totalMin));
  return q.toString();
}

export function configFromQuery(subject: string, search: string): SessionConfig {
  const q = new URLSearchParams(search);
  const n = Number(q.get('n'));
  const paso = q.get('paso');
  const total = Number(q.get('total'));
  return {
    subject,
    topics: (q.get('temas') ?? '').split(',').filter(Boolean),
    count: Number.isInteger(n) && n >= 1 && n <= MAX_PROBLEMS ? n : 3,
    stepLimit: paso === 'ninguno' ? 'ninguno' : paso && /^\d+$/.test(paso) && Number(paso) >= 5 ? Number(paso) : 'contenido',
    totalMin: Number.isInteger(total) && total > 0 && total <= 180 ? total : null,
    mode: q.get('modo') === 'repaso' ? 'repaso' : 'nueva',
  };
}

// ---------- Selección ----------

export interface ProblemPick {
  topic: string;
  id: string;
}

/** Progreso de un problema: pasos resueltos y pasos para repasar (resueltos con errores, pista o fuera de tiempo). */
export interface ProgressEntry {
  /** Versión del problema a la que corresponde; si cambia, el progreso se descarta. */
  v: number;
  done: string[];
  rev: string[];
  /** ms de la última actualización. */
  t: number;
}
export type Progress = Record<string, ProgressEntry>;

const entryFor = (progress: Progress, id: string, version: number): ProgressEntry | undefined => {
  const e = progress[id];
  return e && e.v === version ? e : undefined;
};

/**
 * Candidatos según temas y modo.
 * - nueva: problemas con pasos sin resolver (los resueltos no se vuelven a jugar).
 * - repaso: problemas con pasos para repasar.
 */
export function candidates(index: ContentIndex, config: SessionConfig, progress: Progress = {}): ProblemPick[] {
  const subject = index.subjects.find((s) => s.id === config.subject);
  if (!subject) return [];
  const topics = new Set(config.topics);
  return subject.topics
    .filter((t) => topics.size === 0 || topics.has(t.id))
    .flatMap((t) =>
      t.problems
        .filter((p) => {
          const e = entryFor(progress, p.id, p.version);
          return config.mode === 'nueva' ? (e?.done.length ?? 0) < p.steps : (e?.rev.length ?? 0) > 0;
        })
        .map((p) => ({ topic: t.id, id: p.id })),
    );
}

/** Estado de un problema para mostrar en el catálogo. */
export function problemStatus(progress: Progress, id: string, version: number, steps: number): { done: number; rev: number; complete: boolean } {
  const e = entryFor(progress, id, version);
  const done = e?.done.length ?? 0;
  return { done, rev: e?.rev.length ?? 0, complete: done >= steps };
}

/** Pasos a jugar de un problema según el progreso y el modo. */
export function stepsToPlay(problem: Problem, progress: Progress, mode: Mode): Problem['steps'] {
  const e = entryFor(progress, problem.id, problem.version);
  if (!e) return problem.steps;
  if (mode === 'repaso') return problem.steps.filter((s) => e.rev.includes(s.id));
  return problem.steps.filter((s) => !e.done.includes(s.id));
}

/** `count` problemas al azar, sin repetir, presentados en orden de práctica. */
export function pickProblems(pool: ProblemPick[], count: number, random: () => number = Math.random): ProblemPick[] {
  const order = shuffledOrder(pool.length, random).slice(0, count);
  return order.sort((a, b) => a - b).map((i) => pool[i]!);
}

// ---------- Resultado ----------

export interface PlayedProblem {
  id: string;
  version: number;
  topic: string;
  score: number;
  steps: number;
  firstTry: number;
  /** Se jugaron todos los pasos de esta partida. */
  complete: boolean;
  /** Sólo para actualizar el progreso (no se guardan en la partida). */
  solvedIds?: string[];
  firstTryIds?: string[];
  totalSteps?: number;
}

export interface SessionSummary {
  score: number;
  steps: number;
  firstTry: number;
  hintsUsed: number;
  timeouts: number;
  byCategory: ByCategory;
  problems: PlayedProblem[];
}

/** `problem` puede ser un subconjunto de pasos del original; `totalSteps` es la cantidad del original. */
export function summarizeSession(played: Array<{ problem: Problem; game: GameState; totalSteps?: number }>): SessionSummary {
  const out: SessionSummary = { score: 0, steps: 0, firstTry: 0, hintsUsed: 0, timeouts: 0, byCategory: {}, problems: [] };
  for (const { problem, game, totalSteps } of played) {
    const s = summarize(problem, game);
    if (s.steps === 0) continue;
    out.score += s.score;
    out.steps += s.steps;
    out.firstTry += s.firstTry;
    out.hintsUsed += s.hintsUsed;
    out.timeouts += s.timeouts;
    for (const cat of CATEGORIES) {
      const b = s.byCategory[cat];
      if (b) out.byCategory[cat] = addStats(out.byCategory[cat], b);
    }
    out.problems.push({
      id: problem.id,
      version: problem.version,
      topic: problem.topic,
      score: s.score,
      steps: s.steps,
      firstTry: s.firstTry,
      complete: game.steps.every(isStepDone),
      solvedIds: problem.steps.filter((_, i) => stepResult(game.steps[i]!).solved).map((st) => st.id),
      firstTryIds: problem.steps.filter((_, i) => stepResult(game.steps[i]!).firstTry).map((st) => st.id),
      totalSteps: totalSteps ?? problem.steps.length,
    });
  }
  return out;
}

function addStats(a: CategoryStats | undefined, b: CategoryStats): CategoryStats {
  return { steps: (a?.steps ?? 0) + b.steps, firstTry: (a?.firstTry ?? 0) + b.firstTry, score: (a?.score ?? 0) + b.score };
}

// ---------- Agregados de pq_users/{uid} ----------

export interface TopicStats {
  problems: number;
  steps: number;
  firstTry: number;
  score: number;
}

export interface UserAggregates {
  played: number;
  score: number;
  steps: number;
  firstTry: number;
  byCategory: ByCategory;
  byTopic: Record<string, TopicStats>;
  progress: Progress;
}

export const PROGRESS_MAX = 1000;

export function mergeAggregates(prev: Partial<UserAggregates> | undefined, s: SessionSummary, now: number): UserAggregates {
  const byCategory: ByCategory = { ...(prev?.byCategory ?? {}) };
  for (const cat of CATEGORIES) {
    const b = s.byCategory[cat];
    if (b) byCategory[cat] = addStats(byCategory[cat], b);
  }

  const byTopic: Record<string, TopicStats> = { ...(prev?.byTopic ?? {}) };
  const progress: Progress = { ...(prev?.progress ?? {}) };
  for (const p of s.problems) {
    const old = progress[p.id]?.v === p.version ? progress[p.id] : undefined;
    const done = new Set(old?.done ?? []);
    const rev = new Set(old?.rev ?? []);
    const firstTry = new Set(p.firstTryIds ?? []);
    for (const id of p.solvedIds ?? []) {
      done.add(id);
      // A la primera → sale del repaso; resuelto con errores, pista o tarde → entra.
      if (firstTry.has(id)) rev.delete(id);
      else rev.add(id);
    }
    const total = p.totalSteps ?? p.steps;
    const wasComplete = (old?.done.length ?? 0) >= total;
    const nowComplete = done.size >= total;
    progress[p.id] = { v: p.version, done: [...done], rev: [...rev], t: now };

    const t = byTopic[p.topic];
    byTopic[p.topic] = {
      problems: (t?.problems ?? 0) + (nowComplete && !wasComplete ? 1 : 0),
      steps: (t?.steps ?? 0) + p.steps,
      firstTry: (t?.firstTry ?? 0) + p.firstTry,
      score: (t?.score ?? 0) + p.score,
    };
  }
  // Acotar: se descartan los más viejos.
  const ids = Object.keys(progress);
  if (ids.length > PROGRESS_MAX) {
    ids.sort((a, b) => progress[a]!.t - progress[b]!.t);
    for (const id of ids.slice(0, ids.length - PROGRESS_MAX)) delete progress[id];
  }

  return {
    played: (prev?.played ?? 0) + 1,
    score: (prev?.score ?? 0) + s.score,
    steps: (prev?.steps ?? 0) + s.steps,
    firstTry: (prev?.firstTry ?? 0) + s.firstTry,
    byCategory,
    byTopic,
    progress,
  };
}
