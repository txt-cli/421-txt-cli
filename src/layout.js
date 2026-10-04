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
  ignorado: '#6e6e6e', // border and bar of an ignored post: only its header shows
  fijada: '#ffb347', // border and bar of a pinned thread's OP
  guardada: '#ffd700', // the ★ before the title of a saved thread
};

const RESPUESTAS_EN_RESUMEN = 3;
const MAX_EN_RESUMEN = 800;

export const anchoDe = (segs) => segs.reduce((n, s) => n + stringWidth(s.t), 0);
const seg = (t, estilo = {}) => ({ t, ...estilo });
// Before the title of a saved thread; the title's next lines keep its indent.
const ESTRELLA = seg('★ ', { color: COLOR.guardada, bold: true });
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
// ignorado: false, or why it's collapsed (true → 'ignorado', or a word like 'filtrada').
function cabecera(post, ancho, { op, ignorado = false }) {
  const acento = ignorado ? COLOR.ignorado : COLOR.verde;
  const izq = [
    seg(post.nombre ?? `ID ${post.anon}`, op ? { bold: true } : {}),
    ...(post.op ? [seg('  '), seg(' OP ', op ? { bg: COLOR.negro, color: acento, bold: true } : { color: acento, bold: true })] : []),
    ...(post.sage ? [seg('  sage', op ? {} : { color: COLOR.tenue })] : []),
    seg(`  ${post.fecha}`),
    ...(ignorado ? [seg(`  · ${typeof ignorado === 'string' ? ignorado : 'ignorado'}`, { italic: true })] : []),
  ];
  const der = [seg(`No.${post.id}`, { bold: true, ...(op ? {} : { color: acento }) })];
  const hueco = ancho - anchoDe(izq) - anchoDe(der);
  return hueco >= 1 ? [...izq, espacios(hueco), ...der] : [...izq, seg(' '), ...der];
}

