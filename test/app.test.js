import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { armarLista, armarPost, envolver } from '../src/layout.js';
import { parseHilo, parseListado } from '../src/parse.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const TECLA = { derecha: '\u001b[C', izquierda: '\u001b[D', enter: '\r', esc: '\u001b' };

// Serves the fixtures and records every request.
function sitio() {
  const pedidos = [];
  const fetch = async (url) => {
    const { pathname, search } = new URL(url);
    pedidos.push(pathname + search);
    const archivo =
      pathname === '/index.txt' ? 'index.txt' : pathname.startsWith('/b/') ? 'tablon.txt' : pathname === '/h/47.txt' ? 'hilo-eliminado.txt' : 'hilo.txt';
    return new Response(fixture(archivo));
  };
  return { cliente: crearCliente({ fetch }), pedidos };
}

async function abrir() {
  const s = sitio();
  const app = render(React.createElement(App, { cliente: s.cliente }));
  await esperar(200);
  const teclas = async (...ks) => {
    for (const k of ks) {
      app.stdin.write(TECLA[k] ?? k);
      await esperar();
    }
    await esperar(150);
    return app.lastFrame();
  };
  return { ...s, app, teclas };
}

test('envolver respeta el ancho, también con acentos y emoji', () => {
  assert.deepEqual(envolver('hola que tal', 7), ['hola', 'que tal']);
  assert.deepEqual(envolver('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(envolver('😀😀😀', 4), ['😀😀', '😀']);
});

test('vista de lista: mensaje inicial, respuestas omitidas y las últimas 3', () => {
  const [entrada] = parseListado(fixture('index.txt')).hilos;
  const hilo = parseHilo(fixture('hilo.txt'));
  const { lineas, anclas } = armarLista([{ entrada, hilo }], { ancho: 80, seleccionado: 0, conTablon: true });
  const texto = lineas.map((l) => l.segs.map((s) => s.t).join(''));
  assert.equal(anclas[0].linea, 0);
  assert.match(texto[0], /▶ Fotos de perfil \[TECNOLOGÍA\]/);
  assert.ok(texto.some((l) => l.includes('No.4797')));
  assert.ok(texto.some((l) => l.includes('35 respuestas omitidas')));
  const ultimas = hilo.posts.slice(-3).map((p) => `No.${p.id}`);
  for (const n of ultimas) assert.ok(texto.some((l) => l.includes(n)), n);
  assert.ok(!texto.some((l) => l.includes(`No.${hilo.posts.at(-4).id}`)));
  // Nada más ancho que la pantalla.
  assert.ok(texto.every((l) => [...l].length <= 80));
});

test('abre en la portada con la vista de lista', async () => {
  const { app, pedidos } = await abrir();
  const frame = app.lastFrame();
  assert.match(frame, /PORTADA +TECNOLOGÍA +CULTURA +MÚSICA +JUEGOS +VIDA REAL/);
  assert.match(frame, /▶ Fotos de perfil \[TECNOLOGÍA\]/);
  assert.match(frame, /Página 1 de ~54/);
  assert.equal(pedidos[0], '/index.txt');
  // Solo las 10 publicaciones de la primera página.
  assert.equal(pedidos.filter((p) => p.startsWith('/h/')).length, 10);
  app.unmount();
});

test('←/→ y los números cambian de sección', async () => {
  const { teclas, pedidos, app } = await abrir();
  let frame = await teclas('derecha', 'derecha');
  assert.ok(pedidos.includes('/b/cultura.txt'));
  assert.match(frame, /▶ Películas que te traumaron\?/);
  assert.doesNotMatch(frame, /\[CULTURA\]/); // dentro de una sección no hay etiqueta
  frame = await teclas('izquierda', 'izquierda', 'izquierda');
  assert.ok(pedidos.includes('/b/vida-real.txt'));
  frame = await teclas('1');
  assert.match(frame, /Fotos de perfil \[TECNOLOGÍA\]/);
  app.unmount();
});

test('j/k marcan otra publicación y Enter la abre; Esc vuelve', async () => {
  const { teclas, pedidos, app } = await abrir();
  let frame = await teclas('j');
  assert.match(frame, /▶ Los que te dicen que tengas hijos/);
  frame = await teclas('enter');
  assert.match(frame, /← Tecnología/);
  assert.match(frame, /Respuestas: >>5385 >>5441/);
  assert.match(frame, /txt\.421\.news\/h\/638/);
  assert.ok(pedidos.includes('/h/638.txt'));
  frame = await teclas('esc');
  assert.match(frame, /▶ Los que te dicen que tengas hijos/);
  app.unmount();
});

test('] y [ pasan de página; la séptima pide la página 2 del .txt', async () => {
  const { teclas, pedidos, app } = await abrir();
  let frame = await teclas(']');
  assert.match(frame, /Página 2 de/);
  assert.ok(!pedidos.includes('/index.txt?pagina=2'));
  frame = await teclas(']', ']', ']', ']', ']');
  assert.match(frame, /Página 7 de/);
  assert.ok(pedidos.includes('/index.txt?pagina=2'));
  frame = await teclas('[');
  assert.match(frame, /Página 6 de/);
  app.unmount();
});

test('a abre el archivo de la sección', async () => {
  const { teclas, pedidos, app } = await abrir();
  const frame = await teclas('2', 'a');
  assert.ok(pedidos.includes('/b/tecnologia/archivo.txt'));
  assert.match(frame, /TECNOLOGÍA · ARCHIVO/);
  app.unmount();
});

test('armarPost: un mensaje solo, cortado a un máximo de líneas con su borde', () => {
  const hilo = parseHilo(fixture('hilo.txt'));
  const texto = (lineas) => lineas.map((l) => l.segs.map((s) => s.t).join(''));
  const corto = texto(armarPost(hilo.posts[1], { ancho: 60 }));
  assert.match(corto[1], /No\.4802/);
  assert.match(corto.at(-1), /^└─+┘$/);
  const op = texto(armarPost(hilo.posts[0], { ancho: 60, esOp: true, maximo: 5 }));
  assert.equal(op.length, 5);
  assert.match(op[0], /OP .*No\.4797/);
  assert.match(op[3], /^│ … +│$/);
  assert.match(op[4], /^└─+┘$/);
  assert.ok([...corto, ...op].every((l) => [...l].length <= 60));
});
