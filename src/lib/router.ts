// Router mínimo sobre la History API (el Worker sirve la SPA en cualquier ruta).
import { useSyncExternalStore, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

export function navigate(path: string, replace = false): void {
  if (path === window.location.pathname) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.scrollTo(0, 0);
  notify();
}

export function usePath(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => window.location.pathname,
  );
}

/** onClick para <a href>: navegación interna sin recargar, respetando Ctrl/⌘-click. */
export function linkTo(path: string) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };
}

export const playPath = (subject: string, topic: string, id: string) => `/jugar/${subject}/${topic}/${id}`;

export type Route =
  | { name: 'catalog' }
  | { name: 'play'; subject: string; topic: string; id: string }
  | { name: 'history' }
  | { name: 'notFound' };

export function parse(path: string): Route {
  if (path === '/' || path === '') return { name: 'catalog' };
  if (path === '/historial') return { name: 'history' };
  const m = path.match(/^\/jugar\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/);
  if (m) return { name: 'play', subject: m[1]!, topic: m[2]!, id: m[3]! };
  return { name: 'notFound' };
}
