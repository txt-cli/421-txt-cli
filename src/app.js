import React, { useEffect, useMemo, useRef, useState } from 'react';
import htm from 'htm';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { BOARDS } from './parse.js';
import { COLOR, armarHilo, armarLista } from './layout.js';

const h = htm.bind(React.createElement);

// Portada + the five sections, in the site's order.
export const PESTANAS = [{ slug: null, nombre: 'Portada' }, ...BOARDS];
// The web list view shows 10 threads per page; the .txt listing brings 60.
export const POR_PAGINA = 10;
const POR_LISTADO = 60;
const CHROME = 4; // logo, tabs, rule and status bar
const ANCHO_MAX = 110;

const AYUDA = [
  ['←/→  h/l  Tab', 'sección anterior / siguiente'],
  ['1 … 6', 'ir a una sección (1 = portada)'],
  ['↑/↓', 'desplazarse una línea'],
  ['PgUp/PgDn  Espacio', 'desplazarse una pantalla'],
  ['Inicio/Fin  g/G', 'arriba / abajo de todo'],
  ['j/k', 'publicación (o mensaje) siguiente / anterior'],
  ['Enter', 'abrir la publicación marcada con ▶'],
  ['] / [   n/p', 'página siguiente / anterior'],
  ['a', 'archivo de la sección (y volver)'],
  ['r', 'recargar'],
  ['Esc  Backspace  q', 'volver a la lista (en la lista, q sale)'],
  ['?', 'mostrar / ocultar esta ayuda'],
  ['', ''],
  ['', 'Los spoilers no se pueden ver en la versión de texto: leelos en la web.'],
  ['', 'Para publicar o responder, entrá desde la web.'],
];

// An empty <Text> takes no rows in Ink: blank lines need a space.
function Linea({ segs }) {
  if (!segs.some((s) => s.t)) return h`<${Text}> <//>`;
  return h`<${Text} wrap="truncate">${segs.map(
    (s, i) => h`<${Text}
      key=${i}
      color=${s.color}
      backgroundColor=${s.bg}
      bold=${!!s.bold}
      italic=${!!s.italic}
      underline=${!!s.underline}>${s.t}<//>`,
  )}<//>`;
}

function Cabecera({ columnas, pestana, archivo, derecha }) {
  const tabs = PESTANAS.map((p, i) => {
    const activa = i === pestana;
    const nombre = `${p.nombre.toUpperCase()}${activa && archivo ? ' · ARCHIVO' : ''}`;
    return h`<${Text} key=${p.nombre} color=${activa ? COLOR.negro : COLOR.tenue} backgroundColor=${activa ? COLOR.verde : undefined} bold=${activa}> ${nombre} <//>`;
  });
  return h`<${Box} flexDirection="column">
    <${Box} justifyContent="space-between" width=${columnas}>
      <${Text} color=${COLOR.verde} bold>${'>_ TXT ▮'}<//>
      <${Text} color=${COLOR.tenue}>${derecha}<//>
    <//>
    <${Text} wrap="truncate">${tabs}<//>
    <${Text} color=${COLOR.tenue}>${'─'.repeat(columnas)}<//>
  <//>`;
}

// Offset that keeps the viewport inside the content.
const acotar = (offset, total, alto) => Math.max(0, Math.min(offset, Math.max(0, total - alto)));

