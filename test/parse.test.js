import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { desenvolver, parseHilo, parseListado } from '../src/parse.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('portada: 60 publicaciones con sección, asunto, respuestas y paginación', () => {
  const l = parseListado(fixture('index.txt'));
  assert.equal(l.hilos.length, 60);
  assert.deepEqual({ pagina: l.pagina, paginas: l.paginas }, { pagina: 1, paginas: 9 });
  assert.deepEqual(l.hilos[0], {
    id: 588,
    asunto: 'Fotos de perfil',
    board: 'tecnologia',
    fijada: false,
    respuestas: 38,
    fecha: '26/9/26, 1:16 a. m.',
    extracto:
      'Admin podríamos transformar los ID aleatorios en fotos de perfil asi es mas facil identificarnos en una misma publicación. Algo como https://www.dicebear.com/pl…',
  });
  // El asunto venía partido en dos líneas: "(4\nrespuestas)".
  assert.equal(l.hilos[1].asunto, 'Los que te dicen que tengas hijos tienen la vida resuelta');
  assert.equal(l.hilos[1].respuestas, 4);
  assert.ok(l.hilos.every((h) => h.board && h.asunto && h.fecha));
});

test('sección: el link al archivo no se toma como publicación y no hay etiqueta de sección', () => {
  const l = parseListado(fixture('tablon.txt'));
  assert.equal(l.hilos.length, 60);
  assert.equal(l.hilos[0].asunto, 'Películas que te traumaron?');
  assert.ok(l.hilos.every((h) => h.board === null));
});

test('publicación: asunto, sección, cabeceras y cuerpo con los saltos del autor', () => {
  const h = parseHilo(fixture('hilo.txt'));
  assert.equal(h.asunto, 'Fotos de perfil');
  assert.equal(h.board, 'tecnologia');
  assert.equal(h.posts.length, 39);
  const op = h.posts[0];
  assert.deepEqual({ id: op.id, anon: op.anon, op: op.op, sage: op.sage, fecha: op.fecha }, {
    id: 4797,
    anon: 'UC1uqVvA',
    op: true,
    sage: false,
    fecha: '25/9/26, 9:04 p. m.',
  });
  assert.deepEqual(op.lineas.map((l) => l.texto), [
    'Admin podríamos transformar los ID aleatorios en fotos de perfil asi es mas facil identificarnos en una misma publicación.',
    'Algo como https://www.dicebear.com/playground/',
    'Pero podemos hacer algo propio.',
    'Si quieren armo un issue y un PR con eso.',
    '',
    '>>1',
  ]);
  assert.deepEqual(op.respuestas, [5385, 5441]);
  assert.equal(h.posts[1].op, false);
});

test('publicación con mensajes eliminados', () => {
  const h = parseHilo(fixture('hilo-eliminado.txt'));
  assert.deepEqual(h.posts.find((p) => p.eliminado), { id: 781, eliminado: 'su autor' });
});

test('citas (>texto) y sage', () => {
  const texto = `TXT · FORO DE TEXTO DE 421
==========================

Hilo
====
Sección Cultura
  → https://txt.421.news/b/cultura.txt

··············································································

No.10 · ID abc · sage · 1/1/26, 1:00 p. m.
------------------------------------------
  > esto es una cita
  y esto no
  >>9 respuesta
`;
  const [p] = parseHilo(texto).posts;
  assert.equal(p.sage, true);
  assert.equal(p.op, false);
  assert.deepEqual(p.lineas, [
    { tipo: 'cita', texto: 'esto es una cita' },
    { tipo: 'usuario', texto: 'y esto no' },
    { tipo: 'usuario', texto: '>>9 respuesta' },
  ]);
});

test('desenvolver: une solo los cortes que hizo el servidor', () => {
  const larga = 'a'.repeat(70);
  // "aaaa… palabra" no entraba en 76: fue el servidor.
  assert.deepEqual(desenvolver([larga, 'palabra'], 76), [`${larga} palabra`]);
  // "corta" + "otra" entraba: el salto es del autor.
  assert.deepEqual(desenvolver(['corta', 'otra'], 76), ['corta', 'otra']);
  // Una línea vacía siempre corta.
  assert.deepEqual(desenvolver([larga, '', 'x'], 76), [larga, '', 'x']);
});

test('un texto que no es de txt da error', () => {
  assert.throws(() => parseHilo('No encontrado.\n'), /No parece/);
});

// As the site serves it (txt.421.news/index.txt, 2026-10-03): "[Fijada]" goes before the section.
test('publicación fijada: [Fijada] sale del asunto y la sección se sigue leyendo', () => {
  const texto = `Portada
=======

[Fijada] [Cultura] Lean a Baudrillard, gordos (30 respuestas)
  → https://txt.421.news/h/1675.txt
  3/10/26, 2:50 a. m. · 100% avive.

[Cultura] Banco al fijada en txt (0 respuestas)
  → https://txt.421.news/h/1911.txt
  2/10/26, 9:54 p. m. · Y que sea a puro dedo del Admin
`;
  const [fijada, otra] = parseListado(texto).hilos;
  assert.deepEqual(
    { id: fijada.id, asunto: fijada.asunto, board: fijada.board, fijada: fijada.fijada, respuestas: fijada.respuestas },
    { id: 1675, asunto: 'Lean a Baudrillard, gordos', board: 'cultura', fijada: true, respuestas: 30 },
  );
  assert.deepEqual({ asunto: otra.asunto, fijada: otra.fijada }, { asunto: 'Banco al fijada en txt', fijada: false });
});
