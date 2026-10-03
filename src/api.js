import { csrfDe, desescapar, parseBusqueda, parseDocumento, parseGuardados, parseRespuestas } from './html.js';
import { parseHilo, parseListado } from './parse.js';

// "bot" in the User-Agent keeps the CLI out of the site's visit stats (BOT regex in app.js).
const USER_AGENT = 'txt-cli/0.1 (terminal client; bot)';
const VIGENCIA_MS = 60_000;
const PLAZO_MS = 15_000;
const EN_PARALELO = 4;
// Replies go through the site's moderation (up to 30 s per try, one retry) before they're published.
const PLAZO_PUBLICAR_MS = 90_000;
export const MAX_CUERPO = 8000; // LIMITS.cuerpo on the site

const SESION_VENCIDA = 'La sesión no vale más: corré txt login de nuevo.';
const SIN_SESION = 'Hay que entrar: txt login';
// The site re-renders the thread with <p class="error">…</p> when it doesn't take a reply.
const errorDelSitio = (html) => {
  const m = html.match(/<p class="error">([\s\S]*?)<\/p>/);
  return m ? desescapar(m[1].replace(/<[^>]+>/g, '').trim()) : null;
};

// cookie: the site's session (see `txt login`), sent as-is; null browses logged out.
// salir() drops it: from then on the client browses logged out.
export function crearCliente({ baseUrl = 'https://txt.421.news', fetch: pedir = globalThis.fetch, cookie = null } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  const cache = new Map(); // ruta → { t, promesa }

  async function traer(ruta) {
    const r = await pedir(`${base}${ruta}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain', ...(cookie ? { Cookie: cookie } : {}) },
      signal: AbortSignal.timeout(PLAZO_MS),
    });
    if (r.status === 404) throw new Error('No encontrado.');
    if (cookie && (r.status === 401 || r.status === 403)) throw new Error(SESION_VENCIDA);
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

  // The CSRF token is fixed for the whole session; logged-in pages carry it in their forms.
  let csrf = null;

  // A page that needs the session (HTML: these have no .txt). Without one the site redirects to /entrar.
  async function paginaConSesion(ruta) {
    if (!cookie) throw new Error(SIN_SESION);
    const r = await pedir(`${base}${ruta}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', Cookie: cookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(PLAZO_MS),
    });
    if (r.status >= 300 && r.status < 400) throw new Error(SESION_VENCIDA);
    if (!r.ok) throw new Error(`El sitio respondió ${r.status}.`);
    const html = await r.text();
    csrf ??= csrfDe(html);
    return html;
  }
  async function tokenCsrf() {
    if (csrf) return csrf;
    await paginaConSesion('/cuenta');
    if (!csrf) throw new Error('No encontré el token del formulario en la página de la cuenta.');
    return csrf;
  }
  // A form like the site's: → the redirect's destination (a URL), or the response if it didn't redirect.
  async function enviarFormulario(ruta, campos, { plazo = PLAZO_MS } = {}) {
    if (!cookie) throw new Error(SIN_SESION);
    const r = await pedir(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: await tokenCsrf(), ...campos }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(plazo),
    });
    if (r.status >= 300 && r.status < 400) return new URL(r.headers.get('location') ?? '/', base);
    if (r.status === 403) csrf = null;
    return r;
  }

  return {
    baseUrl: base,
    get conSesion() {
      return !!cookie;
    },
    // /cuenta answers 200 with a valid session and redirects to /entrar without one.
    async sesionValida() {
      const r = await pedir(`${base}/cuenta`, {
        headers: { 'User-Agent': USER_AGENT, ...(cookie ? { Cookie: cookie } : {}) },
        redirect: 'manual',
        signal: AbortSignal.timeout(PLAZO_MS),
      });
      if (r.ok) return true;
      if (r.status >= 300 && r.status < 400) return false;
      throw new Error(`El sitio respondió ${r.status}.`);
    },
    // board: null for the home page. pagina: page of the .txt listing (60 threads each).
    async listado({ board = null, archivo = false, pagina = 1, fresco = false }) {
      const ruta = board ? `/b/${board}${archivo ? '/archivo' : ''}.txt` : '/index.txt';
      return parseListado(await texto(`${ruta}${pagina > 1 ? `?pagina=${pagina}` : ''}`, { fresco }));
    },
    // → { postId, enCola }. postId is null if the site didn't say where the reply landed;
    // enCola: moderation held it for review, so it doesn't show yet.
    async responder(hiloId, cuerpo, { sage = false } = {}) {
      if (!cookie) throw new Error('Para responder hay que entrar: txt login');
      const r = await enviarFormulario(`/h/${hiloId}/responder`, { cuerpo, ...(sage ? { sage: '1' } : {}) }, { plazo: PLAZO_PUBLICAR_MS });
      if (r instanceof URL) {
        const destino = r;
        if (destino.pathname === '/entrar') throw new Error(SESION_VENCIDA);
        if (destino.pathname !== `/h/${hiloId}`) throw new Error('El sitio no aceptó la respuesta (¿la cuenta sigue activa?).');
        const id = destino.hash.match(/^#p(\d+)$/);
        return { postId: id ? Number(id[1]) : null, enCola: destino.searchParams.get('aviso') === 'cola' };
      }
      if (r.status === 404) throw new Error('La publicación ya no existe.');
      if (r.status === 403) throw new Error('El sitio rechazó el formulario (venció el token): probá de nuevo.');
      throw new Error(errorDelSitio(await r.text()) ?? `El sitio respondió ${r.status}.`);
    },
    // Opening Respuestas marks them all read on the site, like on the web.
    async respuestas() {
      return parseRespuestas(await paginaConSesion('/respuestas'));
    },
    // Also the cheap way to read the unread count (it's in the header).
    async guardados() {
      return parseGuardados(await paginaConSesion('/guardados'));
    },
    // guardar: true saves the thread, false takes it out of Guardados.
    async guardar(hiloId, guardar) {
      const r = await enviarFormulario(`/h/${hiloId}/guardar`, guardar ? {} : { quitar: '1' });
      if (r instanceof URL) {
        if (r.pathname === '/entrar') throw new Error(SESION_VENCIDA);
        return;
      }
      if (r.status === 404) throw new Error('La publicación ya no existe.');
      throw new Error(r.status === 403 ? 'El sitio rechazó el formulario: probá de nuevo.' : `El sitio respondió ${r.status}.`);
    },
    // Closes the session on the site too, and only then drops it here: if the site can't be reached,
    // it throws and the session stays (still open on the site). If the site no longer knew it, done.
    async salir() {
      try {
        const r = await enviarFormulario('/salir', {});
        if (!(r instanceof URL)) throw new Error(`El sitio respondió ${r.status}.`);
      } catch (err) {
        if (err.message !== SESION_VENCIDA) throw err;
      }
      cookie = null;
      csrf = null;
      cache.clear();
    },
    // The site's search (HTML only; no session needed): messages, 20 per page, archive included.
    async buscar(texto, { pagina = 1 } = {}) {
      const q = new URLSearchParams({ q: texto, ...(pagina > 1 ? { pagina: String(pagina) } : {}) });
      const r = await pedir(`${base}/buscar?${q}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: AbortSignal.timeout(PLAZO_MS),
      });
      if (!r.ok) throw new Error(`El sitio respondió ${r.status}.`);
      return parseBusqueda(await r.text());
    },
    async normas({ fresco = false } = {}) {
      return parseDocumento(await texto('/normas.txt', { fresco }));
    },
    async hilo(id, { fresco = false } = {}) {
      return { id, ...parseHilo(await limitado(() => texto(`/h/${id}.txt`, { fresco }))) };
    },
  };
}