// A post in a box. The OP carries its header as a filled bar, like on the web.
// An ignored post is just its header, in grey (`ignorado` can say why: see cabecera). A pinned
// thread's OP goes in amber (grey wins).
function cajaPost(post, { ancho, sangria = 0, resumen = false, cargando = false, ignorado = false, fijada = false }) {
  const out = [];
  const interior = ancho - 4;
  const esOp = post.esOp;
  const resalte = ignorado ? COLOR.ignorado : fijada ? COLOR.fijada : null;
  const b = { color: resalte ?? (esOp ? COLOR.verde : COLOR.tenue) };

  if (post.eliminado) {
    out.push(linea(sangria, [seg(`No.${post.id} · Eliminado por ${post.eliminado}.`, { color: COLOR.tenue, italic: true })]));
    return out;
  }

  if (esOp) {
    const barra = cabecera(post, ancho - 2, { op: true, ignorado });
    const estilo = { bg: resalte ?? COLOR.verde, color: COLOR.negro };
    out.push(linea(sangria, [seg(' ', estilo), ...barra.map((s) => ({ ...estilo, ...s })), seg(' ', estilo)]));
  } else {
    out.push(linea(sangria, [seg(`┌${'─'.repeat(ancho - 2)}┐`, b)]));
    const cab = cabecera(post, interior, { op: false, ignorado }).map((s) => ({ color: ignorado ? COLOR.ignorado : COLOR.tenue, ...s }));
    out.push(linea(sangria, [seg('│ ', b), ...cab, espacios(interior - anchoDe(cab)), seg(' │', b)]));
  }
  if (ignorado) {
    out.push(linea(sangria, [seg(`└${'─'.repeat(ancho - 2)}┘`, b)]));
    return out;
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

function tituloHilo(asunto, { ancho, seleccionado, board, fijada = false, guardada = false }) {
  const marca = seleccionado ? seg('▶ ', { color: COLOR.cita, bold: true }) : seg('  ');
  const etiqueta = board ? ` [${nombreTablon(board).toUpperCase()}]` : '';
  const fija = fijada ? ' FIJADA ' : '';
  const sangria = guardada ? 4 : 2;
  const trozos = envolver(asunto, ancho - sangria - etiqueta.length - fija.length - (fija ? 1 : 0));
  return trozos.map((t, i) =>
    linea(0, [
      ...(i === 0 ? [marca, ...(guardada ? [ESTRELLA] : [])] : [seg(' '.repeat(sangria))]),
      seg(t, { color: COLOR.verde, bold: true, ...(seleccionado ? { underline: true } : {}) }),
      ...(i === trozos.length - 1 && fija ? [seg(' '), seg(fija, { bg: COLOR.fijada, color: COLOR.negro, bold: true })] : []),
      ...(i === trozos.length - 1 && etiqueta ? [seg(etiqueta, { color: COLOR.tenue })] : []),
    ]),
  );
}

// Red line with a warning, before what's hidden at the bottom (threads of a page, messages of a thread).
function divisoria(aviso, { ancho }) {
  const texto = ` ${aviso} `;
  const rojo = { color: COLOR.error, bold: true };
  if (stringWidth(texto) + 4 > ancho) {
    return [linea(0, [seg('━'.repeat(ancho), rojo)]), ...envolver(texto.trim(), ancho).map((t) => linea(0, [seg(t, rojo)])), linea(0, [])];
  }
  return [linea(0, [seg('━━', rojo), seg(texto, rojo), seg('━'.repeat(ancho - 2 - stringWidth(texto)), rojo)]), linea(0, [])];
}

// The list view (?vista=lista): each thread with its opening post, "N omitted" and the last
// replies. `entrada` comes from the listing; `hilo` (the full thread) may still be loading.
// `nombres`: the thread's ID → username map, if there is one (see nombres.js).
// `ignorados`: { hilo(id), mensaje(hiloId, post) } → true for what to show as a header only.
// An item's `oculta` ('ignorado' | 'filtrada'): the whole thread collapses. Hidden threads go last
// (the caller orders them); a red line goes before the first one.
// `guardadas`: Set of the saved threads' ids (★ before their title).
export function armarLista(items, { ancho, seleccionado, conTablon, ignorados = null, guardadas = null }) {
  const lineas = [];
  const anclas = [];
  const ocultas = items.filter((i) => i.oculta).length;
  items.forEach(({ entrada, hilo, error, nombres, oculta }, n) => {
    const nombre = (p) => ({ ...p, nombre: nombres?.get(p.anon) });
    const hiloIgnorado = oculta ?? (ignorados?.hilo(entrada.id) ? 'ignorado' : null);
    // The first hidden one's anchor is the red line: jumping to it shows the warning too.
    anclas.push({ linea: lineas.length, id: entrada.id });
    if (oculta && !items[n - 1]?.oculta) {
      lineas.push(...divisoria(`${ocultas === 1 ? '1 publicación oculta' : `${ocultas} publicaciones ocultas`}: ignoradas (i) o filtradas (I)`, { ancho }));
    }
    lineas.push(...tituloHilo(entrada.asunto, {
      ancho,
      seleccionado: n === seleccionado,
      board: conTablon ? entrada.board : null,
      fijada: entrada.fijada,
      guardada: !!guardadas?.has(entrada.id),
    }));

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
    if (hiloIgnorado) {
      // Ignored thread: the title and the OP's header, nothing else.
      lineas.push(...cajaPost(nombre(op), { ancho, ignorado: hiloIgnorado }));
      lineas.push(linea(0, [seg('╌'.repeat(ancho), { color: COLOR.tenue })]));
      lineas.push(linea(0, []));
      return;
    }
    lineas.push(...cajaPost(nombre(op), {
      ancho,
      resumen: true,
      cargando: !hilo && !error,
      ignorado: !!(hilo && ignorados?.mensaje(entrada.id, op)),
      fijada: entrada.fijada,
    }));
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
      lineas.push(...cajaPost(nombre(r), { ancho: ancho - 4, sangria: 4, resumen: true, ignorado: !!ignorados?.mensaje(entrada.id, r) }));
    }
    lineas.push(linea(2, [seg(`${entrada.respuestas} ${entrada.respuestas === 1 ? 'respuesta' : 'respuestas'}`, { color: COLOR.tenue })]));
    lineas.push(linea(0, [seg('╌'.repeat(ancho), { color: COLOR.tenue })]));
    lineas.push(linea(0, []));
  });
  if (!items.length) lineas.push(linea(2, [seg('No hay publicaciones todavía.', { color: COLOR.tenue })]));
  return { lineas, anclas };
}

// One message on its own (the composer shows the one being quoted), at most `maximo` lines:
// a longer one keeps its start and the box's bottom edge, with "…" in between.
export function armarPost(post, { ancho, esOp = false, maximo = Infinity }) {
  const lineas = cajaPost({ ...post, esOp }, { ancho, resumen: true });
  if (lineas.length <= maximo) return lineas;
  const b = { color: esOp ? COLOR.verde : COLOR.tenue };
  const puntos = linea(0, [seg('│ ', b), seg('…', { color: COLOR.tenue }), espacios(ancho - 5), seg(' │', b)]);
  return [...lineas.slice(0, Math.max(1, maximo - 2)), puntos, lineas.at(-1)];
}

// A whole thread (/h/:id). Anchors: one per post, for jumping between them.
// nombres: Map of anonymous ID → username to show instead of the ID (see nombres.js).
// ignorados: like in armarLista; an ignored thread shows its OP as a header only.
// fijada: the thread is pinned (the .txt thread doesn't say; it comes from a listing).
// guardada: it's in Guardados (★ before the title). filtrada: it matches an ignore filter (its OP
// collapses, like an ignored thread's).
export function armarHilo(hilo, { ancho, nombres = null, ignorados = null, fijada = false, guardada = false, filtrada = false }) {
  const lineas = [];
  const anclas = [];
  lineas.push(linea(0, [seg(`← ${nombreTablon(hilo.board)}`, { color: COLOR.tenue })]));
  envolver(hilo.asunto, ancho - (guardada ? 2 : 0)).forEach((t, i) =>
    lineas.push(linea(0, [...(guardada ? [i === 0 ? ESTRELLA : seg('  ')] : []), seg(t, { color: COLOR.verde, bold: true })])),
  );
  const estado = hilo.archivado
    ? 'Publicación archivada: se puede leer pero ya no acepta respuestas.'
    : hilo.cerrado
      ? 'Publicación cerrada: llegó al límite de respuestas.'
      : null;
  if (estado) lineas.push(linea(0, [seg(estado, { color: COLOR.cita })]));
  lineas.push(linea(0, []));
  // The OP stays first (ignoring it is ignoring the thread). Ignored replies, one by one or by their
  // author, go to the end, after a red line; the first one's anchor is that line, like in the list.
  const [op, ...resto] = hilo.posts;
  const ignorada = (p) => !!ignorados?.mensaje(hilo.id, p);
  const ocultas = resto.filter(ignorada);
  const orden = [...(op ? [op] : []), ...resto.filter((p) => !ignorada(p)), ...ocultas];
  orden.forEach((p, i) => {
    const esOp = p === op;
    anclas.push({ linea: lineas.length, id: p.id });
    if (p === ocultas[0]) {
      const n = ocultas.length;
      lineas.push(...divisoria(`${n === 1 ? '1 mensaje oculto' : `${n} mensajes ocultos`}: ignorados (i) o de autores ignorados (I)`, { ancho }));
    }
    const ignorado = (esOp && ignorados?.hilo(hilo.id)) || ignorada(p) ? 'ignorado' : esOp && filtrada ? 'filtrada' : false;
    lineas.push(...cajaPost({ ...p, esOp, nombre: nombres?.get(p.anon) }, { ancho, ignorado, fijada: fijada && esOp }));
    lineas.push(linea(0, []));
  });
  return { lineas, anclas };
}

// --- Screens from the menu ------------------------------------------------------------------
// Same shape as the list: { lineas, anclas }, one anchor per entry that Enter opens.

const ENTRADA_EXTRACTO = 3; // lines of excerpt per reply in Respuestas

function encabezado(titulo, ayuda, { ancho }) {
  return [
    linea(0, [seg(titulo, { color: COLOR.verde, bold: true })]),
    ...envolver(ayuda, ancho).map((t) => linea(0, [seg(t, { color: COLOR.tenue })])),
    linea(0, []),
  ];
}

// One entry: ▶ title (+ tags), then detail lines (dim) and body lines (text, or already-made segments).
function entrada({ titulo, etiquetas = [], detalle = [], cuerpo = [] }, { ancho, seleccionada }) {
  const marca = seleccionada ? seg('▶ ', { color: COLOR.cita, bold: true }) : seg('  ');
  const extra = etiquetas.reduce((n, e) => n + e.t.length + 1, 0);
  const trozos = envolver(titulo, ancho - 2 - extra);
  const out = trozos.map((t, i) =>
    linea(0, [
      i === 0 ? marca : seg('  '),
      seg(t, { color: COLOR.verde, bold: true, ...(seleccionada ? { underline: true } : {}) }),
      ...(i === trozos.length - 1 ? etiquetas.flatMap((e) => [seg(' '), e]) : []),
    ]),
  );
  for (const d of detalle) for (const t of envolver(d, ancho - 2)) out.push(linea(2, [seg(t, { color: COLOR.tenue })]));
  for (const c of cuerpo) out.push(linea(2, Array.isArray(c) ? c : [seg(c, { color: COLOR.texto })]));
  return out;
}

// "Cultura · 30 respuestas · <más>", without the section if it's unknown.
const detalleHilo = (tablon, respuestas, mas) =>
  [tablon && nombreTablon(tablon), `${respuestas} ${respuestas === 1 ? 'respuesta' : 'respuestas'}`, mas].filter(Boolean).join(' · ');

const NUEVA = seg(' NUEVA ', { bg: COLOR.cita, color: COLOR.negro, bold: true });
const ARCHIVADA = seg('archivada', { color: COLOR.tenue, italic: true });

// /respuestas: replies to you (new ones marked) and the threads where you wrote.
export function armarRespuestas({ avisos, mias }, { ancho, seleccionado }) {
  const lineas = encabezado('Respuestas', 'Comentarios en las publicaciones que abriste o guardaste, y mensajes que te citan con >>. Enter abre la publicación en ese mensaje.', { ancho });
  const anclas = [];
  const agregar = (abrir, partes) => {
    anclas.push({ linea: lineas.length, ...abrir });
    lineas.push(...entrada(partes, { ancho, seleccionada: anclas.length - 1 === seleccionado }), linea(0, []));
  };
  if (!avisos.length) lineas.push(linea(2, [seg('Todavía no hay respuestas.', { color: COLOR.tenue })]), linea(0, []));
  for (const a of avisos) {
    const texto = envolver(sinSpoiler(a.extracto), ancho - 2);
    const cuerpo = texto.length > ENTRADA_EXTRACTO ? [...texto.slice(0, ENTRADA_EXTRACTO - 1), `${cortar(texto[ENTRADA_EXTRACTO - 1], ancho - 3)}…`] : texto;
    agregar({ hilo: a.hiloId, post: a.postId }, {
      titulo: a.asunto,
      etiquetas: a.nueva ? [NUEVA] : [],
      detalle: [`${a.que[0].toUpperCase()}${a.que.slice(1)} · ${a.fecha} · No.${a.postId}`],
      cuerpo,
    });
  }
  lineas.push(linea(0, [seg('Donde participaste', { color: COLOR.verde, bold: true })]), linea(0, []));
  if (!mias.length) lineas.push(linea(2, [seg('Todavía no publicaste nada.', { color: COLOR.tenue })]));
  for (const m of mias) {
    agregar({ hilo: m.hiloId }, {
      titulo: m.asunto,
      detalle: [detalleHilo(m.tablon, m.respuestas, `tu último mensaje: ${m.ultima}`)],
    });
  }
  return { lineas, anclas };
}

// /guardados: the threads you saved, newest first.
export function armarGuardados({ hilos }, { ancho, seleccionado }) {
  const lineas = encabezado('Guardados', 'Publicaciones que guardaste para leer después. s adentro de una publicación (o acá) la guarda o la saca.', { ancho });
  const anclas = [];
  if (!hilos.length) lineas.push(linea(2, [seg('Todavía no guardaste nada.', { color: COLOR.tenue })]));
  hilos.forEach((h, i) => {
    anclas.push({ linea: lineas.length, hilo: h.hiloId });
    lineas.push(
      ...entrada(
        {
          titulo: h.asunto,
          etiquetas: h.archivada ? [ARCHIVADA] : [],
          detalle: [detalleHilo(h.tablon, h.respuestas, h.fecha)],
        },
        { ancho, seleccionada: i === seleccionado },
      ),
      linea(0, []),
    );
  });
  return { lineas, anclas };
}

// A text document (Normas): title and paragraphs, nothing to select.
export function armarDocumento({ titulo, parrafos }, { ancho }) {
  const lineas = titulo ? [linea(0, [seg(titulo, { color: COLOR.verde, bold: true })]), linea(0, [])] : [];
  for (const p of parrafos) {
    if (!p) {
      lineas.push(linea(0, []));
      continue;
    }
    const numerada = /^\d+\. /.test(p);
    for (const t of envolver(p, ancho)) lineas.push(linea(0, [seg(t, { color: numerada ? COLOR.texto : COLOR.tenue })]));
    lineas.push(linea(0, []));
  }
  return { lineas, anclas: [] };
}

// /buscar: the messages that match, with the words found highlighted. Anchors open each one.
const LINEAS_FRAGMENTO = 3;
// `ocultos`: results of this page left out (ignored, or matching a filter).
export function armarBusqueda({ texto, total, resultados, pagina, paginas, ocultos = 0 }, { ancho, seleccionado }) {
  const lineas = [];
  const anclas = [];
  const sinMostrar = ocultos ? ` ${ocultos === 1 ? 'Uno oculto' : `${ocultos} ocultos`} en esta página: ignorados o filtrados (I).` : '';
  const resumen = total
    ? `${total} ${total === 1 ? 'resultado' : 'resultados'} para «${texto}», incluido el archivo${paginas > 1 ? ` · página ${pagina} de ${paginas}` : ''}.${sinMostrar}`
    : `No encontré nada con «${texto}».`;
  for (const t of envolver(resumen, ancho)) lineas.push(linea(0, [seg(t, { color: COLOR.tenue })]));
  lineas.push(linea(0, []));
  resultados.forEach((r, i) => {
    anclas.push({ linea: lineas.length, hilo: r.hiloId, post: r.postId });
    lineas.push(
      ...entrada(
        {
          titulo: r.asunto,
          etiquetas: [...(r.tablon ? [seg(`[${nombreTablon(r.tablon).toUpperCase()}]`, { color: COLOR.tenue })] : []), ...(r.archivada ? [ARCHIVADA] : [])],
          detalle: [[`No.${r.postId}`, r.esOp && 'mensaje inicial', r.fecha].filter(Boolean).join(' · ')],
          cuerpo: r.fragmento ? resaltado(sinSpoiler(r.fragmento), ancho - 2, LINEAS_FRAGMENTO) : [],
        },
        { ancho, seleccionada: i === seleccionado },
      ),
      linea(0, []),
    );
  });
  if (paginas > 1) {
    lineas.push(linea(0, [seg(`Página ${pagina} de ${paginas}  ·  ] siguiente · [ anterior`, { color: COLOR.tenue })]));
  }
  return { lineas, anclas };
}

// Text with \u0001 … \u0002 around what to highlight → lines of segments, at most `maximo` lines.
// The marks have no width, so the text wraps as plain text; a highlight can go on to the next line.
function resaltado(texto, ancho, maximo) {
  let dentro = false;
  let trozos = envolver(texto, ancho);
  if (trozos.length > maximo) trozos = [...trozos.slice(0, maximo - 1), `${cortar(trozos[maximo - 1], ancho - 1)}…`];
  return trozos.map((t) => {
    const segs = [];
    for (const parte of t.split(/([\u0001\u0002])/)) {
      if (parte === '\u0001') dentro = true;
      else if (parte === '\u0002') dentro = false;
      else if (parte) segs.push(seg(parte, dentro ? { color: COLOR.negro, bg: COLOR.cita, bold: true } : { color: COLOR.texto }));
    }
    return segs;
  });
}
