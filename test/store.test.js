import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { nombresDelHilo } from '../src/nombres.js';
import { parseHilo } from '../src/parse.js';
import { crearStores, directorioStores } from '../src/store.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const esperar = (ms = 80) => new Promise((ok) => setTimeout(ok, ms));
const temporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'txt-cli-store-'));

test('directorio por sesión: md5 del sid; sin sesión, anonimo', () => {
  const env = { XDG_STATE_HOME: '/estado' };
  const md5 = crypto.createHash('md5').update('abc123').digest('hex');
  assert.equal(directorioStores({ sid: 'abc123', env }), path.join('/estado', 'txt-cli', md5));
  assert.equal(directorioStores({ env }), path.join('/estado', 'txt-cli', 'anonimo'));
  assert.equal(directorioStores({ sid: 'abc123', env: { HOME: '/x' } }).endsWith(path.join('.local', 'state', 'txt-cli', md5)), true);
});

test('store: un archivo por nombre, clave → valor, persiste', () => {
  const dir = temporal();
  const stores = crearStores({ dir });
  const a = stores('usuarios');
  assert.equal(stores('usuarios'), a);
  assert.equal(a.get('x'), undefined);
  a.set('x', 'uno');
  a.setMany({ y: { n: 2 }, z: [3] });
  stores('otro').set('x', 'distinto');
  assert.equal(a.delete('z'), true);
  assert.equal(a.delete('z'), false);

  const otraVez = crearStores({ dir });
  assert.deepEqual(
    { x: otraVez('usuarios').get('x'), y: otraVez('usuarios').get('y'), claves: otraVez('usuarios').keys() },
    { x: 'uno', y: { n: 2 }, claves: ['x', 'y'] },
  );
  assert.equal(otraVez('otro').get('x'), 'distinto');
  assert.equal(otraVez('usuarios').has('toString'), false);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['otro.json', 'usuarios.json']);
  assert.equal(fs.statSync(path.join(dir, 'usuarios.json')).mode & 0o777, 0o600);
  assert.throws(() => stores('../afuera'), /inválido/);
  fs.rmSync(dir, { recursive: true });
});

test('store: un archivo roto arranca vacío', () => {
  const dir = temporal();
  fs.writeFileSync(path.join(dir, 'roto.json'), '{ no es json');
  const s = crearStores({ dir })('roto');
  assert.deepEqual(s.keys(), []);
  s.set('a', 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'roto.json'), 'utf8')), { a: 1 });
  fs.rmSync(dir, { recursive: true });
});

test('nombresDelHilo: uno por ID, sin repetir, guardados como <hilo>-<ID>', () => {
  const dir = temporal();
  const store = crearStores({ dir })('usuarios');
  const hilo = { id: 588, ...parseHilo(fixture('hilo.txt')) };
  const ids = [...new Set(hilo.posts.map((p) => p.anon).filter(Boolean))];

  // A generator that repeats itself: the names still come out different.
  let n = 0;
  const nombres = nombresDelHilo(hilo, store, () => `nombre${Math.floor(n++ / 3)}`);
  assert.deepEqual([...nombres.keys()].sort(), ids.sort());
  assert.equal(new Set(nombres.values()).size, ids.length);
  assert.equal(store.get(`588-${ids[0]}`), nombres.get(ids[0]));
  assert.equal(store.keys().length, ids.length);

  // Next time: the same names, nothing new invented.
  const otraVez = nombresDelHilo(hilo, crearStores({ dir })('usuarios'), () => assert.fail('no tendría que inventar'));
  assert.deepEqual(otraVez, nombres);

  // With faker, by default.
  const otro = nombresDelHilo({ ...hilo, id: 9 }, store);
  assert.ok([...otro.values()].every((v) => /^\S+$/.test(v) && !v.startsWith('nombre')));
  fs.rmSync(dir, { recursive: true });
});

test('al abrir una publicación se ven los nombres en vez de los IDs', async () => {
  const dir = temporal();
  const stores = crearStores({ dir });
  const cliente = crearCliente({ fetch: async () => new Response(fixture('hilo.txt')) });
  const app = render(React.createElement(App, { cliente, inicio: { hilo: 588 }, stores }));
  await esperar(250);
  const frame = app.lastFrame();
  const op = stores('usuarios').get('588-UC1uqVvA');
  assert.ok(op);
  assert.match(frame, new RegExp(`${op.replace(/[.]/g, '\\.')} +OP`));
  assert.doesNotMatch(frame, /ID UC1uqVvA/);
  app.unmount();
  fs.rmSync(dir, { recursive: true });
});

test('la vista de lista también muestra los nombres, los mismos que al abrir la publicación', async () => {
  const dir = temporal();
  const stores = crearStores({ dir });
  const fetch = async (url) => new Response(fixture(new URL(url).pathname === '/index.txt' ? 'index.txt' : 'hilo.txt'));
  const app = render(React.createElement(App, { cliente: crearCliente({ fetch }), stores }));
  await esperar(300);
  let frame = app.lastFrame();
  // The first thread on the home page is 588: its OP, under the name the store has for it.
  const op = stores('usuarios').get('588-UC1uqVvA');
  assert.ok(op);
  assert.match(frame, new RegExp(`${op.replace(/[.]/g, '\\.')} +OP`));
  const ids = stores('usuarios').keys().map((k) => k.slice(k.indexOf('-') + 1));
  assert.ok(ids.length > 1);
  for (const id of ids) assert.ok(!frame.includes(`ID ${id}`), id);

  app.stdin.write('\r');
  await esperar(250);
  frame = app.lastFrame();
  assert.match(frame, new RegExp(`${op.replace(/[.]/g, '\\.')} +OP`));
  app.unmount();
  fs.rmSync(dir, { recursive: true });
});
