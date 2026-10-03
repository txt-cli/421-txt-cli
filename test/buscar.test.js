import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { parseBusqueda } from '../src/html.js';
import { COLOR, armarBusqueda } from '../src/layout.js';

// buscar*.html: rendered from the site's own views (scripts/fixtures-html.mjs).
const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const marcado = (s) => (s == null ? s : s.replace(/\u0001/g, '[').replace(/\u0002/g, ']'));

test('parseBusqueda: resultados por mensaje, lo encontrado marcado, total y páginas', () => {
  const b = parseBusqueda(fixture('buscar.html'));
  assert.deepEqual({ texto: b.texto, total: b.total, pagina: b.pagina, paginas: b.paginas }, { texto: 'fotos perfil', total: 45, pagina: 2, paginas: 3 });
  assert.deepEqual(
    b.resultados.map((r) => ({ ...r, fragmento: marcado(r.fragmento) })),
    [
      { hiloId: 588, postId: 4797, asunto: 'Fotos de perfil', tablon: 'tecnologia', esOp: true, archivada: false, fecha: '25/9/26, 7:15 p. m.', fragmento: 'Admin podríamos transformar los ID aleatorios en [fotos] de [perfil] asi es mas facil…' },
      { hiloId: 588, postId: 4806, asunto: 'Fotos de perfil', tablon: 'tecnologia', esOp: false, archivada: false, fecha: '26/9/26, 7:15 p. m.', fragmento: '…y que las [fotos] sean <b>ascii</b> & nada más' },
      { hiloId: 47, postId: 120, asunto: 'Hilo viejo <con> & cosas', tablon: 'musica', esOp: false, archivada: true, fecha: '23/8/26, 7:15 p. m.', fragmento: null },
    ],
  );
  assert.deepEqual(parseBusqueda(fixture('buscar-vacia.html')), { texto: 'nadaquever', total: 0, resultados: [], pagina: 1, paginas: 1 });
});

test('armarBusqueda: lo encontrado resaltado, también si sigue en la línea de abajo', () => {
  const datos = parseBusqueda(fixture('buscar.html'));
  const { lineas, anclas } = armarBusqueda(datos, { ancho: 60, seleccionado: 1 });
  const texto = lineas.map((l) => l.segs.map((s) => s.t).join(''));
  assert.deepEqual(anclas.map((a) => [a.hilo, a.post]), [[588, 4797], [588, 4806], [47, 120]]);
  assert.match(texto[anclas[1].linea], /^▶ Fotos de perfil \[TECNOLOGÍA\]/);
  assert.match(texto.at(-1), /Página 2 de 3 +· +\] siguiente · \[ anterior/);
  const resaltados = lineas.flatMap((l) => l.segs.filter((s) => s.bg === COLOR.cita).map((s) => s.t));
  assert.deepEqual(resaltados, ['fotos', 'perfil', 'fotos']);
  assert.ok(texto.every((l) => [...l].length <= 60));

  // A highlight that wraps goes on in the next line.
  const largo = { ...datos, resultados: [{ ...datos.resultados[0], fragmento: 'uno dos \u0001tres cuatro cinco\u0002 seis' }] };
  const l2 = armarBusqueda(largo, { ancho: 18, seleccionado: 0 }).lineas;
  const marcas = l2.flatMap((l) => l.segs.filter((s) => s.bg === COLOR.cita).map((s) => s.t));
  assert.ok(marcas.length >= 2, marcas.join('|'));
  assert.equal(marcas.join(' ').replace(/\s+/g, ' ').trim(), 'tres cuatro cinco');

  const vacia = armarBusqueda(parseBusqueda(fixture('buscar-vacia.html')), { ancho: 60, seleccionado: 0 });
  assert.match(vacia.lineas[0].segs.map((s) => s.t).join(''), /No encontré nada con «nadaquever»\./);
  assert.deepEqual(vacia.anclas, []);
});

test('cliente.buscar: /buscar?q=…&pagina=…, sin sesión', async () => {
  const pedidos = [];
  const fetch = async (url, { headers }) => {
    pedidos.push({ url, cookie: headers.Cookie, accept: headers.Accept });
    return new Response(fixture('buscar.html'));
  };
  const cliente = crearCliente({ fetch, cookie: 'sid=abc' });
  await cliente.buscar('fotos perfil');
  await cliente.buscar('ñandú & cía', { pagina: 3 });
  assert.deepEqual(pedidos.map((p) => p.url), [
    'https://txt.421.news/buscar?q=fotos+perfil',
    'https://txt.421.news/buscar?q=%C3%B1and%C3%BA+%26+c%C3%ADa&pagina=3',
  ]);
  assert.ok(pedidos.every((p) => p.cookie === undefined && p.accept === 'text/html'));
});

