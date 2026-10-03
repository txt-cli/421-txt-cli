import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const CUENTA = '<form method="post" action="/salir"><input type="hidden" name="_csrf" value="tok&amp;en"><button class="enlace">Salir</button></form>';

// A logged-in site: /cuenta with the token, the reply answered by `respuesta(cuerpo)`.
function sitio({ respuesta, cookie = 'sid=abc' } = {}) {
  const pedidos = [];
  const fetch = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const { pathname } = new URL(url);
    pedidos.push({ method, ruta: pathname, cookie: headers.Cookie, body: body && Object.fromEntries(new URLSearchParams(body)) });
    if (pathname === '/cuenta') return new Response(CUENTA, { status: 200 });
    if (method === 'POST') return respuesta(Object.fromEntries(new URLSearchParams(body)));
    return new Response(fixture(pathname === '/index.txt' ? 'index.txt' : 'hilo.txt'));
  };
  return { cliente: crearCliente({ fetch, cookie }), pedidos };
}
const redirigir = (location) => new Response(null, { status: 303, headers: { Location: location } });

test('responder: token de /cuenta (una vez), formulario y dónde quedó', async () => {
  const { cliente, pedidos } = sitio({ respuesta: () => redirigir('/h/588#p4900') });
  assert.deepEqual(await cliente.responder(588, '>>4797\nhola', { sage: true }), { postId: 4900, enCola: false });
  assert.deepEqual(await cliente.responder(588, 'otra'), { postId: 4900, enCola: false });
  assert.deepEqual(
    pedidos.map((p) => `${p.method} ${p.ruta}`),
    ['GET /cuenta', 'POST /h/588/responder', 'POST /h/588/responder'],
  );
  assert.deepEqual(pedidos[1].body, { _csrf: 'tok&en', cuerpo: '>>4797\nhola', sage: '1' });
  assert.deepEqual(pedidos[2].body, { _csrf: 'tok&en', cuerpo: 'otra' });
  assert.ok(pedidos.every((p) => p.cookie === 'sid=abc'));
});

test('responder: en revisión, rechazos del sitio y sesión vencida', async () => {
  const caso = (respuesta) => sitio({ respuesta }).cliente.responder(588, 'hola');
  assert.deepEqual(await caso(() => redirigir('/h/588?aviso=cola#p4901')), { postId: 4901, enCola: true });
  await assert.rejects(
    caso(() => new Response('<main><p class="error">No se publicó: el mensaje no cumple las normas.</p></main>', { status: 422 })),
    { message: 'No se publicó: el mensaje no cumple las normas.' },
  );
  await assert.rejects(
    caso(() => new Response('<p class="error">Esta publicación ya no acepta respuestas.</p>', { status: 409 })),
    /ya no acepta respuestas/,
  );
  await assert.rejects(caso(() => redirigir('/entrar')), /txt login/);
  await assert.rejects(caso(() => new Response('', { status: 404 })), /ya no existe/);
  await assert.rejects(crearCliente({ fetch: async () => assert.fail('no tendría que pedir nada') }).responder(588, 'hola'), /txt login/);
});

async function abrirHilo(s) {
  const app = render(React.createElement(App, { cliente: s.cliente, inicio: { hilo: 588 } }));
  await esperar(200);
  const teclas = async (...ks) => {
    for (const k of ks) {
      app.stdin.write(k);
      await esperar();
    }
    await esperar(150);
    return app.lastFrame();
  };
  return { app, teclas };
}

test('c responde citando el mensaje de arriba; Ctrl+D envía y lleva a la respuesta', async () => {
  const s = sitio({ respuesta: () => redirigir('/h/588#p4797') });
  const { app, teclas } = await abrirHilo(s);
  assert.match(app.lastFrame(), /c responder a No\.4797/);

  let frame = await teclas('c');
  assert.match(frame, /Respuesta en «Fotos de perfil»/);
  assert.match(frame, /ID UC1uqVvA +OP .*No\.4797/); // the quoted message, above
  assert.match(frame, /│ Admin podríamos transformar/);
  assert.match(frame, /\n >>4797\n/);
  frame = await teclas('buena idea', '\r', 'x', '\u007f', 'y', '\t');
  assert.match(frame, /buena idea\n.*y▮/);
  assert.match(frame, /sage/);

  frame = await teclas('\u0004'); // Ctrl+D
  assert.match(frame, /Respuesta publicada\./);
  const post = s.pedidos.find((p) => p.method === 'POST');
  assert.deepEqual(post.body, { _csrf: 'tok&en', cuerpo: '>>4797\nbuena idea\ny', sage: '1' });
  app.unmount();
});

test('Esc con texto pide confirmación; sin sesión, c avisa y no abre nada', async () => {
  const conSesion = await abrirHilo(sitio({ respuesta: () => assert.fail('no se envía') }));
  let frame = await conSesion.teclas('C', 'hola');
  assert.match(frame, /Respuesta en/);
  assert.doesNotMatch(frame, /No\.4797|Admin podríamos/); // no quote, no message above
  frame = await conSesion.teclas('\u001b');
  assert.match(frame, /Esc de nuevo para descartar/);
  frame = await conSesion.teclas('\u001b');
  assert.doesNotMatch(frame, /Respuesta en/);
  assert.match(frame, /No\.4797/);
  conSesion.app.unmount();

  const sinSesion = await abrirHilo(sitio({ cookie: null }));
  frame = await sinSesion.teclas('c');
  assert.match(frame, /txt login/);
  assert.doesNotMatch(frame, /Respuesta en/);
  sinSesion.app.unmount();
});
