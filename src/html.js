import { BOARDS, desenvolver } from './parse.js';

// The pages that only exist as HTML (they need a session): Respuestas and Guardados. Read with
// regexes against the markup of the site's views (src/views.js in txt); the fixtures in test/ are
// rendered from those same views.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const desescapar = (s) =>
  s.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (m, d, x, n) =>
    d ? String.fromCodePoint(Number(d)) : x ? String.fromCodePoint(parseInt(x, 16)) : (ENTIDADES[n] ?? m),
  );
const texto = (html) => desescapar(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const tablonPorNombre = (nombre) => BOARDS.find((b) => b.nombre === nombre)?.slug ?? null;
const lista = (html, clase) => html.match(new RegExp(`<ul class="${clase}">([\\s\\S]*?)</ul>`))?.[1] ?? '';
const items = (ul) => [...ul.matchAll(/<li(?: class="([^"]*)")?>([\s\S]*?)<\/li>/g)].map((m) => ({ clase: m[1] ?? '', html: m[2] }));

// "· Tecnología · 39 respuestas · <rest>" (the rest depends on the page).
function detalleHilo(span) {
  const [tablon, respuestas, ...resto] = texto(span).replace(/^· /, '').split(' · ');
  return { tablon: tablonPorNombre(tablon), respuestas: parseInt(respuestas, 10) || 0, resto };
}

// The unread replies count, from the header of any page with a session.
export function novedadesDe(html) {
  return Number(html.match(/aria-label="Respuestas \((\d+) nuevas?\)"/)?.[1] ?? 0);
}

// The CSRF token, in the forms of any page with a session.
export function csrfDe(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? desescapar(m[1]) : null;
}

// /respuestas → { avisos, mias, novedades }. `nueva`: unread before this visit (the visit marks them read).
export function parseRespuestas(html) {
  const avisos = items(lista(html, 'avisos')).flatMap(({ clase, html: li }) => {
    const m = li.match(/<a href="\/h\/(\d+)#p(\d+)">([\s\S]*?)<\/a>\s*<span class="ayuda">([\s\S]*?)<\/span>\s*<div class="extracto">([\s\S]*?)<\/div>/);
    if (!m) return [];
    const partes = texto(m[4]).replace(/^· /, '').split(' · ');
    return [{
      hiloId: Number(m[1]),
      postId: Number(m[2]),
      asunto: texto(m[3]),
      que: partes[0] ?? '', // "alguien te respondió", …
      fecha: partes[1] ?? '',
      nueva: clase.split(' ').includes('nueva'),
      extracto: texto(m[5]),
    }];
  });
  const mias = items(lista(html, 'mias')).flatMap(({ html: li }) => {
    const m = li.match(/<a href="\/h\/(\d+)">([\s\S]*?)<\/a>\s*<span class="ayuda">([\s\S]*?)<\/span>/);
    if (!m) return [];
    const { tablon, respuestas, resto } = detalleHilo(m[3]);
    return [{ hiloId: Number(m[1]), asunto: texto(m[2]), tablon, respuestas, ultima: (resto[0] ?? '').replace(/^tu último mensaje: /, '') }];
  });
  return { avisos, mias, novedades: novedadesDe(html) };
}

// /guardados → { hilos, novedades }.
export function parseGuardados(html) {
  const hilos = items(lista(html, 'mias')).flatMap(({ html: li }) => {
    const m = li.match(/<a href="\/h\/(\d+)">([\s\S]*?)<\/a>\s*<span class="ayuda">([\s\S]*?)<\/span>/);
    if (!m) return [];
    const { tablon, respuestas, resto } = detalleHilo(m[3]);
    return [{ hiloId: Number(m[1]), asunto: texto(m[2]), tablon, respuestas, fecha: resto[0] ?? '', archivada: resto.includes('archivada') }];
  });
  return { hilos, novedades: novedadesDe(html) };
}

// A plain-text document (normas.txt): what comes after the site's header, title and paragraphs.
// The server wraps at 78 columns; desenvolver undoes it.
export function parseDocumento(txt) {
  const lineas = txt.replace(/\r\n?/g, '\n').split('\n');
  const desde = lineas.findLastIndex((l) => /^·+$/.test(l)) + 1;
  const cuerpo = lineas.slice(desde).filter((l, i, a) => l || (i > 0 && i < a.length - 1));
  while (cuerpo.length && !cuerpo[0]) cuerpo.shift();
  let titulo = '';
  if (cuerpo.length > 1 && /^=+$/.test(cuerpo[1])) titulo = cuerpo.splice(0, 2)[0];
  while (cuerpo.length && !cuerpo.at(-1)) cuerpo.pop();
  return { titulo, parrafos: desenvolver(cuerpo, 78) };
}

// /buscar → { texto, total, resultados, pagina, paginas }. One result per message (not per thread).
// The match inside `fragmento` keeps the site's FTS marks, \u0001 … \u0002, so it can be wrapped as
// plain text and highlighted afterwards.
export function parseBusqueda(html) {
  const resultados = [...(html.match(/<ol class="resultados">([\s\S]*?)<\/ol>/)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].flatMap(([, li]) => {
    const m = li.match(/<a class="res-asunto" href="\/h\/(\d+)#p(\d+)">([\s\S]*?)<\/a>\s*<span class="ayuda">([\s\S]*?)<\/span>/);
    if (!m) return [];
    const [tablon, , ...resto] = texto(m[4]).split(' · '); // section · No.N · …
    const frag = li.match(/<p class="res-fragmento">([\s\S]*?)<\/p>/)?.[1];
    return [{
      hiloId: Number(m[1]),
      postId: Number(m[2]),
      asunto: texto(m[3]),
      tablon: tablonPorNombre(tablon),
      esOp: resto.includes('mensaje inicial'),
      archivada: resto.includes('archivada'),
      fecha: resto.find((r) => r !== 'mensaje inicial' && r !== 'archivada') ?? '',
      fragmento: frag == null ? null : texto(frag.replace(/<mark>/g, '\u0001').replace(/<\/mark>/g, '\u0002')),
    }];
  });
  const paginas = Math.max(1, ...[...html.matchAll(/aria-label="Página (\d+)"/g)].map((m) => Number(m[1])));
  return {
    texto: desescapar(html.match(/<input type="search" name="q" value="([^"]*)"/)?.[1] ?? ''),
    total: Number(html.match(/<p class="ayuda">(\d+) resultados?, incluido el archivo\.<\/p>/)?.[1] ?? resultados.length),
    resultados,
    pagina: Number(html.match(/aria-current="page" aria-label="Página (\d+)"/)?.[1] ?? 1),
    paginas,
  };
}
