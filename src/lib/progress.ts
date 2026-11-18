// Progreso en Firestore. Por partida: 1 transacción que crea pq_sessions/{uid}/items/{id}
// y actualiza los agregados de pq_users/{uid} (ver firestore/pq_rules.rules).
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ByCategory } from '../../shared/engine';
import { mergeAggregates, type PlayedProblem, type SessionConfig, type SessionSummary, type UserAggregates } from '../../shared/session';

export const HISTORY_PAGE = 10;

export interface SessionDoc {
  subject: string;
  topics: string[];
  config: Pick<SessionConfig, 'count' | 'stepLimit' | 'totalMin' | 'mode'>;
  problems: Array<Omit<PlayedProblem, 'complete'> & { complete: boolean }>;
  score: number;
  steps: number;
  firstTry: number;
  byCategory: ByCategory;
  hintsUsed: number;
  timeouts: number;
  startedAt: Timestamp;
  finishedAt: Timestamp;
}

export async function saveSession(uid: string, config: SessionConfig, summary: SessionSummary, startedAt: number): Promise<string> {
  if (summary.steps === 0) throw new Error('No hay pasos jugados.');
  const userRef = doc(db, 'pq_users', uid);
  const sessionRef = doc(collection(db, 'pq_sessions', uid, 'items'));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const prev = snap.exists() ? (snap.data() as Partial<UserAggregates>) : undefined;
    const next = mergeAggregates(prev, summary, Date.now());
    tx.set(sessionRef, {
      subject: config.subject,
      topics: [...new Set(summary.problems.map((p) => p.topic))],
      config: { count: config.count, stepLimit: config.stepLimit, totalMin: config.totalMin, mode: config.mode },
      problems: summary.problems,
      score: summary.score,
      steps: summary.steps,
      firstTry: summary.firstTry,
      byCategory: summary.byCategory,
      hintsUsed: summary.hintsUsed,
      timeouts: summary.timeouts,
      // Nunca en el futuro respecto del servidor (la regla exige startedAt <= request.time).
      startedAt: Timestamp.fromMillis(Math.min(startedAt, Date.now() - 5_000)),
      finishedAt: serverTimestamp(),
    });
    tx.set(userRef, { ...next, lastSessionId: sessionRef.id, updatedAt: serverTimestamp() });
  });
  return sessionRef.id;
}

export async function loadAggregates(uid: string): Promise<UserAggregates | null> {
  const snap = await getDoc(doc(db, 'pq_users', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<UserAggregates>;
  return {
    played: d.played ?? 0,
    score: d.score ?? 0,
    steps: d.steps ?? 0,
    firstTry: d.firstTry ?? 0,
    byCategory: d.byCategory ?? {},
    byTopic: d.byTopic ?? {},
    review: d.review ?? {},
  };
}

export async function loadHistory(
  uid: string,
  after?: QueryDocumentSnapshot,
): Promise<{ items: Array<SessionDoc & { id: string }>; cursor: QueryDocumentSnapshot | null }> {
  const base = collection(db, 'pq_sessions', uid, 'items');
  const q = after
    ? query(base, orderBy('finishedAt', 'desc'), startAfter(after), limit(HISTORY_PAGE))
    : query(base, orderBy('finishedAt', 'desc'), limit(HISTORY_PAGE));
  const snap = await getDocs(q);
  const docs = snap.docs;
  return {
    items: docs.map((d) => ({ id: d.id, ...(d.data() as SessionDoc) })),
    cursor: docs.length === HISTORY_PAGE ? docs[docs.length - 1]! : null,
  };
}
