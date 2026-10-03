import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { csrfDe, novedadesDe, parseDocumento, parseGuardados, parseRespuestas } from '../src/html.js';
import { COLOR, armarHilo, armarLista } from '../src/layout.js';
import { parseHilo, parseListado } from '../src/parse.js';

// respuestas.html / guardados.html: rendered from the site's own views (scripts/fixtures-html.mjs).
const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const redirigir = (location) => new Response(null, { status: 303, headers: { Location: location } });

test('Respuestas: avisos (nuevos marcados), donde participaste y el contador', () => {
  const r = parseRespuestas(fixture('respuestas.html'));
  assert.equal(r.novedades, 2);
  assert.deepEqual(r.avisos[0], {
    hiloId: 588,
    postId: 4806,
    asunto: 'Fotos de perfil',
    que: 'alguien te respondió',
    fecha: '2/10/26, 7:10 p. m.',
    nueva: true,
    extracto: '>>4802 No, eso es <b>otra</b> cosa & no tiene nada que ver. >cita del otro',
  });
  assert.deepEqual(r.avisos.map((a) => a.nueva), [true, true, false]);
  assert.equal(r.avisos[2].asunto, 'Banco al "fijada" en txt');
  assert.equal(r.avisos[2].que, 'alguien comentó en una publicación que guardaste');
  assert.deepEqual(r.mias[1], { hiloId: 1675, asunto: 'Lean a Baudrillard, gordos', tablon: 'cultura', respuestas: 1, ultima: '30/9/26, 5:15 p. m.' });
  assert.deepEqual(parseRespuestas(fixture('respuestas-vacia.html')), { avisos: [], mias: [], novedades: 0 });
});

test('Guardados, el token y el contador de cualquier página', () => {
  const g = parseGuardados(fixture('guardados.html'));
  assert.equal(g.novedades, 3);
  assert.deepEqual(g.hilos, [
    { hiloId: 1675, asunto: 'Lean a Baudrillard, gordos', tablon: 'cultura', respuestas: 30, fecha: '2/10/26, 6:15 p. m.', archivada: false },
    { hiloId: 47, asunto: 'Hilo viejo <con> & cosas', tablon: 'musica', respuestas: 1, fecha: '23/8/26, 7:15 p. m.', archivada: true },
  ]);
  assert.deepEqual(parseGuardados(fixture('guardados-vacia.html')), { hilos: [], novedades: 0 });
  assert.equal(csrfDe(fixture('guardados.html')), 'tok&en');
  assert.equal(novedadesDe('<html></html>'), 0);
});

test('Normas: lo que sigue a la cabecera del sitio, en párrafos', () => {
  const d = parseDocumento(fixture('normas.txt'));
  assert.equal(d.titulo, 'Normas');
  assert.match(d.parrafos[0], /^Un filtro automático revisa cada mensaje antes de publicarlo\. Los mensajes reportados/);
  assert.match(d.parrafos[1], /^1\. Sin acoso\. .* golpeen, no\.$/);
  assert.ok(d.parrafos.some((p) => p.startsWith('8. Sin spam.')));
  assert.ok(!d.parrafos.some((p) => p.includes('index.txt')));
});

// A logged-in site: the HTML pages, the .txt ones and the forms. `post` answers the POSTs.
function sitio({ cookie = 'sid=abc', post = () => redirigir('/'), caido = false } = {}) {
  const pedidos = [];
  const fetch = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const { pathname } = new URL(url);
    pedidos.push({ method, ruta: pathname, cookie: headers.Cookie, body: body && Object.fromEntries(new URLSearchParams(body)) });
    if (caido && method === 'POST') throw new TypeError('fetch failed');
    if (method === 'POST') return post(pathname);
    const archivo = {
      '/index.txt': 'index.txt',
      '/normas.txt': 'normas.txt',
      '/respuestas': 'respuestas.html',
      '/guardados': 'guardados.html',
      '/cuenta': 'guardados-vacia.html',
    }[pathname] ?? (pathname.startsWith('/b/') ? 'tablon.txt' : 'hilo.txt');
    return new Response(fixture(archivo));
  };
  return { cliente: crearCliente({ fetch, cookie }), pedidos };
}

