// Partida = varios problemas elegidos según la configuración. Funciones puras.
import { CATEGORIES, type ContentIndex, type Problem } from './model';
import { isStepDone, shuffledOrder, summarize, type ByCategory, type CategoryStats, type GameState } from './engine';

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

/** Candidatos según temas y modo; en repaso, sólo los marcados en `review`. */
export function candidates(index: ContentIndex, config: SessionConfig, review: Record<string, unknown> = {}): ProblemPick[] {
  const subject = index.subjects.find((s) => s.id === config.subject);
  if (!subject) return [];
  const topics = new Set(config.topics);
  return subject.topics
    .filter((t) => topics.size === 0 || topics.has(t.id))
    .flatMap((t) => t.problems.map((p) => ({ topic: t.id, id: p.id })))
    .filter((p) => config.mode === 'nueva' || p.id in review);
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
  /** Se jugaron todos sus pasos. */
  complete: boolean;
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

export function summarizeSession(played: Array<{ problem: Problem; game: GameState }>): SessionSummary {
  const out: SessionSummary = { score: 0, steps: 0, firstTry: 0, hintsUsed: 0, timeouts: 0, byCategory: {}, problems: [] };
  for (const { problem, game } of played) {
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
  /** Problemas para repasar: id → ms de la última vez que se falló. */
  review: Record<string, number>;
}

export const REVIEW_MAX = 500;

export function mergeAggregates(prev: Partial<UserAggregates> | undefined, s: SessionSummary, now: number): UserAggregates {
  const byCategory: ByCategory = { ...(prev?.byCategory ?? {}) };
  for (const cat of CATEGORIES) {
    const b = s.byCategory[cat];
    if (b) byCategory[cat] = addStats(byCategory[cat], b);
  }

  const byTopic: Record<string, TopicStats> = { ...(prev?.byTopic ?? {}) };
  const review: Record<string, number> = { ...(prev?.review ?? {}) };
  for (const p of s.problems) {
    const t = byTopic[p.topic];
    byTopic[p.topic] = {
      problems: (t?.problems ?? 0) + (p.complete ? 1 : 0),
      steps: (t?.steps ?? 0) + p.steps,
      firstTry: (t?.firstTry ?? 0) + p.firstTry,
      score: (t?.score ?? 0) + p.score,
    };
    // Perfecto y completo → sale del repaso; algún paso no acertado a la primera → entra.
    if (p.firstTry < p.steps) review[p.id] = now;
    else if (p.complete) delete review[p.id];
  }
  // Acotar: se descartan los más viejos.
  const ids = Object.keys(review);
  if (ids.length > REVIEW_MAX) {
    ids.sort((a, b) => review[a]! - review[b]!);
    for (const id of ids.slice(0, ids.length - REVIEW_MAX)) delete review[id];
  }

  return {
    played: (prev?.played ?? 0) + 1,
    score: (prev?.score ?? 0) + s.score,
    steps: (prev?.steps ?? 0) + s.steps,
    firstTry: (prev?.firstTry ?? 0) + s.firstTry,
    byCategory,
    byTopic,
    review,
  };
}
