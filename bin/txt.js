#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App, PESTANAS } from '../src/app.js';
import { crearCliente } from '../src/api.js';

const AYUDA = `txt — cliente de terminal para txt.421.news

Uso: txt [sección | número de publicación] [--url <dirección>]

  txt               portada
  txt cultura       una sección (${PESTANAS.slice(1).map((p) => p.slug).join(', ')})
  txt 588           una publicación
  --url <dirección> otro sitio txt (también TXT_URL). Por defecto https://txt.421.news

Dentro, ? muestra las teclas.`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(AYUDA);
  process.exit(0);
}
let baseUrl = process.env.TXT_URL || 'https://txt.421.news';
const inicio = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--url') baseUrl = args[++i];
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
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('txt necesita una terminal interactiva. Para texto plano: curl https://txt.421.news');
  process.exit(1);
}

const cliente = crearCliente({ baseUrl });
const app = render(React.createElement(App, { cliente, inicio }), { alternateScreen: true });
await app.waitUntilExit();
