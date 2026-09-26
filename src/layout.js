import stringWidth from 'string-width';
import { BOARDS } from './parse.js';

// Everything is drawn as a list of lines (arrays of styled segments) so the viewport can scroll by
// line and the height of each thread is known. A segment: { t, color, bg, bold, dim, underline }.

export const COLOR = {
  verde: '#33ff66',
  tenue: '#1f8f40',
  texto: '#c3f7d0',
  cita: '#e8ff5c',
  greentext: '#8dff9f',
  negro: '#021004',
  error: '#ff6b6b',
};

const RESPUESTAS_EN_RESUMEN = 3;
const MAX_EN_RESUMEN = 800;

export const anchoDe = (segs) => segs.reduce((n, s) => n + stringWidth(s.t), 0);
const seg = (t, estilo = {}) => ({ t, ...estilo });
const espacios = (n) => seg(' '.repeat(Math.max(0, n)));

// Cuts a string to `ancho` columns (a code point at a time, so accents and emoji stay whole).
function cortar(texto, ancho) {
  let out = '';
  for (const c of texto) {
    if (stringWidth(out + c) > ancho) break;
    out += c;
  }
  return out;
}

// Word wrap at `ancho` columns; a word longer than the line is split.
export function envolver(texto, ancho) {
  if (!texto) return [''];
  const lineas = [];
  let actual = '';
  for (let palabra of texto.split(' ')) {
    while (stringWidth(palabra) > ancho) {
      if (actual) {
        lineas.push(actual);
        actual = '';
      }
      const trozo = cortar(palabra, ancho);
      lineas.push(trozo);
      palabra = palabra.slice(trozo.length);
    }
    if (!actual) actual = palabra;
    else if (stringWidth(`${actual} ${palabra}`) <= ancho) actual += ` ${palabra}`;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  lineas.push(actual);
  return lineas;
}

// >>123 and [spoiler] get their own style, like on the web.
function marcas(texto, base) {
  return texto
    .split(/(>>\d+|\[spoiler\])/)
    .filter(Boolean)
    .map((t) => {
      if (/^>>\d+$/.test(t)) return seg(t, { color: COLOR.cita, underline: true });
      if (t === '[spoiler]') return seg(t, { color: COLOR.tenue, bg: COLOR.tenue });
      return seg(t, base);
    });
}

// The .txt version can't hide spoilers: it writes "[spoiler: leelo en la web]". A single word
// keeps it from wrapping in the middle.
const sinSpoiler = (t) => t.replaceAll('[spoiler: leelo en la web]', '[spoiler]');

// Keeps the first `max` characters of a post, like extracto() on the web list view.
function recortar(lineas, max) {
  const out = [];
  let quedan = max;
  for (const l of lineas) {
    if (quedan <= 0) break;
    if (l.texto.length <= quedan) out.push(l);
    else {
      out.push({ ...l, texto: `${l.texto.slice(0, quedan).trimEnd()}…` });
      quedan = 0;
      break;
    }
    quedan -= l.texto.length + 1;
  }
  if (quedan <= 0 && out.length < lineas.length && !out.at(-1).texto.endsWith('…')) {
    out[out.length - 1] = { ...out.at(-1), texto: `${out.at(-1).texto}…` };
  }
  return out;
}

const linea = (sangria, segs, extra = {}) => ({ segs: [espacios(sangria), ...segs], ...extra });

// Header of a post: `izq` on the left, No.N on the right, `ancho` columns.
function cabecera(post, ancho, { op }) {
  const izq = [
    seg(`ID ${post.anon}`, op ? { bold: true } : {}),
    ...(post.op ? [seg('  '), seg(' OP ', op ? { bg: COLOR.negro, color: COLOR.verde, bold: true } : { color: COLOR.verde, bold: true })] : []),
    ...(post.sage ? [seg('  sage', op ? {} : { color: COLOR.tenue })] : []),
    seg(`  ${post.fecha}`),
  ];
  const der = [seg(`No.${post.id}`, { bold: true, ...(op ? {} : { color: COLOR.verde }) })];
  const hueco = ancho - anchoDe(izq) - anchoDe(der);
  return hueco >= 1 ? [...izq, espacios(hueco), ...der] : [...izq, seg(' '), ...der];
}

// A post in a box. The OP carries its header as a filled bar, like on the web.
function cajaPost(post, { ancho, sangria = 0, resumen = false, cargando = false }) {
  const out = [];
  const interior = ancho - 4;
  const esOp = post.esOp;
  const b = { color: esOp ? COLOR.verde : COLOR.tenue };

  if (post.eliminado) {
    out.push(linea(sangria, [seg(`No.${post.id} · Eliminado por ${post.eliminado}.`, { color: COLOR.tenue, italic: true })]));
    return out;
  }

  if (esOp) {
    const barra = cabecera(post, ancho - 2, { op: true });
    const estilo = { bg: COLOR.verde, color: COLOR.negro };
    out.push(linea(sangria, [seg(' ', estilo), ...barra.map((s) => ({ ...estilo, ...s })), seg(' ', estilo)]));
  } else {
    out.push(linea(sangria, [seg(`┌${'─'.repeat(ancho - 2)}┐`, b)]));
    const cab = cabecera(post, interior, { op: false }).map((s) => ({ color: COLOR.tenue, ...s }));
    out.push(linea(sangria, [seg('│ ', b), ...cab, espacios(interior - anchoDe(cab)), seg(' │', b)]));
  }

  const texto = resumen ? recortar(post.lineas, MAX_EN_RESUMEN) : post.lineas;
  const cuerpo = [];
  for (const l of texto) {
    const base = l.tipo === 'cita' ? { color: COLOR.greentext } : { color: COLOR.texto };
    const crudo = sinSpoiler(l.tipo === 'cita' ? `>${l.texto}` : l.texto);
    for (const trozo of envolver(crudo, interior)) cuerpo.push(marcas(trozo, base));
  }
  if (cargando) cuerpo.push([seg('cargando…', { color: COLOR.tenue })]);
  if (!resumen && post.respuestas?.length) {
    cuerpo.push([]);
    const refs = `Respuestas: ${post.respuestas.map((n) => `>>${n}`).join(' ')}`;
    for (const trozo of envolver(refs, interior)) cuerpo.push(marcas(trozo, { color: COLOR.tenue }));
  }
  if (esOp) cuerpo.unshift([]);
  if (esOp) cuerpo.push([]);
  for (const segs of cuerpo) {
    out.push(linea(sangria, [seg('│ ', b), ...segs, espacios(interior - anchoDe(segs)), seg(' │', b)]));
  }
  out.push(linea(sangria, [seg(`└${'─'.repeat(ancho - 2)}┘`, b)]));
  return out;
}

const nombreTablon = (slug) => BOARDS.find((b) => b.slug === slug)?.nombre ?? slug;

function tituloHilo(asunto, { ancho, seleccionado, board }) {
  const marca = seleccionado ? seg('▶ ', { color: COLOR.cita, bold: true }) : seg('  ');
  const etiqueta = board ? ` [${nombreTablon(board).toUpperCase()}]` : '';
  const trozos = envolver(asunto, ancho - 2 - etiqueta.length);
  return trozos.map((t, i) =>
    linea(0, [
      i === 0 ? marca : seg('  '),
      seg(t, { color: COLOR.verde, bold: true, ...(seleccionado ? { underline: true } : {}) }),
      ...(i === trozos.length - 1 && etiqueta ? [seg(etiqueta, { color: COLOR.tenue })] : []),
    ]),
  );
}

// The list view (?vista=lista): each thread with its opening post, "N omitted" and the last
// replies. `entrada` comes from the listing; `hilo` (the full thread) may still be loading.
export function armarLista(items, { ancho, seleccionado, conTablon }) {
  const lineas = [];
  const anclas = [];
  items.forEach(({ entrada, hilo, error }, n) => {
    anclas.push({ linea: lineas.length, id: entrada.id });
    lineas.push(...tituloHilo(entrada.asunto, { ancho, seleccionado: n === seleccionado, board: conTablon ? entrada.board : null }));

    let op;
    let respuestas = [];
    if (hilo) {
      const publicados = hilo.posts.filter((p) => !p.eliminado);
      op = hilo.posts[0] ? { ...hilo.posts[0], esOp: true } : null;
      respuestas = publicados.slice(1).slice(-RESPUESTAS_EN_RESUMEN);
    }
    if (!op) {
      // Still loading (or it failed): the excerpt from the listing, like the catalogue card.
      op = { id: '…', anon: '…', fecha: entrada.fecha, op: true, esOp: true, lineas: [{ tipo: 'usuario', texto: entrada.extracto }] };
    }
    lineas.push(...cajaPost(op, { ancho, resumen: true, cargando: !hilo && !error }));
    if (error) lineas.push(linea(2, [seg(`No se pudo cargar: ${error}`, { color: COLOR.error })]));

    const omitidas = Math.max(0, entrada.respuestas - respuestas.length);
    if (hilo && omitidas) {
      lineas.push(linea(4, [
        seg(`… ${omitidas === 1 ? '1 respuesta omitida' : `${omitidas} respuestas omitidas`}. `, { color: COLOR.tenue }),
        seg('Enter', { color: COLOR.verde, underline: true }),
        seg(' ver la publicación completa', { color: COLOR.tenue }),
      ]));
    }
    for (const r of respuestas) {
      lineas.push(linea(0, []));
      lineas.push(...cajaPost(r, { ancho: ancho - 4, sangria: 4, resumen: true }));
    }
    lineas.push(linea(2, [seg(`${entrada.respuestas} ${entrada.respuestas === 1 ? 'respuesta' : 'respuestas'}`, { color: COLOR.tenue })]));
    lineas.push(linea(0, [seg('╌'.repeat(ancho), { color: COLOR.tenue })]));
    lineas.push(linea(0, []));
  });
  if (!items.length) lineas.push(linea(2, [seg('No hay publicaciones todavía.', { color: COLOR.tenue })]));
  return { lineas, anclas };
}

// A whole thread (/h/:id). Anchors: one per post, for jumping between them.
export function armarHilo(hilo, { ancho }) {
  const lineas = [];
  const anclas = [];
  lineas.push(linea(0, [seg(`← ${nombreTablon(hilo.board)}`, { color: COLOR.tenue })]));
  for (const t of envolver(hilo.asunto, ancho)) lineas.push(linea(0, [seg(t, { color: COLOR.verde, bold: true })]));
  const estado = hilo.archivado
    ? 'Publicación archivada: se puede leer pero ya no acepta respuestas.'
    : hilo.cerrado
      ? 'Publicación cerrada: llegó al límite de respuestas.'
      : null;
  if (estado) lineas.push(linea(0, [seg(estado, { color: COLOR.cita })]));
  lineas.push(linea(0, []));
  hilo.posts.forEach((p, i) => {
    anclas.push({ linea: lineas.length, id: p.id });
    lineas.push(...cajaPost({ ...p, esOp: i === 0 }, { ancho }));
    lineas.push(linea(0, []));
  });
  return { lineas, anclas };
}