test('cliente: guardar y sacar con el token del sitio', async () => {
  const { cliente, pedidos } = sitio({ post: (ruta) => redirigir(ruta.replace('/guardar', '')) });
  await cliente.guardados();
  await cliente.guardar(1675, true);
  await cliente.guardar(1675, false);
  const posts = pedidos.filter((p) => p.method === 'POST');
  assert.deepEqual(posts.map((p) => [p.ruta, p.body]), [
    ['/h/1675/guardar', { _csrf: 'tok&en' }],
    ['/h/1675/guardar', { _csrf: 'tok&en', quitar: '1' }],
  ]);
  assert.ok(!pedidos.some((p) => p.ruta === '/cuenta')); // the token came with /guardados
});

test('cliente: salir cierra en el sitio y después navega sin sesión; si no hay red, la sesión sigue', async () => {
  const caido = sitio({ caido: true });
  await assert.rejects(caido.cliente.salir(), /fetch failed/);
  assert.equal(caido.cliente.conSesion, true);

  const { cliente, pedidos } = sitio();
  await cliente.salir();
  assert.equal(cliente.conSesion, false);
  assert.deepEqual(pedidos.filter((p) => p.method === 'POST').map((p) => [p.ruta, p.body]), [['/salir', { _csrf: 'tok&en' }]]);
  await cliente.listado({});
  assert.equal(pedidos.at(-1).cookie, undefined);
  await assert.rejects(cliente.respuestas(), /txt login/);

  // The site no longer knew the session: there's nothing to close, it's dropped all the same.
  const vencida = crearCliente({ cookie: 'sid=x', fetch: async () => redirigir('/entrar') });
  await vencida.salir();
  assert.equal(vencida.conSesion, false);
});

// Unmounted after the test even if it fails (the app has a timer running while logged in).
async function abrir(t, { inicio = {}, ...opciones } = {}) {
  const s = sitio(opciones);
  let salidas = 0;
  const app = render(React.createElement(App, { cliente: s.cliente, inicio, onSalir: () => (salidas++, null) }));
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
  return { ...s, app, teclas, salidas: () => salidas };
}
const ABAJO = '\u001b[B';

test('el menú: botón con el contador, opciones con sesión, Esc cierra', async (t) => {
  const { app, teclas } = await abrir(t);
  assert.match(app.lastFrame(), /PORTADA .* 3 +≡ MENÚ\n/); // unread count from /guardados
  let frame = await teclas('m');
  for (const o of ['Respuestas \\(3\\) +r', 'Guardados +g', 'Normas +n', 'SALIR +s']) assert.match(frame, new RegExp(`│ ${o} +│`));
  assert.match(frame, /Esc cerrar/);
  frame = await teclas('\u001b');
  assert.doesNotMatch(frame, /Guardados +g/);
});

test('Respuestas: marca las nuevas, el contador se va y Enter abre la publicación en el mensaje', async (t) => {
  const { app, teclas, pedidos } = await abrir(t);
  let frame = await teclas('m', '\r');
  assert.ok(pedidos.some((p) => p.ruta === '/respuestas'));
  assert.match(frame, /▶ Fotos de perfil  NUEVA\n +Alguien te respondió · 2\/10\/26, 7:10 p\. m\. · No\.4806\n +>>4802 No, eso es <b>otra<\/b>/);
  assert.match(frame, /Banco al "fijada" en txt\n/); // read: no tag
  assert.doesNotMatch(frame, / 3 +≡ MENÚ/);

  frame = await teclas('\r');
  // The thread, scrolled to that message: its box starts at the top.
  assert.match(frame.split('\n').slice(3, 5).join('\n'), /^ ┌─+┐\n │ .* No\.4806 │$/);
  frame = await teclas('\u001b');
  assert.match(frame, /^ Respuestas$/m);
});

