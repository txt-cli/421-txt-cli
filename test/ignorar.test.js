import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { COLOR, armarHilo, armarLista } from '../src/layout.js';
import { parseHilo, parseListado } from '../src/parse.js';
import { crearStores } from '../src/store.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const texto = (lineas) => lineas.map((l) => l.segs.map((s) => s.t).join(''));
const hilo = { id: 588, ...parseHilo(fixture('hilo.txt')) };
const [op, segundo] = hilo.posts;

// Ignores what's in the set: "hilo:<id>", "mensaje:<No.>", "usuario:<hilo>-<ID>".
const ignorando = (...claves) => {
  const c = new Set(claves);
  return { hilo: (id) => c.has(`hilo:${id}`), mensaje: (h, p) => c.has(`mensaje:${p.id}`) || c.has(`usuario:${h}-${p.anon}`) };
};

test('publicación: un mensaje ignorado es solo su cabecera, con borde gris', () => {
  const normal = armarHilo(hilo, { ancho: 80 });
  const { lineas, anclas } = armarHilo(hilo, { ancho: 80, ignorados: ignorando(`mensaje:${segundo.id}`) });
  const caja = lineas.slice(anclas[1].linea, anclas[2].linea - 1);
  assert.equal(caja.length, 3);
  assert.match(texto(caja)[1], new RegExp(`· ignorado +No\\.${segundo.id} │$`));
  assert.ok(caja.every((l) => l.segs.some((s) => s.color === COLOR.ignorado)));
  // The box (plus its blank line) shrinks to 3 lines (plus the blank line).
  assert.equal(lineas.length, normal.lineas.length - (normal.anclas[2].linea - normal.anclas[1].linea) + 4);
  assert.ok(!texto(lineas).some((l) => l.includes('Como les encanta')));
});

test('publicación ignorada: el OP queda en barra gris; usuario ignorado: todos sus mensajes', () => {
  const { lineas, anclas } = armarHilo(hilo, { ancho: 80, ignorados: ignorando('hilo:588') });
  const barra = lineas[anclas[0].linea];
  assert.match(texto([barra])[0], /OP .*· ignorado/);
  assert.ok(barra.segs.some((s) => s.bg === COLOR.ignorado));
  assert.match(texto([lineas[anclas[0].linea + 1]])[0], /^└─+┘$/);

  const deUno = hilo.posts.filter((p) => p.anon === op.anon);
  assert.ok(deUno.length > 1);
  const t = texto(armarHilo(hilo, { ancho: 80, ignorados: ignorando(`usuario:588-${op.anon}`) }).lineas).join('\n');
  for (const p of deUno) assert.match(t, new RegExp(`· ignorado.*No\\.${p.id}`));
  assert.equal((t.match(/· ignorado/g) ?? []).length, deUno.length);
});

test('lista: publicación ignorada = título y cabecera del OP, sin respuestas', () => {
  const [entrada] = parseListado(fixture('index.txt')).hilos;
  const opciones = { ancho: 80, seleccionado: 0, conTablon: true };
  const t = texto(armarLista([{ entrada, hilo }], { ...opciones, ignorados: ignorando('hilo:588') }).lineas);
  assert.match(t[0], /Fotos de perfil/);
  assert.match(t[1], /OP .*· ignorado/);
  assert.match(t[2], /^└─+┘$/);
  assert.ok(!t.some((l) => /omitidas|No\.\d+ │/.test(l)));
  const ultima = hilo.posts.at(-1);
  const conRespuesta = texto(armarLista([{ entrada, hilo }], { ...opciones, ignorados: ignorando(`mensaje:${ultima.id}`) }).lineas);
  assert.ok(conRespuesta.some((l) => new RegExp(`· ignorado.*No\\.${ultima.id}`).test(l)));
});

async function abrir(inicio) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-cli-ign-'));
  const stores = crearStores({ dir });
  const fetch = async (url) => new Response(fixture(new URL(url).pathname === '/index.txt' ? 'index.txt' : 'hilo.txt'));
  const app = render(React.createElement(App, { cliente: crearCliente({ fetch }), inicio, stores }));
  await esperar(250);
  const teclas = async (...ks) => {
    for (const k of ks) {
      app.stdin.write(k);
      await esperar();
    }
    await esperar(150);
    return app.lastFrame();
  };
  const cerrar = () => (app.unmount(), fs.rmSync(dir, { recursive: true }));
  return { app, teclas, ignorados: () => stores('ignorados').keys().sort(), cerrar };
}

