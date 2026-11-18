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
import { mergeAggregates, type ByCategory, type GameSummary, type UserAggregates } from '../../shared/engine';
import type { Problem } from '../../shared/model';

export const HISTORY_PAGE = 10;

export interface SessionDoc {
  problemId: string;
  problemVersion: number;
  subject: string;
  topic: string;
  score: number;
  steps: number;
  firstTry: number;
  byCategory: ByCategory;
  hintsUsed: number;
  timeouts: number;
  startedAt: Timestamp;
  finishedAt: Timestamp;
}

export async function saveSession(uid: string, problem: Problem, summary: GameSummary, startedAt: number): Promise<string> {
  const userRef = doc(db, 'pq_users', uid);
  const sessionRef = doc(collection(db, 'pq_sessions', uid, 'items'));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const prev = snap.exists() ? (snap.data() as UserAggregates) : undefined;
    const next = mergeAggregates(prev, summary);
    tx.set(sessionRef, {
      problemId: problem.id,
      problemVersion: problem.version,
      subject: problem.subject,
      topic: problem.topic,
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
  return snap.exists() ? (snap.data() as UserAggregates) : null;
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
