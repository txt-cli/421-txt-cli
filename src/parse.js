// Parsers for the plain-text version of txt (index.txt, /b/<slug>.txt, /h/<id>.txt).
//
// The server builds those pages in src/documentos.js (aTexto) and hard-wraps every paragraph at 78
// columns. User lines are indented with two spaces and quotes with "  > ". To show a post at the
// terminal's width, the wrapping is undone with the same rule the server used to break lines.

export const BOARDS = [
  { slug: 'tecnologia', nombre: 'Tecnología' },
  { slug: 'cultura', nombre: 'Cultura' },
  { slug: 'musica', nombre: 'Música' },
  { slug: 'juegos', nombre: 'Juegos' },
  { slug: 'vida-real', nombre: 'Vida real' },
];

const ANCHO = 78;
const SEPARADOR = /^·+$/;
const SUBRAYADO_1 = /^=+$/;
const SUBRAYADO_3 = /^-+$/;
const LINK = /^ {2}→ (\S+)$/;
const HILO_URL = /\/h\/(\d+)\.txt$/;
const TABLON_URL = /\/b\/([a-z-]+)\.txt$/;

// The server's envolver() moved a word to the next line only when it didn't fit:
// (line + ' ' + word).length > ancho - sangria.length. If the next line's first word would have
// fit, the break was the author's.
function fueCorte(anterior, siguiente, ancho) {
  if (!anterior || !siguiente) return false;
  const palabra = siguiente.split(' ')[0];
  return `${anterior} ${palabra}`.length > ancho;
}

// Joins lines that came from the same paragraph. `lineas` are already stripped of their prefix.
export function desenvolver(lineas, ancho) {
  const out = [];
  for (const linea of lineas) {
    const i = out.length - 1;
    if (i >= 0 && fueCorte(out[i].ultima, linea, ancho)) {
      out[i].texto += ` ${linea}`;
      out[i].ultima = linea;
    } else out.push({ texto: linea, ultima: linea });
  }
  return out.map((l) => l.texto);
}

// Body of a post → [{ tipo: 'usuario' | 'cita', texto }], one element per line the author wrote.
function cuerpo(lineas) {
  const grupos = [];
  for (const cruda of lineas) {
    const cita = cruda === '  >' || cruda.startsWith('  > ');
    const tipo = cita ? 'cita' : 'usuario';
    const texto = cita ? cruda.slice(4) : cruda.slice(2);
    const ultimo = grupos.at(-1);
    if (ultimo?.tipo === tipo) ultimo.lineas.push(texto);
    else grupos.push({ tipo, lineas: [texto] });
  }
  return grupos.flatMap((g) =>
    desenvolver(g.lineas, ANCHO - (g.tipo === 'cita' ? 4 : 2)).map((texto) => ({ tipo: g.tipo, texto })),
  );
}

function paginacion(lineas) {
  for (const l of lineas) {
    const m = l.match(/^Página (\d+) de (\d+)$/);
    if (m) return { pagina: Number(m[1]), paginas: Number(m[2]) };
  }
  return { pagina: 1, paginas: 1 };
}

const boardPorNombre = (nombre) => BOARDS.find((b) => b.nombre === nombre) ?? null;

// Home page or a section: every "  → …/h/<id>.txt" link is a thread. The title comes right before
// the link (it may wrap; subjects have no line breaks, so the lines are joined with a space) and the
// detail ("date · excerpt") right after, indented, until the blank line.
export function parseListado(texto) {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  const hilos = [];
  for (let i = 0; i < lineas.length; i++) {
    const link = lineas[i].match(LINK);
    const id = link?.[1].match(HILO_URL)?.[1];
    if (!id) continue;

    const titulo = [];
    for (let j = i - 1; j >= 0; j--) {
      const l = lineas[j];
      if (!l || l.startsWith('  ') || SUBRAYADO_1.test(l) || SEPARADOR.test(l)) break;
      titulo.unshift(l);
    }
    const detalle = [];
    for (let j = i + 1; j < lineas.length && lineas[j].startsWith('  ') && !LINK.test(lineas[j]); j++) {
      detalle.push(lineas[j].slice(2));
    }

    let asunto = titulo.join(' ');
    let board = null;
    const conTablon = asunto.match(/^\[([^\]]+)\] (.*)$/);
    if (conTablon && boardPorNombre(conTablon[1])) {
      board = boardPorNombre(conTablon[1]).slug;
      asunto = conTablon[2];
    }
    let respuestas = 0;
    const cuenta = asunto.match(/^(.*) \((\d+) respuestas?\)$/);
    if (cuenta) {
      asunto = cuenta[1];
      respuestas = Number(cuenta[2]);
    }
    const unido = detalle.join(' ');
    const corte = unido.indexOf(' · ');
    hilos.push({
      id: Number(id),
      asunto,
      board,
      respuestas,
      fecha: corte === -1 ? '' : unido.slice(0, corte),
      extracto: corte === -1 ? unido : unido.slice(corte + 3),
    });
  }
  return { hilos, ...paginacion(lineas) };
}

// A thread: the second level-1 title is the subject; each post is "No.N · ID x[ · OP][ · sage] · date"
// underlined with dashes, followed by its lines and an optional "Respuestas: >>a >>b".
export function parseHilo(texto) {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  const titulos = [];
  for (let i = 1; i < lineas.length; i++) if (SUBRAYADO_1.test(lineas[i]) && lineas[i - 1]) titulos.push(i - 1);
  const iAsunto = titulos[1];
  if (iAsunto === undefined) throw new Error('No parece una publicación de txt.');

  const hilo = { asunto: lineas[iAsunto], board: null, archivado: false, cerrado: false, posts: [] };
  let i = iAsunto + 2;
  for (; i < lineas.length && !SEPARADOR.test(lineas[i]); i++) {
    const slug = lineas[i].match(LINK)?.[1].match(TABLON_URL)?.[1];
    if (slug && !hilo.board) hilo.board = slug;
    if (lineas[i].startsWith('Publicación archivada')) hilo.archivado = true;
    if (lineas[i].startsWith('Publicación cerrada')) hilo.cerrado = true;
  }

  // Each block between separators is one post.
  const bloques = [];
  for (; i < lineas.length; i++) {
    if (SEPARADOR.test(lineas[i])) bloques.push([]);
    else bloques.at(-1)?.push(lineas[i]);
  }
  for (const bloque of bloques) {
    const b = bloque.filter((l, k) => l || (k > 0 && k < bloque.length - 1));
    while (b.length && !b[0]) b.shift();
    while (b.length && !b.at(-1)) b.pop();
    if (!b.length) continue;

    const eliminado = b[0].match(/^No\.(\d+) · Eliminado por (.+)\.$/);
    if (eliminado) {
      hilo.posts.push({ id: Number(eliminado[1]), eliminado: eliminado[2] });
      continue;
    }
    const cab = b[0].match(/^No\.(\d+) · ID (\S+)((?: · (?:OP|sage))*) · (.+)$/);
    if (!cab || !SUBRAYADO_3.test(b[1] ?? '')) continue;
    let resto = b.slice(2);
    let respuestas = [];
    if (resto.at(-1)?.startsWith('Respuestas: ')) {
      respuestas = [...resto.at(-1).matchAll(/>>(\d+)/g)].map((m) => Number(m[1]));
      resto = resto.slice(0, -1);
    }
    hilo.posts.push({
      id: Number(cab[1]),
      anon: cab[2],
      op: cab[3].includes('OP'),
      sage: cab[3].includes('sage'),
      fecha: cab[4],
      lineas: cuerpo(resto),
      respuestas,
    });
  }
  return hilo;
}
