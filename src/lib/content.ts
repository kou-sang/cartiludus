// Carga del índice y de los bundles por tema generados por `build:content`.
import type { ContentIndex, TopicBundle } from '../../shared/model';

let indexPromise: Promise<ContentIndex> | null = null;
const bundles = new Map<string, Promise<TopicBundle>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  return (await res.json()) as T;
}

export function loadIndex(): Promise<ContentIndex> {
  indexPromise ??= getJson<ContentIndex>('/content/index.json').catch((e: unknown) => {
    indexPromise = null;
    throw e;
  });
  return indexPromise;
}

export function loadTopic(bundlePath: string): Promise<TopicBundle> {
  let p = bundles.get(bundlePath);
  if (!p) {
    p = getJson<TopicBundle>(bundlePath).catch((e: unknown) => {
      bundles.delete(bundlePath);
      throw e;
    });
    bundles.set(bundlePath, p);
  }
  return p;
}
