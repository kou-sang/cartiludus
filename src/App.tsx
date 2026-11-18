import { Button, Link, Message } from './components/ui';
import { logOut, signIn, useUser } from './lib/auth';
import { parse, usePath } from './lib/router';
import { Catalog } from './views/Catalog';
import { History } from './views/History';
import { Play } from './views/Play';

export function App() {
  const { user, ready } = useUser();
  const route = parse(usePath());

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-8 flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <Link to="/" className="text-2xl font-semibold tracking-tight">
          Cartiludus
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/historial" className={route.name === 'history' ? 'font-medium underline' : 'hover:underline'}>
            Historial
          </Link>
          {ready &&
            (user ? (
              <span className="flex items-center gap-3">
                <span className="hidden text-[var(--muted)] sm:inline">{user.displayName ?? user.email}</span>
                <button type="button" className="underline" onClick={() => void logOut()}>
                  Salir
                </button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => void signIn()}>
                Ingresar con Google
              </Button>
            ))}
        </nav>
      </header>

      <main>
        {route.name === 'catalog' && <Catalog />}
        {route.name === 'play' && <Play subject={route.subject} topic={route.topic} id={route.id} user={user} />}
        {route.name === 'history' && <History user={user} ready={ready} />}
        {route.name === 'notFound' && (
          <Message>
            Página no encontrada. <Link to="/" className="underline">Volver al catálogo</Link>.
          </Message>
        )}
      </main>

      <footer className="mt-12 text-xs text-[var(--muted)]">
        v{__APP_VERSION__}
        {ready && !user && ' · sin sesión: el progreso no se guarda'}
        {route.name === 'play' && ' · atajos: 1–4 cartas, P pista, Enter siguiente'}
      </footer>
    </div>
  );
}
