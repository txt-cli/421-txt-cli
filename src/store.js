import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Local state, one directory per session: <state>/txt-cli/<md5 of the session id>/<name>.json.
// Logged out, it goes to `anonimo`. Each store is a namespace: a flat JSON object of key → value.

const NOMBRE = /^[a-z0-9][a-z0-9_-]*$/i;

export function directorioStores({ sid = null, env = process.env } = {}) {
  const base = env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  const sesion = sid ? crypto.createHash('md5').update(sid).digest('hex') : 'anonimo';
  return path.join(base, 'txt-cli', sesion);
}

// stores(nombre) → the store with that name, the same object every time.
export function crearStores({ dir = directorioStores() } = {}) {
  const abiertos = new Map();
  const stores = (nombre) => {
    if (!NOMBRE.test(nombre)) throw new Error(`Nombre de store inválido: ${nombre}`);
    if (!abiertos.has(nombre)) abiertos.set(nombre, abrirStore(path.join(dir, `${nombre}.json`)));
    return abiertos.get(nombre);
  };
  stores.dir = dir;
  return stores;
}

// Read once, kept in memory; every change rewrites the file (atomically, readable only by the user).
// A file that's missing or broken starts empty: it's a cache of local state, not something to lose sleep over.
function abrirStore(archivo) {
  let datos;
  const cargar = () => {
    if (datos) return datos;
    try {
      const leido = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      datos = leido && typeof leido === 'object' && !Array.isArray(leido) ? leido : {};
    } catch {
      datos = {};
    }
    return datos;
  };
  const guardar = () => {
    fs.mkdirSync(path.dirname(archivo), { recursive: true, mode: 0o700 });
    const tmp = `${archivo}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(datos, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, archivo);
  };
  return {
    archivo,
    get: (clave) => (Object.hasOwn(cargar(), clave) ? datos[clave] : undefined),
    has: (clave) => Object.hasOwn(cargar(), clave),
    set(clave, valor) {
      cargar()[clave] = valor;
      guardar();
    },
    // Several keys, one write.
    setMany(entradas) {
      Object.assign(cargar(), entradas);
      guardar();
    },
    delete(clave) {
      if (!Object.hasOwn(cargar(), clave)) return false;
      delete datos[clave];
      guardar();
      return true;
    },
    keys: () => Object.keys(cargar()),
  };
}
