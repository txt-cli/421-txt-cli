// Renders the site's own Respuestas and Guardados pages as test fixtures (test/fixtures/*.html), so the
// HTML parsers (src/html.js) are tested against the real markup. Needs the site's repository next to this
// one (or TXT_SERVIDOR=<path>): node scripts/fixtures-html.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const servidor = process.env.TXT_SERVIDOR ?? new URL('../../txt', import.meta.url).pathname;
const V = await import(pathToFileURL(path.join(servidor, 'src/views.js')).href);
const T = Date.UTC(2026, 9, 2, 22, 15);
const ctx = (novedades) => ({ user: { id: 1, role: 'user' }, csrf: 'tok&en', siteName: 'txt', baseUrl: 'https://txt.421.news', ahora: T, novedades, pendientesMod: 0, tema: null, vista: 'lista', ruta: '/respuestas', codigoUrl: null, nota421: null, sombraActiva: false, jevActivo: false });
const lista = [
  { tipo: 'respuesta', leida: 0, created_at: T - 5 * 60e3, post_id: 4806, body: '>>4802\nNo, eso es <b>otra</b> cosa & no tiene nada que ver.\n>cita del otro', thread_id: 588, subject: 'Fotos de perfil' },
  { tipo: 'comentario', leida: 0, created_at: T - 60 * 60e3, post_id: 5388, body: 'Coincido con el OP, '.repeat(20), thread_id: 1675, subject: 'Lean a Baudrillard, gordos' },
  { tipo: 'guardado', leida: 1, created_at: T - 26 * 3600e3, post_id: 5100, body: 'Y que sea a puro dedo del Admin', thread_id: 1911, subject: 'Banco al "fijada" en txt' },
];
const mias = [
  { id: 588, subject: 'Fotos de perfil', board: 'tecnologia', reply_count: 39, bumped_at: T, ultima: T - 2 * 3600e3 },
  { id: 1675, subject: 'Lean a Baudrillard, gordos', board: 'cultura', reply_count: 1, bumped_at: T, ultima: T - 50 * 3600e3 },
];
const guardados = [
  { id: 1675, subject: 'Lean a Baudrillard, gordos', board: 'cultura', reply_count: 30, bumped_at: T - 3600e3, archived: 0 },
  { id: 47, subject: 'Hilo viejo <con> & cosas', board: 'musica', reply_count: 1, bumped_at: T - 40 * 86400e3, archived: 1 },
];
const out = new URL('../test/fixtures', import.meta.url).pathname;
fs.writeFileSync(`${out}/respuestas.html`, V.pagina(ctx(2), { titulo: 'Respuestas', indexar: false, cuerpo: V.respuestas(ctx(2), { lista, mias }) }).toString());
fs.writeFileSync(`${out}/respuestas-vacia.html`, V.pagina(ctx(0), { titulo: 'Respuestas', indexar: false, cuerpo: V.respuestas(ctx(0), { lista: [], mias: [] }) }).toString());
fs.writeFileSync(`${out}/guardados.html`, V.pagina(ctx(3), { titulo: 'Guardados', indexar: false, cuerpo: V.guardados(ctx(3), { lista: guardados }) }).toString());
fs.writeFileSync(`${out}/guardados-vacia.html`, V.pagina(ctx(0), { titulo: 'Guardados', indexar: false, cuerpo: V.guardados(ctx(0), { lista: [] }) }).toString());
// Search: FTS snippets carry \u0001 / \u0002 around the match (the view turns them into <mark>).
const resultados = [
  { id: 4797, thread_id: 588, created_at: T - 7 * 86400e3, subject: 'Fotos de perfil', board: 'tecnologia', archived: 0, es_op: 1, fragmento: 'Admin podríamos transformar los ID aleatorios en \u0001fotos\u0002 de \u0001perfil\u0002 asi es mas facil…' },
  { id: 4806, thread_id: 588, created_at: T - 6 * 86400e3, subject: 'Fotos de perfil', board: 'tecnologia', archived: 0, es_op: 0, fragmento: '…y que las \u0001fotos\u0002 sean <b>ascii</b> & nada más' },
  { id: 120, thread_id: 47, created_at: T - 40 * 86400e3, subject: 'Hilo viejo <con> & cosas', board: 'musica', archived: 1, es_op: 0, fragmento: null },
];
resultados.total = 45;
const buscar = (texto, r, pagina, paginas) => V.pagina(ctx(0), { titulo: `Buscar: ${texto}`, indexar: false, cuerpo: V.buscar(ctx(0), { texto, resultados: r, pagina, paginas }) }).toString();
fs.writeFileSync(`${out}/buscar.html`, buscar('fotos perfil', resultados, 2, 3));
fs.writeFileSync(`${out}/buscar-vacia.html`, buscar('nadaquever', [], 1, 1));
console.log('ok');