export function App({ cliente, inicio = {} }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const ancho = Math.min(ANCHO_MAX, Math.max(40, columns - 2));
  const alto = Math.max(3, rows - CHROME);

  const [pestana, setPestana] = useState(inicio.pestana ?? 0);
  const [archivo, setArchivo] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hiloId, setHiloId] = useState(inicio.hilo ?? null);
  const [offsetHilo, setOffsetHilo] = useState(0);
  const [ayuda, setAyuda] = useState(false);
  const [recarga, setRecarga] = useState(0);

  // Loaded data, by key. `version` re-renders when something arrives.
  const listados = useRef(new Map());
  const hilos = useRef(new Map());
  const [, setVersion] = useState(0);
  // `r` reloads only once: the next load after it skips the client's cache, the ones after don't.
  const recargaListado = useRef(0);
  const recargaHilo = useRef(0);
  const avisar = () => setVersion((v) => v + 1);

  const board = PESTANAS[pestana].slug;
  const paginaTxt = Math.floor((pagina * POR_PAGINA) / POR_LISTADO) + 1;
  const claveListado = `${board}|${archivo}|${paginaTxt}`;

  // The current listing page, then every thread shown in it (the client caps concurrency).
  useEffect(() => {
    let vigente = true;
    const fresco = recarga !== recargaListado.current;
    recargaListado.current = recarga;
    listados.current.set(claveListado, { ...listados.current.get(claveListado), cargando: true, error: null });
    avisar();
    cliente
      .listado({ board, archivo, pagina: paginaTxt, fresco })
      .then((datos) => {
        if (!vigente) return;
        listados.current.set(claveListado, { datos, cargando: false });
        avisar();
        const desde = (pagina * POR_PAGINA) % POR_LISTADO;
        for (const entrada of datos.hilos.slice(desde, desde + POR_PAGINA)) {
          if (hilos.current.get(entrada.id)?.hilo && !fresco) continue;
          cliente.hilo(entrada.id, { fresco }).then(
            (hilo) => (hilos.current.set(entrada.id, { hilo }), avisar()),
            (err) => (hilos.current.set(entrada.id, { error: err.message }), avisar()),
          );
        }
      })
      .catch((err) => {
        if (!vigente) return;
        listados.current.set(claveListado, { cargando: false, error: err.message });
        avisar();
      });
    return () => {
      vigente = false;
    };
  }, [claveListado, pagina, recarga]);

  useEffect(() => {
    if (hiloId == null) return;
    const fresco = recarga !== recargaHilo.current;
    recargaHilo.current = recarga;
    if (hilos.current.get(hiloId)?.hilo && !fresco) return;
    cliente.hilo(hiloId, { fresco }).then(
      (hilo) => (hilos.current.set(hiloId, { hilo }), avisar()),
      (err) => (hilos.current.set(hiloId, { error: err.message }), avisar()),
    );
  }, [hiloId, recarga]);

  const estadoListado = listados.current.get(claveListado) ?? { cargando: true };
  const datos = estadoListado.datos;
  const desde = (pagina * POR_PAGINA) % POR_LISTADO;
  const entradas = datos?.hilos.slice(desde, desde + POR_PAGINA) ?? [];
  const items = entradas.map((entrada) => ({ entrada, ...hilos.current.get(entrada.id) }));

  const lista = useMemo(
    () => armarLista(items, { ancho, seleccionado: sel, conTablon: board === null }),
    [items.map((i) => `${i.entrada.id}:${!!i.hilo}:${i.error ?? ''}`).join(), ancho, sel, board],
  );
  const estadoHilo = hiloId != null ? (hilos.current.get(hiloId) ?? {}) : null;
  const vistaHilo = useMemo(
    () => (estadoHilo?.hilo ? armarHilo(estadoHilo.hilo, { ancho }) : null),
    [estadoHilo?.hilo, ancho],
  );

  // Pages of 10. The exact total is known once the last .txt page is loaded.
  const paginasTxt = datos?.paginas ?? 1;
  const hayMas = desde + POR_PAGINA < (datos?.hilos.length ?? 0) || paginaTxt < paginasTxt;
  const totalPaginas =
    datos && paginaTxt === paginasTxt
      ? `${(paginasTxt - 1) * (POR_LISTADO / POR_PAGINA) + Math.max(1, Math.ceil(datos.hilos.length / POR_PAGINA))}`
      : `~${paginasTxt * (POR_LISTADO / POR_PAGINA)}`;

  const enHilo = hiloId != null;
  const contenido = ayuda ? null : enHilo ? vistaHilo : lista;
  const total = contenido?.lineas.length ?? 0;
  const off = acotar(enHilo ? offsetHilo : offset, total, alto);

  const irA = (nuevo) => {
    const o = acotar(nuevo, total, alto);
    if (enHilo) return setOffsetHilo(o);
    setOffset(o);
    // The marked thread follows the scroll: the last one whose title is at or above the top.
    const i = lista.anclas.findLastIndex((a) => a.linea <= o);
    setSel(Math.max(0, i));
  };
  const saltar = (dir) => {
    const anclas = contenido?.anclas ?? [];
    if (!anclas.length) return;
    if (enHilo) {
      const actual = anclas.findLastIndex((a) => a.linea <= off);
      const destino = anclas[Math.max(0, Math.min(anclas.length - 1, actual + dir))];
      return setOffsetHilo(acotar(destino.linea, total, alto));
    }
    const nuevo = Math.max(0, Math.min(anclas.length - 1, sel + dir));
    setSel(nuevo);
    setOffset(acotar(anclas[nuevo].linea, total, alto));
  };
  const cambiarPestana = (i) => {
    setPestana((i + PESTANAS.length) % PESTANAS.length);
    setArchivo(false);
    setPagina(0);
    setSel(0);
    setOffset(0);
  };
  const cambiarPagina = (p) => {
    setPagina(p);
    setSel(0);
    setOffset(0);
  };

  useInput((input, key) => {
    if (input === '?') return setAyuda((a) => !a);
    if (ayuda) {
      if (key.escape || input === 'q') setAyuda(false);
      return;
    }
    if (input === 'r') return setRecarga((n) => n + 1);

    if (key.upArrow) return irA(off - 1);
    if (key.downArrow) return irA(off + 1);
    if (key.pageUp) return irA(off - (alto - 1));
    if (key.pageDown || input === ' ') return irA(off + (alto - 1));
    if (key.home || input === 'g') return irA(0);
    if (key.end || input === 'G') return irA(total);
    if (input === 'j') return saltar(1);
    if (input === 'k') return saltar(-1);

    if (enHilo) {
      if (key.escape || key.backspace || key.delete || key.leftArrow || input === 'q') {
        setHiloId(null);
        setOffsetHilo(0);
      }
      return;
    }

    if (input === 'q') return exit();
    if (key.leftArrow || input === 'h' || (key.tab && key.shift)) return cambiarPestana(pestana - 1);
    if (key.rightArrow || input === 'l' || key.tab) return cambiarPestana(pestana + 1);
    if (/^[1-6]$/.test(input)) return cambiarPestana(Number(input) - 1);
    if ((input === ']' || input === 'n') && hayMas) return cambiarPagina(pagina + 1);
    if ((input === '[' || input === 'p') && pagina > 0) return cambiarPagina(pagina - 1);
    if (input === 'a' && board) {
      setArchivo((a) => !a);
      cambiarPagina(0);
      return;
    }
    if (key.return && entradas[sel]) {
      setHiloId(entradas[sel].id);
      setOffsetHilo(0);
    }
  });

  // --- Drawing -------------------------------------------------------------------------------
  let cuerpo;
  let estado;
  if (ayuda) {
    cuerpo = h`<${Box} flexDirection="column" paddingLeft=${1}>
      <${Text} color=${COLOR.verde} bold>Teclas<//>
      <${Text}> <//>
      ${AYUDA.map(([k, d], i) => h`<${Text} key=${i}><${Text} color=${COLOR.cita}>${k.padEnd(22)}<//><${Text} color=${COLOR.texto}>${d}<//><//>`)}
    <//>`;
    estado = '? o Esc para volver';
  } else if (enHilo) {
    if (estadoHilo.error) cuerpo = h`<${Text} color=${COLOR.error}>  No se pudo cargar la publicación: ${estadoHilo.error}<//>`;
    else if (!vistaHilo) cuerpo = h`<${Text} color=${COLOR.tenue}>  cargando…<//>`;
    estado = `${cliente.baseUrl}/h/${hiloId}  ·  ↑↓ mover · j/k mensaje · Esc volver · ? ayuda`;
  } else {
    if (estadoListado.error && !datos) cuerpo = h`<${Text} color=${COLOR.error}>  No se pudo cargar: ${estadoListado.error} (r para reintentar)<//>`;
    else if (!datos) cuerpo = h`<${Text} color=${COLOR.tenue}>  cargando…<//>`;
    estado = `Página ${pagina + 1} de ${totalPaginas}  ·  ←→ sección · j/k publicación · Enter abrir · ][ página${board ? ' · a archivo' : ''} · ? ayuda`;
  }
  if (!cuerpo && contenido) {
    cuerpo = contenido.lineas.slice(off, off + alto).map((l, i) => h`<${Linea} key=${off + i} segs=${l.segs} />`);
  }

  const pestanaHilo = enHilo && estadoHilo?.hilo ? PESTANAS.findIndex((p) => p.slug === estadoHilo.hilo.board) : pestana;
  const posicion = total > alto ? `${Math.round((off / Math.max(1, total - alto)) * 100)}%` : '';
  return h`<${Box} flexDirection="column" width=${columns} height=${rows}>
    <${Cabecera} columnas=${columns} pestana=${pestanaHilo} archivo=${!enHilo && archivo} derecha=${posicion} />
    <${Box} flexDirection="column" height=${alto} paddingLeft=${1} overflow="hidden">${cuerpo}<//>
    <${Text} wrap="truncate" color=${COLOR.tenue}>${estado}<//>
  <//>`;
}
