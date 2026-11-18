# Cartiludus

Práctica guiada de Probabilidad, Estadística y Análisis Real: cada problema se resuelve paso a paso eligiendo entre 4 cartas.

Stack: Vite + React + TypeScript, KaTeX, Firebase Auth/Firestore (proyecto compartido con CRYPTICUS), Cloudflare Worker en `*.workers.dev`.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con la config pública de Firebase (la misma que CRYPTICUS)
npm run dev                  # build:content + vite
npm test                     # validador de contenido y LaTeX
npm run deploy               # build + wrangler deploy
```

## Contenido

```
content/<materia>/meta.json          { id, name, order?, topics: [{ id, name, order? }] }
content/<materia>/<tema>/<id>.json   Problem (ver shared/model.ts)
```

`npm run build:content` valida todo y emite `public/content/index.json` + `public/content/<materia>/<tema>.json`. Se ejecuta antes de `dev` y `build`; si hay errores no escribe nada y sale con código 1.

Reglas del validador:

- `id` del problema = nombre del archivo; `subject` y `topic` deben coincidir con las carpetas y con un `meta.json`.
- `version` entera ≥ 1 (incrementar al cambiar el problema).
- Cada paso: `hint` obligatorio, exactamente 4 cartas, ≥ 1 correcta, 4 explicaciones no vacías, textos únicos (ignorando espacios; distingue mayúsculas, p. ej. `F_D` ≠ `f_D`).
- Todo `$...$` / `$$...$$` compila con KaTeX en modo estricto. `\$` = dólar literal.

`kind` → categoría de resumen: `identify` → Identificar VA; `distribution`, `parameters` → Distribución; `property` → Propiedad; `setup`, `compute`, `interpret` → Cálculo.

## Juego

Cada paso muestra 4 cartas en orden aleatorio. Se reintenta hasta acertar. Puntaje por paso (`shared/engine.ts`):

| Situación | Puntos |
|---|---|
| Acierto a la primera, sin pista | +1 |
| Cada carta incorrecta | −1 |
| Acierto tardío o con pista | 0 (más las incorrectas) |
| Tiempo agotado (`timeLimitSec`) | −1 extra; el paso queda fallado y se revela la respuesta |

Piso de −3 por paso. Atajos: `1`–`4` cartas, `P` pista, `Enter` siguiente paso.

Con sesión iniciada, al terminar se guarda la partida en una transacción (`pq_sessions/{uid}/items/{id}` + agregados en `pq_users/{uid}`). `/historial` muestra los agregados por categoría y las partidas de a 10.

## Firebase Auth en `*.workers.dev`

El Worker hace proxy de `/__/auth/*` y `/__/firebase/*` a `https://crypticus-eh.firebaseapp.com` (igual que CRYPTICUS), así el login de Google ocurre en el mismo dominio. Con `VITE_AUTH_SAME_ORIGIN=true`:

1. Firebase Console → Authentication → Settings → Dominios autorizados: agregar `cartiludus.<cuenta>.workers.dev`.
2. Google Cloud → Credenciales → cliente OAuth web: agregar `https://cartiludus.<cuenta>.workers.dev/__/auth/handler` como URI de redirección autorizada.

## Reglas de Firestore

El archivo maestro está en CRYPTICUS (`firestore.rules`). Cartiludus solo provee el bloque `firestore/pq_rules.rules`: pegarlo dentro de `match /databases/{database}/documents` en CRYPTICUS y desplegar desde allí con `npm run deploy:rules`. Este repo no despliega reglas.

Escrituras por partida: 1 transacción = crear `pq_sessions/{uid}/items/{id}` + actualizar agregados en `pq_users/{uid}` (`played + 1`, `lastSessionId = id`). Nada por paso.
