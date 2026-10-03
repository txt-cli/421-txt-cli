import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Sessions live in one file, keyed by origin, so a cookie for one txt site is never sent to another.
export function rutaSesiones(env = process.env) {
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'txt-cli', 'sesiones.json');
}

function leerTodas(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return {};
  }
}

function escribirTodas(ruta, todas) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true, mode: 0o700 });
  const tmp = `${ruta}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(todas, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, ruta);
}

export function leerSesion(baseUrl, ruta = rutaSesiones()) {
  return leerTodas(ruta)[new URL(baseUrl).origin]?.cookie ?? null;
}

export function guardarSesion(baseUrl, cookie, ruta = rutaSesiones()) {
  const todas = leerTodas(ruta);
  todas[new URL(baseUrl).origin] = { cookie, guardada: new Date().toISOString() };
  escribirTodas(ruta, todas);
}

// true if there was a session to remove.
export function borrarSesion(baseUrl, ruta = rutaSesiones()) {
  const todas = leerTodas(ruta);
  const origen = new URL(baseUrl).origin;
  if (!(origen in todas)) return false;
  delete todas[origen];
  escribirTodas(ruta, todas);
  return true;
}

// The site's session is the `sid` cookie (the others, like `visita`, would mess with its "new" marks).
// Accepts the bare id, the request's Cookie header (with or without "Cookie:"), or a "Copy as cURL"
// command. Returns "sid=…", or null.
export function cookieDeSesion(pegado) {
  let s = String(pegado ?? '').trim();
  if (/^[^\s;=]+$/.test(s)) return `sid=${s}`;
  const curl = s.match(/(?:-H|--header)\s+(['"])cookie:\s*(.*?)\1/i) ?? s.match(/(?:-b|--cookie)\s+(['"])(.*?)\1/);
  if (curl) s = curl[2];
  const sid = s
    .replace(/^cookie:\s*/i, '')
    .split(';')
    .map((p) => p.trim().match(/^sid=([^\s;,]+)$/))
    .find(Boolean);
  return sid ? `sid=${sid[1]}` : null;
}

export function abrirNavegador(url, plataforma = process.platform) {
  const [cmd, ...args] =
    plataforma === 'darwin' ? ['open', url] : plataforma === 'win32' ? ['cmd', '/c', 'start', '""', url] : ['xdg-open', url];
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
    return true;
  } catch {
    return false;
  }
}
