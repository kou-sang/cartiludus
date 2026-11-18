import { useEffect, useState } from 'react';
import type { ContentIndex, Problem } from '../../shared/model';
import type { ProblemPick } from '../../shared/session';
import { loadIndex, loadTopic } from './content';

export type Async<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; data: T };
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ejecuta `load` cuando cambia `key`; descarta resultados de cargas viejas. */
export function useAsync<T>(load: () => Promise<T>, key: string): Async<T> {
  const [state, setState] = useState<Async<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load().then(
      (data) => alive && setState({ status: 'ok', data }),
      (e: unknown) => alive && setState({ status: 'error', error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export const useIndex = (): Async<ContentIndex> => useAsync(loadIndex, 'index');

/** Carga los problemas elegidos (un bundle por tema, cacheado). */
export async function loadProblems(subject: string, picks: ProblemPick[]): Promise<Problem[]> {
  const index = await loadIndex();
  const s = index.subjects.find((x) => x.id === subject);
  if (!s) throw new Error('Materia no encontrada.');
  const out: Problem[] = [];
  for (const pick of picks) {
    const t = s.topics.find((x) => x.id === pick.topic);
    if (!t) throw new Error(`Tema no encontrado: ${pick.topic}`);
    const bundle = await loadTopic(t.bundle);
    const p = bundle.problems.find((x) => x.id === pick.id);
    if (!p) throw new Error(`Problema no encontrado: ${pick.id}`);
    out.push(p);
  }
  return out;
}

export function topicNames(index: ContentIndex): Map<string, string> {
  return new Map(index.subjects.flatMap((s) => s.topics.map((t) => [t.id, t.name] as const)));
}
