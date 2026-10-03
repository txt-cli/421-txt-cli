#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App, PESTANAS } from '../src/app.js';
import { crearCliente } from '../src/api.js';
import { login, logout } from '../src/login.js';
import { borrarSesion, leerSesion } from '../src/sesion.js';
import { crearStores, directorioStores } from '../src/store.js';

const AYUDA = `txt — cliente de terminal para txt.421.news

Uso: txt [sección | número de publicación] [--url <dirección>]
     txt login [sid] | logout [--url <dirección>]

  txt               portada
  txt cultura       una sección (${PESTANAS.slice(1).map((p) => p.slug).join(', ')})
  txt 588           una publicación
  txt login         entrar con tu cuenta (Google, desde el navegador)
  txt login <sid>   usar una sesión que ya tenés (la cookie sid) y comprobarla
  txt logout        olvidar la sesión guardada
  --url <dirección> otro sitio txt (también TXT_URL). Por defecto https://txt.421.news

Dentro, ? muestra las teclas.`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(AYUDA);
  process.exit(0);
}
let baseUrl = process.env.TXT_URL || 'https://txt.421.news';
const inicio = {};
let comando = null;
let sid = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--url') baseUrl = args[++i];
  else if ((a === 'login' || a === 'logout') && !comando) comando = a;
  else if (comando === 'login' && sid === null) sid = a;
  else if (/^\d+$/.test(a)) inicio.hilo = Number(a);
  else {
    const n = PESTANAS.findIndex((p) => p.slug === a);
    if (n === -1) {
      console.error(`No existe la sección "${a}".\n\n${AYUDA}`);
      process.exit(1);
    }
    inicio.pestana = n;
  }
}
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error('--url tiene que empezar con http:// o https://');
  process.exit(1);
}
if (comando === 'login') process.exit(await login(baseUrl, sid));
if (comando === 'logout') process.exit(logout(baseUrl));
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('txt necesita una terminal interactiva. Para texto plano: curl https://txt.421.news');
  process.exit(1);
}

const cookie = leerSesion(baseUrl);
const cliente = crearCliente({ baseUrl, cookie });
const stores = crearStores({ dir: directorioStores({ sid: cookie?.match(/^sid=(.*)$/)?.[1] }) });
// Salir in the menu: the site already closed the session; forget it here and go on with the logged-out state.
const onSalir = () => {
  borrarSesion(baseUrl);
  return crearStores({ dir: directorioStores() });
};
const app = render(React.createElement(App, { cliente, inicio, stores, onSalir }), { alternateScreen: true });
await app.waitUntilExit();
