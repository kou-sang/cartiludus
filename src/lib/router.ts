// Router mínimo sobre la History API (el Worker sirve la SPA en cualquier ruta).
import { useSyncExternalStore, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

const current = () => window.location.pathname + window.location.search;

export function navigate(to: string, replace = false): void {
  if (to === current()) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.scrollTo(0, 0);
  notify();
}

/** Ruta actual (path + query) como string estable. */
export function useLocation(): { path: string; search: string; key: string } {
  const key = useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, current);
  const q = key.indexOf('?');
  return { path: q < 0 ? key : key.slice(0, q), search: q < 0 ? '' : key.slice(q), key };
}

/** onClick para <a href>: navegación interna sin recargar, respetando Ctrl/⌘-click. */
export function linkTo(path: string) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };
}

export const subjectPath = (subject: string) => `/m/${subject}`;
export const catalogPath = (subject: string) => `/m/${subject}/problemas`;
export const sessionPath = (subject: string, query: string) => `/partida/${subject}?${query}`;
export const playPath = (subject: string, topic: string, id: string) => `/jugar/${subject}/${topic}/${id}`;

const SLUG = '([a-z0-9-]+)';

export type Route =
  | { name: 'home' }
  | { name: 'setup'; subject: string }
  | { name: 'catalog'; subject: string }
  | { name: 'session'; subject: string }
  | { name: 'play'; subject: string; topic: string; id: string }
  | { name: 'history' }
  | { name: 'notFound' };

export function parse(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'home' };
  if (p === '/historial') return { name: 'history' };
  let m = p.match(new RegExp(`^/m/${SLUG}$`));
  if (m) return { name: 'setup', subject: m[1]! };
  m = p.match(new RegExp(`^/m/${SLUG}/problemas$`));
  if (m) return { name: 'catalog', subject: m[1]! };
  m = p.match(new RegExp(`^/partida/${SLUG}$`));
  if (m) return { name: 'session', subject: m[1]! };
  m = p.match(new RegExp(`^/jugar/${SLUG}/${SLUG}/${SLUG}$`));
  if (m) return { name: 'play', subject: m[1]!, topic: m[2]!, id: m[3]! };
  return { name: 'notFound' };
}