async function abrir(t) {
  const pedidos = [];
  const fetch = async (url) => {
    const { pathname, search } = new URL(url);
    pedidos.push(pathname + search);
    const archivo =
      pathname === '/index.txt' ? 'index.txt' : pathname === '/buscar' ? (search.includes('nadaquever') ? 'buscar-vacia.html' : 'buscar.html') : pathname.startsWith('/b/') ? 'tablon.txt' : 'hilo.txt';
    return new Response(fixture(archivo));
  };
  const app = render(React.createElement(App, { cliente: crearCliente({ fetch }) }));
  t.after(() => app.unmount());
  await esperar(300);
  const teclas = async (...ks) => {
    for (const k of ks) {
      app.stdin.write(k);
      await esperar();
    }
    await esperar(200);
    return app.lastFrame();
  };
  return { app, teclas, pedidos, busquedas: () => pedidos.filter((p) => p.startsWith('/buscar')) };
}

test('b abre la caja debajo de las secciones; lo que se escribe va a la caja, también b, m o q', async (t) => {
  const { teclas, busquedas } = await abrir(t);
  let frame = await teclas('b');
  const filas = frame.split('\n');
  assert.match(filas[1], /PORTADA/);
  assert.match(filas[3], /^ ╭─+╮$/);
  assert.match(filas[4], /│ Buscar: ▮ palabras a buscar, Enter para buscar/);
  assert.match(filas[6], /▶ Fotos de perfil/); // the posts, below
  assert.match(frame, /Enter buscar · Esc cerrar/);

  frame = await teclas('bmq jk', '\u007f', '\u007f');
  assert.match(frame, /Buscar: bmq ▮/);
  assert.doesNotMatch(frame, /Respuestas|Teclas/); // no menu, no help
  assert.deepEqual(busquedas(), []);

  frame = await teclas('\u001b'); // no results yet: Esc closes it
  assert.doesNotMatch(frame, /Buscar:/);
  assert.match(frame, /▶ Fotos de perfil/);
});

test('Enter busca y muestra los resultados; ][ página, / cambia, Enter abre en el mensaje', async (t) => {
  const { teclas, busquedas } = await abrir(t);
  let frame = await teclas('b', 'fotos perfil', '\r');
  assert.deepEqual(busquedas(), ['/buscar?q=fotos+perfil']);
  assert.match(frame, /│ Buscar: fotos perfil +\/ cambiar · b cerrar/);
  assert.match(frame, /45 resultados para «fotos perfil», incluido el archivo · página 2 de 3\./);
  assert.match(frame, /▶ Fotos de perfil \[TECNOLOGÍA\]\n +No\.4797 · mensaje inicial/);
  assert.doesNotMatch(frame.split('\n')[1], /\x1b/); // (no tab highlighted: plain text)

  await teclas(']');
  assert.equal(busquedas().at(-1), '/buscar?q=fotos+perfil&pagina=3'); // the fixture is on page 2
  await teclas('[');
  assert.equal(busquedas().at(-1), '/buscar?q=fotos+perfil');

  frame = await teclas('/', '\u007f'.repeat(6), '\u001b'); // edit, then Esc: back to the results, unchanged
  assert.match(frame, /Buscar: fotos perfil +\/ cambiar/);
  frame = await teclas('/', ' gordo', '\r');
  assert.equal(busquedas().at(-1), '/buscar?q=fotos+perfil+gordo');

  frame = await teclas('j', '\r'); // the second result: No.4806 in 588
  assert.doesNotMatch(frame, /Buscar:/); // the box is for lists, not threads
  assert.match(frame.split('\n').slice(3, 5).join('\n'), /No\.4806/);
  frame = await teclas('\u001b');
  assert.match(frame, /Buscar: fotos perfil gordo/);
  assert.match(frame, /resultados para/);
});

test('b (o Esc) en los resultados cierra la búsqueda y vuelve a la portada', async (t) => {
  const { teclas } = await abrir(t);
  let frame = await teclas('3', 'b', 'nadaquever', '\r');
  assert.match(frame, /No encontré nada con «nadaquever»\./);
  frame = await teclas('b');
  assert.doesNotMatch(frame, /Buscar:|nadaquever/);
  assert.match(frame, /Página 1 de ~54/);
  assert.match(frame, /▶ Fotos de perfil \[TECNOLOGÍA\]/); // the home page: its lists show the section

  frame = await teclas('b', 'x', '\r', '\u001b');
  assert.doesNotMatch(frame, /Buscar:/);
  assert.match(frame, /▶ Fotos de perfil \[TECNOLOGÍA\]/);
});
