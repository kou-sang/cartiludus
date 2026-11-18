// Worker de Cartiludus: sirve la SPA y hace proxy del handler de Firebase Auth en el mismo dominio
// (mismo esquema que CRYPTICUS: /__/auth/* y /__/firebase/* → https://<proyecto>.firebaseapp.com).
export interface Env {
  ASSETS: Fetcher;
  FIREBASE_PROJECT_ID: string;
}

async function proxyFirebaseAuth(request: Request, url: URL, env: Env): Promise<Response> {
  const target = new URL(`${url.pathname}${url.search}`, `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`);
  return fetch(new Request(target, request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__/auth/') || url.pathname.startsWith('/__/firebase/')) {
      return proxyFirebaseAuth(request, url, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
