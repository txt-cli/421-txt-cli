import readline from 'node:readline';
import { crearCliente } from './api.js';
import { abrirNavegador, borrarSesion, cookieDeSesion, guardarSesion, rutaSesiones } from './sesion.js';

// The site's Google login has a fixed redirect to its own /auth/google/callback and exchanges the code
// server-side (PKCE), so the terminal can't finish it. The browser does the whole handshake and we
// keep the session cookie it ends up with.
const PASOS = (base) => `Para entrar a ${base}:

  1. Entrá con Google en la ventana del navegador (si no se abrió: ${base}/auth/google).
  2. Ya adentro, abrí las herramientas de desarrollo (F12) → pestaña Red (Network) y recargá.
  3. Elegí el primer pedido a ${new URL(base).host} y copiá el valor del encabezado Cookie
     del pedido (Request Headers). También sirve "Copiar como cURL" o solo el valor de sid.

  La cookie de sesión (sid) es HttpOnly: no aparece en document.cookie, por eso hay que sacarla de Red.
  Si ya tenés el valor de sid: txt login <sid>
`;

// A cURL paste spans several lines ending in "\"; a cookie value is one line.
async function leerPegado() {
  if (!process.stdin.isTTY) {
    let s = '';
    for await (const c of process.stdin) s += c;
    return s;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lineas = [];
  rl.setPrompt('Pegá acá y Enter: ');
  rl.prompt();
  try {
    for await (const l of rl) {
      lineas.push(l);
      if (!/\\\s*$/.test(l)) break;
    }
  } finally {
    rl.close();
  }
  return lineas.join('\n').replace(/\\\n/g, ' ');
}

// sid: the session id given on the command line; without it, walk through the browser and ask for it.
export async function login(baseUrl, sid = null, { fetch } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  if (sid === null) {
    console.log(PASOS(base));
    if (process.stdin.isTTY) abrirNavegador(`${base}/auth/google`);
  }
  const cookie = cookieDeSesion(sid ?? (await leerPegado()));
  if (!cookie) {
    console.error('No encontré la cookie sid en lo que pegaste. No guardé nada.');
    return 1;
  }
  let valida;
  try {
    valida = await crearCliente({ baseUrl: base, cookie, ...(fetch ? { fetch } : {}) }).sesionValida();
  } catch (e) {
    console.error(`No pude comprobar la sesión (${e.message}). No guardé nada.`);
    return 1;
  }
  if (!valida) {
    console.error(`${base} no reconoce esa sesión (venció, se cerró o está mal copiada). No guardé nada.`);
    return 1;
  }
  guardarSesion(base, cookie);
  console.log(`Sesión válida: entraste a ${base}. Quedó guardada en ${rutaSesiones()} (solo la puede leer tu usuario).`);
  console.log('Para borrarla: txt logout');
  return 0;
}

export function logout(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  console.log(borrarSesion(base) ? `Sesión de ${base} borrada.` : `No había sesión guardada para ${base}.`);
  return 0;
}