test('i / I dentro de una publicación, guardado en el store y reversible', async () => {
  const { teclas, ignorados, cerrar } = await abrir({ hilo: 588 });
  let frame = await teclas('j', 'i'); // the OP: the whole thread
  assert.deepEqual(ignorados(), ['hilo:588']);
  assert.match(frame, /Publicación ignorada/);

  frame = await teclas('j', 'i'); // the second message
  assert.deepEqual(ignorados(), ['hilo:588', `mensaje:${segundo.id}`]);
  assert.match(frame, new RegExp(`No\\.${segundo.id} ignorado`));

  frame = await teclas('I'); // its author, in this thread
  assert.deepEqual(ignorados(), ['hilo:588', `mensaje:${segundo.id}`, `usuario:588-${segundo.anon}`]);
  assert.match(frame, /Ignorando los mensajes de .* en esta publicación/);

  await teclas('i', 'k', 'i', 'j', 'I'); // and back, one by one
  assert.deepEqual(ignorados(), []);
  cerrar();
});

test('i en un mensaje ignorado por su autor avisa que se deshace con I', async () => {
  const { teclas, ignorados, cerrar } = await abrir({ hilo: 588 });
  await teclas('j', 'j', 'I');
  const frame = await teclas('i');
  assert.match(frame, new RegExp(`No\\.${segundo.id} está ignorado porque ignorás a .*: I para dejar de ignorarlo`));
  assert.deepEqual(ignorados(), [`usuario:588-${segundo.anon}`]);
  cerrar();
});

test('i en la lista ignora la publicación marcada: va abajo de todo, después de la línea roja', async () => {
  const { teclas, ignorados, cerrar } = await abrir({});
  let frame = await teclas('i');
  assert.deepEqual(ignorados(), ['hilo:588']);
  assert.match(frame, /Ignorada: «Fotos de perfil»/);
  assert.match(frame, /^ ▶ Los que te dicen que tengas hijos/m); // the next one takes its place
  frame = await teclas(...Array(9).fill('j'));
  assert.match(frame, /━━ 1 publicación oculta: ignoradas \(i\) o filtradas \(I\) ━+\n\n ▶ Fotos de perfil \[TECNOLOGÍA\]\n.*OP .*· ignorado.*\n └─+┘/);
  frame = await teclas('i', 'g');
  assert.deepEqual(ignorados(), []);
  assert.match(frame, /^ ▶ Fotos de perfil/m); // back in its place
  assert.doesNotMatch(frame, /· ignorado|━━/);
  cerrar();
});

test('fijada: borde y barra del OP en otro color, etiqueta en el título; ignorada gana', () => {
  const [entrada] = parseListado(fixture('index.txt')).hilos;
  const fija = { ...entrada, fijada: true };
  const opciones = { ancho: 80, seleccionado: 0, conTablon: true };
  const { lineas } = armarLista([{ entrada: fija, hilo }], opciones);
  assert.match(texto(lineas)[0], /Fotos de perfil  FIJADA  \[TECNOLOGÍA\]/);
  assert.ok(lineas[0].segs.some((s) => s.t === ' FIJADA ' && s.bg === COLOR.fijada));
  assert.ok(lineas[1].segs.some((s) => s.bg === COLOR.fijada)); // OP bar
  const fin = texto(lineas).findIndex((l) => /^└/.test(l));
  assert.ok(lineas[fin].segs.some((s) => s.color === COLOR.fijada)); // its bottom edge
  // Replies keep their usual border.
  const respuesta = texto(lineas).findIndex((l) => /^ {4}┌/.test(l));
  assert.ok(!lineas[respuesta].segs.some((s) => s.color === COLOR.fijada));

  const ignorada = armarLista([{ entrada: fija, hilo }], { ...opciones, ignorados: ignorando('hilo:588') }).lineas;
  assert.ok(ignorada[1].segs.some((s) => s.bg === COLOR.ignorado));

  const enHilo = armarHilo(hilo, { ancho: 80, fijada: true });
  assert.ok(enHilo.lineas[enHilo.anclas[0].linea].segs.some((s) => s.bg === COLOR.fijada));
  assert.ok(!enHilo.lineas[enHilo.anclas[1].linea].segs.some((s) => s.color === COLOR.fijada));
});
