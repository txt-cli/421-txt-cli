import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearCliente } from '../src/api.js';
import { login } from '../src/login.js';
import { borrarSesion, cookieDeSesion, guardarSesion, leerSesion, rutaSesiones } from '../src/sesion.js';

test('cookieDeSesion: solo sid, desde el id, la línea Cookie: o cURL', () => {
  assert.equal(cookieDeSesion('  abc123_-XY  '), 'sid=abc123_-XY');
  assert.equal(cookieDeSesion('sid=abc123'), 'sid=abc123');
  assert.equal(cookieDeSesion('Cookie: visita=1.2; sid=abc; tema=oscuro\n'), 'sid=abc');
  assert.equal(
    cookieDeSesion(`curl 'https://txt.421.news/' -H 'accept: text/html' -H 'cookie: tema=oscuro; sid=abc' -H 'user-agent: x'`),
    'sid=abc',
  );
  assert.equal(cookieDeSesion(`curl 'https://txt.421.news/' -b 'sid=abc'`), 'sid=abc');
  assert.equal(cookieDeSesion('visita=1.2; tema=oscuro'), null);
  assert.equal(cookieDeSesion('nada por acá'), null);
  assert.equal(cookieDeSesion(''), null);
});

test('sesiones por origen, archivo privado, logout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-cli-'));
  const ruta = rutaSesiones({ XDG_CONFIG_HOME: dir });
  assert.equal(leerSesion('https://txt.421.news', ruta), null);

  guardarSesion('https://txt.421.news/', 'sesion=abc', ruta);
  assert.equal(leerSesion('https://txt.421.news', ruta), 'sesion=abc');
  assert.equal(leerSesion('https://otro.example', ruta), null);
  assert.equal(fs.statSync(ruta).mode & 0o777, 0o600);

  assert.equal(borrarSesion('https://txt.421.news', ruta), true);
  assert.equal(borrarSesion('https://txt.421.news', ruta), false);
  assert.equal(leerSesion('https://txt.421.news', ruta), null);
  fs.rmSync(dir, { recursive: true });
});

test('el cliente manda la cookie y avisa si la sesión venció', async () => {
  const vistos = [];
  const fetch = async (url, { headers }) => {
    vistos.push(headers.Cookie);
    return new Response('', { status: 403 });
  };
  await assert.rejects(crearCliente({ fetch, cookie: 'sesion=abc' }).listado({}), /txt login/);
  await assert.rejects(crearCliente({ fetch }).listado({}), /respondió 403/);
  assert.deepEqual(vistos, ['sesion=abc', undefined]);
});

// /cuenta: 200 with the right sid, 303 to /entrar otherwise (like the site).
test('txt login <sid> comprueba la sesión y solo guarda la que sirve', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-cli-'));
  const antes = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  const pedidos = [];
  const fetch = async (url, { headers, redirect }) => {
    pedidos.push({ ruta: new URL(url).pathname, cookie: headers.Cookie, redirect });
    return headers.Cookie === 'sid=buena'
      ? new Response('cuenta', { status: 200 })
      : new Response(null, { status: 303, headers: { Location: '/entrar' } });
  };
  const log = console.log;
  const error = console.error;
  const dicho = [];
  console.log = console.error = (...a) => dicho.push(a.join(' '));
  try {
    assert.equal(await login('https://txt.421.news', 'mala', { fetch }), 1);
    assert.equal(leerSesion('https://txt.421.news'), null);
    assert.match(dicho.at(-1), /no reconoce esa sesión/);

    assert.equal(await login('https://txt.421.news', 'buena', { fetch }), 0);
    assert.equal(leerSesion('https://txt.421.news'), 'sid=buena');
    assert.match(dicho.join('\n'), /Sesión válida/);
    assert.doesNotMatch(dicho.join('\n'), /F12/); // with the id, no instructions

    const caido = async () => new Response('', { status: 502 });
    assert.equal(await login('https://txt.421.news', 'otra', { fetch: caido }), 1);
    assert.match(dicho.at(-1), /No pude comprobar la sesión \(El sitio respondió 502\.\)/);
    assert.equal(leerSesion('https://txt.421.news'), 'sid=buena'); // the good one stays
  } finally {
    console.log = log;
    console.error = error;
    if (antes === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = antes;
    fs.rmSync(dir, { recursive: true });
  }
  assert.deepEqual(pedidos, [
    { ruta: '/cuenta', cookie: 'sid=mala', redirect: 'manual' },
    { ruta: '/cuenta', cookie: 'sid=buena', redirect: 'manual' },
  ]);
});
