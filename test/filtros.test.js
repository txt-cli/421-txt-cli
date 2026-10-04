import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { coincide, compilarFiltros, sinAcentos } from '../src/filtros.js';
import { armarBusqueda, armarLista } from '../src/layout.js';
import { parseBusqueda } from '../src/html.js';
import { parseListado } from '../src/parse.js';
import { crearStores } from '../src/store.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const texto = (lineas) => lineas.map((l) => l.segs.map((s) => s.t).join(''));
const TECLA = { arriba: '\u001b[A', abajo: '\u001b[B', izquierda: '\u001b[D', derecha: '\u001b[C', inicio: '\u001b[H', fin: '\u001b[F', supr: '\u001b[3~', borrar: '\u007f', esc: '\u001b', enter: '\r', guardar: '\u0013' };

test('filtros: sin mayúsculas ni acentos (la ñ queda), líneas vacías fuera, errores por línea', () => {
  assert.equal(sinAcentos('Pingüino ÁÉÍÓÚ ñÑ'), 'Pinguino AEIOU ñÑ');
  const { reglas, errores } = compilarFiltros(['politica', '', '  ', 'fútbol|boca', '(roto', 'año']);
  assert.deepEqual(reglas.map((r) => r.fuente), ['politica', 'fútbol|boca', 'año']);
  assert.deepEqual([...errores], [[4, 'Unterminated group']]);
  assert.equal(coincide(reglas, 'Hablemos de POLÍTICA'), 'politica');
  assert.equal(coincide(reglas, 'nada', 'el futbol de hoy'), 'fútbol|boca'); // the summary counts too
  assert.equal(coincide(reglas, 'feliz año'), 'año');
  assert.equal(coincide(reglas, 'el ano'), null);
  assert.equal(coincide([], 'lo que sea'), null);
});

test('lista: las ocultas al final, la línea roja antes de la primera, y por qué', () => {
  const hilos = parseListado(fixture('index.txt')).hilos.slice(0, 3);
  const items = [
    { entrada: hilos[1] },
    { entrada: hilos[0], oculta: 'ignorado' },
    { entrada: hilos[2], oculta: 'filtrada' },
  ];
  const { lineas, anclas } = armarLista(items, { ancho: 80, seleccionado: 0, conTablon: true });
  const t = texto(lineas);
  const roja = t.findIndex((l) => l.startsWith('━━'));
  assert.equal(t.filter((l) => l.startsWith('━━')).length, 1);
  assert.match(t[roja], /^━━ 2 publicaciones ocultas: ignoradas \(i\) o filtradas \(I\) ━+$/);
  assert.equal([...t[roja]].length, 80);
  assert.equal(anclas[1].linea, roja); // jumping to the first hidden one shows the line
  assert.ok(anclas[0].linea < roja);
  assert.match(t[roja + 3], /OP .*· ignorado/);
  assert.ok(t.some((l) => /OP .*· filtrada/.test(l)));
  assert.ok(lineas[roja].segs.every((s) => !s.t.trim() || s.color === '#ff6b6b'));

  const sinOcultas = texto(armarLista([{ entrada: hilos[0] }], { ancho: 80, seleccionado: 0, conTablon: true }).lineas);
  assert.ok(!sinOcultas.some((l) => l.startsWith('━━')));
  // Narrow: the text goes under the line.
  const angosta = texto(armarLista([{ entrada: hilos[0], oculta: 'filtrada' }], { ancho: 40, seleccionado: 0, conTablon: true }).lineas);
  assert.match(angosta[0], /^━{40}$/);
  assert.match(angosta[1], /^1 publicación oculta/);
});

test('búsqueda: dice cuántos de la página quedaron afuera', () => {
  const d = parseBusqueda(fixture('buscar.html'));
  const t = texto(armarBusqueda({ ...d, resultados: d.resultados.slice(2), ocultos: 2 }, { ancho: 120, seleccionado: 0 }).lineas);
  assert.match(t.slice(0, 2).join(' '), /45 resultados .*página 2 de 3\. 2 ocultos en esta página: ignorados o filtrados \(I\)\./);
});

async function abrir(t, { fetch } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-cli-filtros-'));
  const stores = crearStores({ dir });
  const pedir =
    fetch ??
    (async (url) => {
      const { pathname } = new URL(url);
      return new Response(fixture(pathname === '/index.txt' ? 'index.txt' : pathname === '/buscar' ? 'buscar.html' : 'hilo.txt'));
    });
  const app = render(React.createElement(App, { cliente: crearCliente({ fetch: pedir }), stores }));
  t.after(() => {
    app.unmount();
    fs.rmSync(dir, { recursive: true });
  });
  await esperar(300);
  const teclas = async (...ks) => {
    for (const k of ks) {
      app.stdin.write(TECLA[k] ?? k);
      await esperar(60);
    }
    await esperar(200);
    return app.lastFrame();
  };
  return { app, teclas, stores };
}

