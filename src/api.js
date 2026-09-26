import { parseHilo, parseListado } from './parse.js';

// "bot" in the User-Agent keeps the CLI out of the site's visit stats (BOT regex in app.js).
const USER_AGENT = 'txt-cli/0.1 (terminal client; bot)';
const VIGENCIA_MS = 60_000;
const PLAZO_MS = 15_000;
const EN_PARALELO = 4;

export function crearCliente({ baseUrl = 'https://txt.421.news', fetch: pedir = globalThis.fetch } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  const cache = new Map(); // ruta → { t, promesa }

  async function traer(ruta) {
    const r = await pedir(`${base}${ruta}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
      signal: AbortSignal.timeout(PLAZO_MS),
    });
    if (r.status === 404) throw new Error('No encontrado.');
    if (!r.ok) throw new Error(`El sitio respondió ${r.status}.`);
    return r.text();
  }

  // Same route within a minute: the same promise (also while it's in flight). `fresco` skips it.
  function texto(ruta, { fresco = false } = {}) {
    const hit = cache.get(ruta);
    if (!fresco && hit && Date.now() - hit.t < VIGENCIA_MS) return hit.promesa;
    const promesa = traer(ruta);
    cache.set(ruta, { t: Date.now(), promesa });
    promesa.catch(() => cache.delete(ruta));
    return promesa;
  }

  // Few requests at a time: a list page opens 10 threads.
  let activas = 0;
  const cola = [];
  const turno = () => {
    if (activas >= EN_PARALELO || !cola.length) return;
    activas++;
    const { tarea, ok, mal } = cola.shift();
    tarea().then(ok, mal).finally(() => {
      activas--;
      turno();
    });
  };
  const limitado = (tarea) =>
    new Promise((ok, mal) => {
      cola.push({ tarea, ok, mal });
      turno();
    });

  return {
    baseUrl: base,
    // board: null for the home page. pagina: page of the .txt listing (60 threads each).
    async listado({ board = null, archivo = false, pagina = 1, fresco = false }) {
      const ruta = board ? `/b/${board}${archivo ? '/archivo' : ''}.txt` : '/index.txt';
      return parseListado(await texto(`${ruta}${pagina > 1 ? `?pagina=${pagina}` : ''}`, { fresco }));
    },
    async hilo(id, { fresco = false } = {}) {
      return { id, ...parseHilo(await limitado(() => texto(`/h/${id}.txt`, { fresco }))) };
    },
  };
}