test('Guardados y s: guardar desde la publicación, sacar desde la lista', async (t) => {
  const { app, teclas, pedidos } = await abrir(t, { post: (ruta) => redirigir(ruta.replace('/guardar', '')) });
  let frame = await teclas('m', 'g');
  assert.match(frame, /▶ Lean a Baudrillard, gordos\n +Cultura · 30 respuestas/);
  assert.match(frame, /Hilo viejo <con> & cosas archivada/);

  frame = await teclas('s');
  assert.match(frame, /Sacada de Guardados\./);
  assert.deepEqual(pedidos.filter((p) => p.method === 'POST').at(-1).body, { _csrf: 'tok&en', quitar: '1' });

  frame = await teclas('1', '\r'); // the home page, the first thread (588: not saved)
  assert.doesNotMatch(frame, /★ guardada/);
  frame = await teclas('s');
  assert.match(frame, /Guardada · s para sacarla/);
  assert.match(frame, /^ ★ Fotos de perfil$/m); // the title, at the top of the thread
  assert.deepEqual(pedidos.filter((p) => p.method === 'POST').at(-1), { method: 'POST', ruta: '/h/588/guardar', cookie: 'sid=abc', body: { _csrf: 'tok&en' } });
  frame = await teclas('j');
  assert.match(frame, /★ guardada/);
  frame = await teclas('\u001b');
  assert.match(frame, /▶ ★ Fotos de perfil \[TECNOLOGÍA\]/); // and in the list
});

test('★ amarilla antes del título de lo guardado, en la lista y en la publicación', () => {
  const [entrada] = parseListado(fixture('index.txt')).hilos;
  const hilo = { id: 588, ...parseHilo(fixture('hilo.txt')) };
  const opciones = { ancho: 80, seleccionado: 0, conTablon: true };
  const texto = (lineas) => lineas.map((l) => l.segs.map((s) => s.t).join(''));

  const { lineas } = armarLista([{ entrada, hilo }], { ...opciones, guardadas: new Set([588]) });
  assert.equal(texto(lineas)[0], '▶ ★ Fotos de perfil [TECNOLOGÍA]');
  assert.ok(lineas[0].segs.some((s) => s.t === '★ ' && s.color === COLOR.guardada));
  assert.equal(texto(armarLista([{ entrada, hilo }], opciones).lineas)[0], '▶ Fotos de perfil [TECNOLOGÍA]');

  // A long title: its next lines line up under the text, after the star.
  const larga = { ...entrada, asunto: 'palabra '.repeat(20).trim() };
  const t = texto(armarLista([{ entrada: larga, hilo }], { ...opciones, ancho: 40, guardadas: new Set([588]) }).lineas);
  assert.match(t[0], /^▶ ★ palabra/);
  assert.match(t[1], /^ {4}palabra/);
  assert.ok(t.slice(0, 4).every((l) => [...l].length <= 40));

  const enHilo = texto(armarHilo(hilo, { ancho: 80, guardada: true }).lineas);
  assert.equal(enHilo[1], '★ Fotos de perfil');
  assert.equal(texto(armarHilo(hilo, { ancho: 80 }).lineas)[1], 'Fotos de perfil');
});

test('Normas desde el menú, y Salir: cierra en el sitio, olvida la sesión y sigue sin ella', async (t) => {
  const { app, teclas, pedidos, salidas } = await abrir(t);
  let frame = await teclas('m', 'n');
  assert.match(frame, /^ Normas$/m);
  assert.match(frame, /1\. Sin acoso\./);

  frame = await teclas('m', ABAJO, ABAJO, ABAJO, '\r');
  assert.ok(pedidos.some((p) => p.method === 'POST' && p.ruta === '/salir'));
  assert.equal(salidas(), 1);
  assert.match(frame, /Saliste\. Para volver a entrar: txt login/);
  assert.doesNotMatch(frame, / 3 +≡ MENÚ/);

  frame = await teclas('m');
  assert.match(frame, /│ Normas +n +│/);
  assert.match(frame, /│ ENTRAR +e +│/);
  assert.doesNotMatch(frame, /Respuestas|SALIR/);
  frame = await teclas('e');
  assert.match(frame, /Para entrar: salí \(q\) y corré txt login/);
});

test('sin sesión no se pide nada con sesión', async (t) => {
  const { app, teclas, pedidos } = await abrir(t, { cookie: null });
  await teclas('m', 'n', '\u001b');
  assert.ok(!pedidos.some((p) => ['/guardados', '/respuestas', '/cuenta'].includes(p.ruta)));
  assert.ok(pedidos.every((p) => p.cookie === undefined));
});
