import { useEffect, useState } from 'react';
import type { ContentIndex, Problem } from '../../shared/model';
import { loadIndex, loadTopic } from './content';

type Async<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; data: T };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useIndex(): Async<ContentIndex> {
  const [state, setState] = useState<Async<ContentIndex>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    loadIndex().then(
      (data) => alive && setState({ status: 'ok', data }),
      (e: unknown) => alive && setState({ status: 'error', error: message(e) }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export interface ProblemRef {
  problem: Problem;
  /** Ids del tema en orden, para «siguiente problema». */
  siblings: string[];
  topicName: string;
}

export function useProblem(subject: string, topic: string, id: string): Async<ProblemRef> {
  const [state, setState] = useState<Async<ProblemRef>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    (async () => {
      const index = await loadIndex();
      const t = index.subjects.find((s) => s.id === subject)?.topics.find((x) => x.id === topic);
      if (!t) throw new Error('Tema no encontrado.');
      const bundle = await loadTopic(t.bundle);
      const problem = bundle.problems.find((p) => p.id === id);
      if (!problem) throw new Error('Problema no encontrado.');
      return { problem, siblings: bundle.problems.map((p) => p.id), topicName: t.name };
    })().then(
      (data) => alive && setState({ status: 'ok', data }),
      (e: unknown) => alive && setState({ status: 'error', error: message(e) }),
    );
    return () => {
      alive = false;
    };
  }, [subject, topic, id]);
  return state;
}
