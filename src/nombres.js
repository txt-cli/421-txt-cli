import { faker } from '@faker-js/faker/locale/es';

const INTENTOS = 20;

// The site's anonymous IDs are per thread: an invented username per ID makes it easier to follow who's
// who. Made up the first time a thread is opened and kept in `store` as "<thread>-<ID>" → username,
// so they stay the same every time. No two IDs in a thread get the same name.
// → Map of ID → username.
export function nombresDelHilo(hilo, store, inventar = () => faker.internet.username()) {
  const ids = [...new Set(hilo.posts.map((p) => p.anon).filter(Boolean))];
  const nombres = new Map();
  for (const id of ids) {
    const guardado = store.get(`${hilo.id}-${id}`);
    if (guardado) nombres.set(id, guardado);
  }
  const usados = new Set(nombres.values());
  const nuevos = {};
  for (const id of ids) {
    if (nombres.has(id)) continue;
    let nombre = inventar();
    for (let i = 0; usados.has(nombre) && i < INTENTOS; i++) nombre = inventar();
    const base = nombre;
    for (let n = 2; usados.has(nombre); n++) nombre = `${base}_${n}`;
    usados.add(nombre);
    nombres.set(id, nombre);
    nuevos[`${hilo.id}-${id}`] = nombre;
  }
  if (Object.keys(nuevos).length) store.setMany(nuevos);
  return nombres;
}