test('I abre el popup; se edita con cursor; Ctrl+S guarda y la lista se reordena', async (t) => {
  const { teclas, stores } = await abrir(t);
  let frame = await teclas('I');
  assert.match(frame, /Filtros para ocultar publicaciones/);
  assert.match(frame, /Ctrl\+S guardar · Esc cancelar/);

  // "peliculas", then go back and fix it into "pel[ií]culas"; a second line; join and split lines.
  frame = await teclas('peliculas', 'inicio', 'derecha', 'derecha', 'derecha', 'supr', '[ií]');
  assert.match(frame, /› pel\[ií\]culas/);
  frame = await teclas('fin', 'enter', 'pelad', 'borrar', 'do', 'arriba', 'fin', 'supr'); // Supr at the end joins the next line
  assert.match(frame, /› pel\[ií\]culaspelado/);
  frame = await teclas('fin', ...Array(6).fill('izquierda'), 'enter'); // back to where they joined, and split
  assert.match(frame, /› pel\[ií\]culas +│[^\n]*\n[^\n]*› pelado +│/);
  frame = await teclas('abajo', 'inicio', 'borrar', 'enter'); // Backspace at the start joins with the line above; Enter splits again
  assert.match(frame, /› pel\[ií\]culas +│[^\n]*\n[^\n]*› pelado +│/);

  frame = await teclas('guardar');
  assert.match(frame, /Filtros guardados: 2 filtros\./);
  assert.deepEqual(stores('filtros').get('publicaciones'), ['pel[ií]culas', 'pelado']);
  // "Películas que te traumaron?" and "Che, me estoy quedando pelado": to the bottom.
  assert.match(frame, /^ ▶ Fotos de perfil/m);
  const fin = await teclas(...Array(8).fill('j'));
  assert.match(fin, /━━ 2 publicaciones ocultas/);
  assert.match(fin, /Películas que te traumaron\?.*\n.*· filtrada/);
});

test('el popup: los errores se marcan y no se usan; Esc con cambios pide confirmación', async (t) => {
  const { teclas, stores } = await abrir(t);
  let frame = await teclas('I', '(roto');
  assert.match(frame, /✗ \(roto/);
  assert.match(frame, /Línea 1: Unterminated group\. No se usa hasta que la corrijas\./);
  frame = await teclas('esc');
  assert.match(frame, /Esc de nuevo descarta los cambios/);
  frame = await teclas('x', 'esc', 'esc'); // another key keeps editing; then twice to drop it
  assert.doesNotMatch(frame, /Filtros para ocultar/);
  assert.equal(stores('filtros').get('publicaciones'), undefined);

  frame = await teclas('I', '(roto', 'guardar');
  assert.match(frame, /Filtros guardados: 0 filtros \(1 con error, sin usar\)\./);
  assert.deepEqual(stores('filtros').get('publicaciones'), ['(roto']); // kept, to fix later
  frame = await teclas('I');
  assert.match(frame, /✗ \(roto +│[^\n]*\n[^\n]*│ {3,}│/); // it comes back, with an empty line below to add more
});

test('dentro de una publicación, I sigue ignorando al autor (no abre los filtros)', async (t) => {
  const { teclas } = await abrir(t);
  const frame = await teclas('enter', 'j', 'j', 'I');
  assert.doesNotMatch(frame, /Filtros para ocultar/);
  assert.match(frame, /Ignorando los mensajes de/);
});

test('búsqueda: sin lo ignorado ni lo filtrado', async (t) => {
  const { teclas, stores } = await abrir(t);
  stores('ignorados').set('hilo:47', 'x'); // "Hilo viejo <con> & cosas"
  stores('ignorados').set('mensaje:4806', 'x');
  let frame = await teclas('b', 'fotos', 'enter');
  assert.match(frame, /2 ocultos en esta página/);
  assert.match(frame, /No\.4797/);
  assert.doesNotMatch(frame, /No\.4806|Hilo viejo/);

  frame = await teclas('I', 'perfil', 'guardar'); // the title of what's left
  assert.match(frame, /3 ocultos en esta página/);
  assert.doesNotMatch(frame, /No\.4797/);
});
