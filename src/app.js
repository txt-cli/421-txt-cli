import React, { useEffect, useMemo, useRef, useState } from 'react';
import htm from 'htm';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { BOARDS } from './parse.js';
import { MAX_CUERPO } from './api.js';
import { COLOR, armarBusqueda, armarDocumento, armarGuardados, armarHilo, armarLista, armarPost, armarRespuestas, envolver } from './layout.js';
import { nombresDelHilo } from './nombres.js';

const h = htm.bind(React.createElement);

// Portada + the five sections, in the site's order.
export const PESTANAS = [{ slug: null, nombre: 'Portada' }, ...BOARDS];
// The web list view shows 10 threads per page; the .txt listing brings 60.
export const POR_PAGINA = 10;
const POR_LISTADO = 60;
const CHROME = 4; // logo, tabs, rule and status bar
const ANCHO_MAX = 110;
const CONSULTA_MS = 2 * 60_000; // how often the unread count (and Guardados) is checked while logged in
const ANCHO_MENU = 26;
const FONDO_MENU = '#16201a';
const ALTO_BUSQUEDA = 3; // the search box, with its border
const MAX_BUSQUEDA = 100; // the site cuts the query there

// The menu (m), like the web's MENÚ. Logged out, only what works without a session.
const MENU_CON_SESION = [
  { id: 'respuestas', nombre: 'Respuestas', tecla: 'r' },
  { id: 'guardados', nombre: 'Guardados', tecla: 'g' },
  { id: 'normas', nombre: 'Normas', tecla: 'n' },
  { id: 'salir', nombre: 'SALIR', tecla: 's', fuerte: true },
];
const MENU_SIN_SESION = [
  { id: 'normas', nombre: 'Normas', tecla: 'n' },
  { id: 'entrar', nombre: 'ENTRAR', tecla: 'e', fuerte: true },
];

const AYUDA = [
  ['←/→  h/l  Tab', 'sección anterior / siguiente'],
  ['1 … 6', 'ir a una sección (1 = portada)'],
  ['↑/↓', 'desplazarse una línea'],
  ['PgUp/PgDn  Espacio', 'desplazarse una pantalla'],
  ['Inicio/Fin  g/G', 'arriba / abajo de todo'],
  ['j/k', 'publicación (o mensaje) siguiente / anterior'],
  ['Enter', 'abrir la publicación marcada con ▶'],
  ['m', 'menú: Respuestas, Guardados, Normas, Salir'],
  ['b', 'buscar (y cerrar la búsqueda); en los resultados, / cambia lo buscado'],
  ['s', 'en una publicación (o en Guardados): guardarla / sacarla de Guardados'],
  ['c / C', 'en una publicación: responder citando el mensaje de arriba / sin citar'],
  ['i', 'ignorar (o dejar de ignorar) la publicación marcada; adentro, el mensaje de arriba'],
  ['I', 'en una publicación: ignorar todos los mensajes del autor del mensaje de arriba'],
  ['] / [   n/p', 'página siguiente / anterior'],
  ['a', 'archivo de la sección (y volver)'],
  ['r', 'recargar'],
  ['Esc  Backspace  q', 'volver a la lista (en la lista, q sale)'],
  ['?', 'mostrar / ocultar esta ayuda'],
  ['', ''],
  ['', 'Los spoilers no se pueden ver en la versión de texto: leelos en la web.'],
  ['', 'Para responder hay que entrar con txt login. Para publicar, la web.'],
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

function BotonMenu({ abierto, novedades }) {
  return h`<${Box} flexShrink=${0}>
    <${Text}>
      <${Text} backgroundColor=${COLOR.cita} color=${COLOR.negro} bold>${novedades ? ` ${novedades} ` : ''}<//>${novedades ? ' ' : ''}
      <${Text} color=${abierto ? COLOR.negro : COLOR.verde} backgroundColor=${abierto ? COLOR.verde : undefined} bold>${' ≡ MENÚ '}<//>
    <//>
  <//>`;
}

// The floating menu, under the MENÚ button: ▶ marks the item Enter opens; each has its key.
function Menu({ items, sel, novedades, columnas }) {
  const interior = ANCHO_MENU - 2;
  const filas = items.flatMap((it, i) => {
    const marcado = i === sel;
    const nombre = it.id === 'respuestas' && novedades ? `${it.nombre} (${novedades})` : it.nombre;
    const texto = ` ${nombre}`.padEnd(interior - 3) + `${it.tecla} `;
    const fila = h`<${Text} key=${it.id}
      color=${marcado ? COLOR.negro : it.fuerte ? COLOR.verde : COLOR.texto}
      backgroundColor=${marcado ? COLOR.verde : FONDO_MENU}
      bold=${marcado || !!it.fuerte}>${texto}<//>`;
    return i ? [h`<${Text} key=${`-${i}`} color=${COLOR.tenue} backgroundColor=${FONDO_MENU}>${'─'.repeat(interior)}<//>`, fila] : [fila];
  });
  return h`<${Box}
    position="absolute"
    marginTop=${2}
    marginLeft=${Math.max(0, columnas - ANCHO_MENU)}
    width=${ANCHO_MENU}
    flexDirection="column"
    borderStyle="single"
    borderColor=${COLOR.verde}
    backgroundColor=${FONDO_MENU}>${filas}<//>`;
}

// Below the sections, above the posts. With focus, what's typed goes here (▮ is the cursor).
function CajaBusqueda({ busqueda, ancho }) {
  const { texto, foco } = busqueda;
  return h`<${Box} width=${ancho + 1} height=${ALTO_BUSQUEDA} borderStyle="round" borderColor=${foco ? COLOR.verde : COLOR.tenue} paddingX=${1}>
    <${Text} wrap="truncate-start">
      <${Text} color=${foco ? COLOR.verde : COLOR.tenue} bold>Buscar: <//>
      <${Text} color=${foco ? COLOR.texto : COLOR.tenue}>${texto}<//>
      <${Text} color=${COLOR.verde}>${foco ? '▮' : ''}<//>
      <${Text} color=${COLOR.tenue}>${!foco ? '   / cambiar · b cerrar' : !texto ? ' palabras a buscar, Enter para buscar' : ''}<//>
    <//>
  <//>`;
}

function Cabecera({ columnas, pestana, archivo, derecha, menuAbierto, novedades }) {
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
    <${Box} width=${columnas}>
      <${Box} flexGrow=${1} overflow="hidden"><${Text} wrap="truncate">${tabs}<//><//>
      <${BotonMenu} abierto=${menuAbierto} novedades=${novedades} />
    <//>
    <${Text} color=${COLOR.tenue}>${'─'.repeat(columnas)}<//>
  <//>`;
}

// The reply being written: the text grows at the end (no cursor movement), Enter is a new line.
// `citado`: the quoted message (with its OP flag), shown above in at most a third of the screen.
function Redactor({ respuesta, asunto, citado, ancho, alto }) {
  const cita = citado ? armarPost(citado.post, { ancho, esOp: citado.esOp, maximo: Math.max(3, Math.floor(alto / 3)) }) : [];
  const lineas = respuesta.texto.split('\n').flatMap((l) => envolver(l, ancho - 1));
  lineas[lineas.length - 1] += '▮';
  const pie = respuesta.error
    ? h`<${Text} color=${COLOR.error}>${respuesta.error}<//>`
    : respuesta.enviando
      ? h`<${Text} color=${COLOR.cita}>Enviando… la moderación puede tardar unos segundos.<//>`
      : h`<${Text}> <//>`;
  const visibles = lineas.slice(-Math.max(1, alto - 4 - cita.length));
  return h`<${Box} flexDirection="column">
    <${Text} wrap="truncate"><${Text} color=${COLOR.verde} bold>Respuesta en «${asunto}»<//><${Text} color=${COLOR.tenue}>${respuesta.sage ? '  · sage (no sube la publicación)' : ''}<//><//>
    ${cita.map((l, i) => h`<${Linea} key=${`c${i}`} segs=${l.segs} />`)}
    <${Text} color=${COLOR.tenue}>${'─'.repeat(ancho)}<//>
    ${visibles.map((l, i) => h`<${Text} key=${i} color=${/^>/.test(l) ? COLOR.greentext : COLOR.texto}>${l || ' '}<//>`)}
    <${Text} color=${COLOR.tenue}>${'─'.repeat(ancho)}<//>
    ${pie}
  <//>`;
}

// Offset that keeps the viewport inside the content.
const acotar = (offset, total, alto) => Math.max(0, Math.min(offset, Math.max(0, total - alto)));

// stores: local state (store.js). Without it, threads show the site's anonymous IDs.
// onSalir: after logging out on the site, forget the session locally; → the stores to use from then on.
export function App({ cliente, inicio = {}, stores: storesIniciales = null, onSalir = null }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const ancho = Math.min(ANCHO_MAX, Math.max(40, columns - 2));

  const [pestana, setPestana] = useState(inicio.pestana ?? 0);
  const [archivo, setArchivo] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hiloId, setHiloId] = useState(inicio.hilo ?? null);
  const [offsetHilo, setOffsetHilo] = useState(0);
  const [ayuda, setAyuda] = useState(false);
  const [recarga, setRecarga] = useState(0);
  // { hiloId, cita, inicial, texto, sage, enviando, error, descartar } while writing a reply.
  const [respuesta, setRespuesta] = useState(null);
  const [aviso, setAviso] = useState(null); // one-off message in the status bar
  // { hiloId, postId }: scroll the thread to that message once it's drawn with it (after replying,
  // or opening a reply from Respuestas).
  const [destino, setDestino] = useState(null);
  // A function (stores(nombre)): wrapped, or React would take it for an initializer / updater.
  const [stores, setStores] = useState(() => storesIniciales);
  const [sesion, setSesion] = useState(cliente.conSesion);
  const [novedades, setNovedades] = useState(null); // unread replies, from the site's header
  const [guardadas, setGuardadas] = useState(null); // Set of saved thread ids (null: not known yet)
  const [menu, setMenu] = useState(null); // index of the marked item while the menu is open
  // A screen from the menu: 'respuestas' | 'guardados' | 'normas'. A thread opens on top of it.
  const [pantalla, setPantalla] = useState(null);
  const [aperturas, setAperturas] = useState(0); // opening a screen again reloads it
  const [selPantalla, setSelPantalla] = useState(0);
  const [offsetPantalla, setOffsetPantalla] = useState(0);
  const [datosPantalla, setDatosPantalla] = useState({}); // by screen: { datos, cargando, error }
  // The search box (b): { texto, foco } while it's open. Its results are the 'buscar' screen, for
  // `consulta`: { texto, pagina }, the last search made.
  const [busqueda, setBusqueda] = useState(null);
  const [consulta, setConsulta] = useState(null);
  const conCaja = busqueda != null && hiloId == null && !ayuda && !respuesta;
  const alto = Math.max(3, rows - CHROME - (conCaja ? ALTO_BUSQUEDA : 0));
  const [cambiosIgnorados, setCambiosIgnorados] = useState(0); // redraws after i / I

  // What's ignored, in the `ignorados` store: "hilo:<id>" (a whole thread), "mensaje:<No.>" (one
  // message) and "usuario:<thread>-<ID>" (everything from one ID in one thread: IDs are per thread).
  const storeIgnorados = stores ? stores('ignorados') : null;
  const ignorados = storeIgnorados && {
    hilo: (id) => storeIgnorados.has(`hilo:${id}`),
    mensaje: (hiloId, p) => storeIgnorados.has(`mensaje:${p.id}`) || (!!p.anon && storeIgnorados.has(`usuario:${hiloId}-${p.anon}`)),
  };
  const alternarIgnorado = (clave, { si, no }) => {
    if (!storeIgnorados) return setAviso('Para ignorar hace falta el estado local.');
    try {
      const ignorar = !storeIgnorados.has(clave);
      if (ignorar) storeIgnorados.set(clave, new Date().toISOString());
      else storeIgnorados.delete(clave);
      setCambiosIgnorados((n) => n + 1);
      setAviso(ignorar ? si : no);
    } catch (err) {
      setAviso(`No se pudo guardar: ${err.message}`);
    }
  };

  // Loaded data, by key. `version` re-renders when something arrives.
  const listados = useRef(new Map());
  const hilos = useRef(new Map());
  // Pinned threads seen in the listings: the thread's own .txt doesn't say it's pinned.
  const fijadas = useRef(new Set());
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
        for (const h of datos.hilos) fijadas.current[h.fijada ? 'add' : 'delete'](h.id);
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
  // Usernames for a loaded thread, once per load (the list and the thread view share them).
  // If the store can't be read or written, the IDs show instead.
  const nombresPorHilo = useMemo(() => new WeakMap(), [stores]);
  const nombresDe = (hilo) => {
    if (!stores || !hilo) return null;
    if (!nombresPorHilo.has(hilo)) {
      let nombres = null;
      try {
        nombres = nombresDelHilo(hilo, stores('usuarios'));
      } catch {}
      nombresPorHilo.set(hilo, nombres);
    }
    return nombresPorHilo.get(hilo);
  };

  const items = entradas.map((entrada) => {
    const estado = hilos.current.get(entrada.id);
    return { entrada, ...estado, nombres: nombresDe(estado?.hilo) };
  });

  const lista = useMemo(
    () => armarLista(items, { ancho, seleccionado: sel, conTablon: board === null, ignorados, guardadas }),
    [items.map((i) => `${i.entrada.id}:${!!i.hilo}:${i.error ?? ''}`).join(), ancho, sel, board, cambiosIgnorados, stores, guardadas],
  );
  const estadoHilo = hiloId != null ? (hilos.current.get(hiloId) ?? {}) : null;
  const nombres = nombresDe(estadoHilo?.hilo);
  const vistaHilo = useMemo(
    () =>
      estadoHilo?.hilo
        ? armarHilo(estadoHilo.hilo, { ancho, nombres, ignorados, fijada: fijadas.current.has(hiloId), guardada: !!guardadas?.has(hiloId) })
        : null,
    [estadoHilo?.hilo, ancho, nombres, cambiosIgnorados, fijadas.current.has(hiloId), stores, !!guardadas?.has(hiloId)],
  );

  // Pages of 10. The exact total is known once the last .txt page is loaded.
  const paginasTxt = datos?.paginas ?? 1;
  const hayMas = desde + POR_PAGINA < (datos?.hilos.length ?? 0) || paginaTxt < paginasTxt;
  const totalPaginas =
    datos && paginaTxt === paginasTxt
      ? `${(paginasTxt - 1) * (POR_LISTADO / POR_PAGINA) + Math.max(1, Math.ceil(datos.hilos.length / POR_PAGINA))}`
      : `~${paginasTxt * (POR_LISTADO / POR_PAGINA)}`;

  // Scroll to `destino` once the thread is drawn with that message. Until then it waits (the thread
  // may still be loading or reloading); leaving the thread drops it.
  useEffect(() => {
    if (!destino || destino.hiloId !== hiloId || !vistaHilo) return;
    const ancla = vistaHilo.anclas.find((a) => a.id === destino.postId);
    if (!ancla) return;
    setDestino(null);
    setOffsetHilo(acotar(ancla.linea, vistaHilo.lineas.length, alto));
  }, [vistaHilo, destino, hiloId]);

  // Logged in: the unread count and what's saved, now and every few minutes. Both come in /guardados.
  useEffect(() => {
    if (!sesion) return;
    let vigente = true;
    const consultar = () =>
      cliente.guardados().then(
        (d) => {
          if (!vigente) return;
          setNovedades(d.novedades);
          setGuardadas(new Set(d.hilos.map((g) => g.hiloId)));
        },
        () => {},
      );
    consultar();
    const t = setInterval(consultar, CONSULTA_MS);
    t.unref?.(); // never what keeps the process alive
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [sesion]);

  // The open screen's data. Respuestas and Guardados are read fresh every time they're opened.
  const recargaPantalla = useRef(0);
  useEffect(() => {
    if (!pantalla) return;
    let vigente = true;
    const fresco = recarga !== recargaPantalla.current;
    recargaPantalla.current = recarga;
    const actual = pantalla;
    setDatosPantalla((d) => ({ ...d, [actual]: { ...d[actual], cargando: true, error: null } }));
    if (actual === 'buscar' && !consulta) return;
    const pedido =
      actual === 'respuestas'
        ? cliente.respuestas()
        : actual === 'guardados'
          ? cliente.guardados()
          : actual === 'buscar'
            ? cliente.buscar(consulta.texto, { pagina: consulta.pagina })
            : cliente.normas({ fresco });
    pedido.then(
      (datos) => {
        if (!vigente) return;
        setDatosPantalla((d) => ({ ...d, [actual]: { datos, cargando: false } }));
        if (actual === 'respuestas') setNovedades(0); // seeing them marks them read on the site
        if (actual === 'guardados') {
          setNovedades(datos.novedades);
          setGuardadas(new Set(datos.hilos.map((g) => g.hiloId)));
        }
      },
      (err) => vigente && setDatosPantalla((d) => ({ ...d, [actual]: { ...d[actual], cargando: false, error: err.message } })),
    );
    return () => {
      vigente = false;
    };
  }, [pantalla, aperturas, recarga]);

  const estadoPantalla = pantalla ? (datosPantalla[pantalla] ?? { cargando: true }) : null;
  const vistaPantalla = useMemo(() => {
    const d = estadoPantalla?.datos;
    if (!d) return null;
    if (pantalla === 'respuestas') return armarRespuestas(d, { ancho, seleccionado: selPantalla });
    if (pantalla === 'guardados') return armarGuardados(d, { ancho, seleccionado: selPantalla });
    if (pantalla === 'buscar') return armarBusqueda(d, { ancho, seleccionado: selPantalla });
    return armarDocumento(d, { ancho });
  }, [pantalla, estadoPantalla?.datos, ancho, selPantalla]);

  const enHilo = hiloId != null;
  const enPantalla = !enHilo && pantalla != null;
  const contenido = ayuda ? null : enHilo ? vistaHilo : enPantalla ? vistaPantalla : lista;
  const total = contenido?.lineas.length ?? 0;
  const off = acotar(enHilo ? offsetHilo : enPantalla ? offsetPantalla : offset, total, alto);

  const irA = (nuevo) => {
    const o = acotar(nuevo, total, alto);
    if (enHilo) return setOffsetHilo(o);
    // The marked entry follows the scroll: the last one whose title is at or above the top.
    const i = Math.max(0, (contenido?.anclas ?? []).findLastIndex((a) => a.linea <= o));
    if (enPantalla) {
      setOffsetPantalla(o);
      return setSelPantalla(i);
    }
    setOffset(o);
    setSel(i);
  };
  const saltar = (dir) => {
    const anclas = contenido?.anclas ?? [];
    if (!anclas.length) return;
    if (enHilo) {
      const actual = anclas.findLastIndex((a) => a.linea <= off);
      const destino = anclas[Math.max(0, Math.min(anclas.length - 1, actual + dir))];
      return setOffsetHilo(acotar(destino.linea, total, alto));
    }
    const nuevo = Math.max(0, Math.min(anclas.length - 1, (enPantalla ? selPantalla : sel) + dir));
    if (enPantalla) {
      setSelPantalla(nuevo);
      return setOffsetPantalla(acotar(anclas[nuevo].linea, total, alto));
    }
    setSel(nuevo);
    setOffset(acotar(anclas[nuevo].linea, total, alto));
  };

  // A thread, optionally at one of its messages. If the copy we have doesn't have it yet, reload.
  const abrirHilo = (id, postId = null) => {
    setHiloId(id);
    setOffsetHilo(0);
    setDestino(postId != null ? { hiloId: id, postId } : null);
    const cacheado = hilos.current.get(id)?.hilo;
    if (postId != null && cacheado && !cacheado.posts.some((p) => p.id === postId)) {
      cliente.hilo(id, { fresco: true }).then(
        (hilo) => (hilos.current.set(id, { hilo }), avisar()),
        () => {},
      );
    }
  };
  const cerrarHilo = () => {
    setHiloId(null);
    setOffsetHilo(0);
    setDestino(null);
  };
  const abrirPantalla = (id) => {
    if (id !== 'buscar') {
      setBusqueda(null);
      setConsulta(null);
    }
    setPantalla(id);
    setAperturas((n) => n + 1);
    setSelPantalla(0);
    setOffsetPantalla(0);
    setAyuda(false);
    cerrarHilo();
  };

  // Search. Closing it (b, or Esc in the results) goes back to the home page.
  const cerrarBusqueda = () => {
    setBusqueda(null);
    setConsulta(null);
    if (pantalla === 'buscar') setPantalla(null);
    cambiarPestana(0);
  };
  const buscar = (texto, pagina = 1) => {
    setConsulta({ texto, pagina });
    setBusqueda({ texto, foco: false });
    setDatosPantalla((d) => ({ ...d, buscar: undefined }));
    abrirPantalla('buscar');
  };
  const editarBusqueda = (input, key) => {
    const { texto } = busqueda;
    const editar = (t) => setBusqueda({ texto: t.slice(0, MAX_BUSQUEDA), foco: true });
    // Esc: with results, back to them (as they were); without, closes the box.
    if (key.escape) return consulta ? setBusqueda({ texto: consulta.texto, foco: false }) : cerrarBusqueda();
    if (key.return) return texto.trim() && buscar(texto.trim());
    if (key.backspace || key.delete) return editar(Array.from(texto).slice(0, -1).join(''));
    if (key.ctrl && input === 'u') return editar('');
    if (input && !key.ctrl && !key.meta && !key.tab) editar(texto + input.replace(/[\r\n]+/g, ' '));
  };

  // s: save the thread or take it out of Guardados (the site's "Guardar" button).
  const alternarGuardada = (id) => {
    if (!sesion) return setAviso('Para guardar hay que entrar: salí (q) y corré txt login');
    if (!guardadas) return setAviso('Todavía no sé qué tenés guardado: probá en un momento.');
    const guardar = !guardadas.has(id);
    setAviso(guardar ? 'Guardando…' : 'Sacando de Guardados…');
    cliente.guardar(id, guardar).then(
      () => {
        setGuardadas((g) => {
          const n = new Set(g);
          n[guardar ? 'add' : 'delete'](id);
          return n;
        });
        setAviso(guardar ? 'Guardada · s para sacarla de Guardados' : 'Sacada de Guardados.');
        if (pantalla === 'guardados') setAperturas((n) => n + 1);
      },
      (err) => setAviso(`No se pudo ${guardar ? 'guardar' : 'sacar de Guardados'}: ${err.message}`),
    );
  };

  // Salir: closes the session on the site, then forgets it here; the app goes on logged out.
  const salir = () => {
    setAviso('Saliendo…');
    cliente.salir().then(
      () => {
        setSesion(false);
        setNovedades(null);
        setGuardadas(null);
        if (pantalla === 'respuestas' || pantalla === 'guardados') setPantalla(null);
        try {
          const nuevos = onSalir?.();
          if (nuevos) setStores(() => nuevos);
        } catch {}
        setAviso('Saliste. Para volver a entrar: txt login');
      },
      (err) => setAviso(`No se pudo salir: ${err.message}`),
    );
  };

  const itemsMenu = sesion ? MENU_CON_SESION : MENU_SIN_SESION;
  const elegir = (item) => {
    setMenu(null);
    if (item.id === 'salir') return salir();
    if (item.id === 'entrar') return setAviso('Para entrar: salí (q) y corré txt login');
    abrirPantalla(item.id);
  };
  const usarMenu = (input, key) => {
    if (key.escape || input === 'm') return setMenu(null);
    if (key.upArrow || input === 'k') return setMenu((i) => (i - 1 + itemsMenu.length) % itemsMenu.length);
    if (key.downArrow || input === 'j' || key.tab) return setMenu((i) => (i + 1) % itemsMenu.length);
    if (key.return) return elegir(itemsMenu[menu]);
    const item = itemsMenu.find((it) => it.tecla === input);
    if (item) elegir(item);
  };
  // The message at the top of the screen in a thread: the one `c` quotes.
  const mensajeArriba = () => {
    const anclas = vistaHilo?.anclas ?? [];
    return anclas[Math.max(0, anclas.findLastIndex((a) => a.linea <= off))]?.id ?? null;
  };
  // i inside a thread: the message at the top (the OP stands for the whole thread, like i in the list).
  // I: everything its author wrote in this thread.
  const ignorarEnHilo = (todoElAutor) => {
    const hilo = estadoHilo?.hilo;
    const id = mensajeArriba();
    const post = hilo?.posts.find((p) => p.id === id);
    if (!post) return;
    const quien = nombres?.get(post.anon) ?? `ID ${post.anon}`;
    if (todoElAutor) {
      if (!post.anon) return setAviso('Ese mensaje no tiene autor para ignorar.');
      return alternarIgnorado(`usuario:${hilo.id}-${post.anon}`, {
        si: `Ignorando los mensajes de ${quien} en esta publicación · I para dejar de ignorarlos`,
        no: `Ya no se ignoran los mensajes de ${quien}.`,
      });
    }
    if (post === hilo.posts[0]) {
      return alternarIgnorado(`hilo:${hilo.id}`, { si: 'Publicación ignorada · i para dejar de ignorarla', no: 'Publicación sin ignorar.' });
    }
    if (post.anon && storeIgnorados?.has(`usuario:${hilo.id}-${post.anon}`) && !storeIgnorados.has(`mensaje:${post.id}`)) {
      return setAviso(`No.${post.id} está ignorado porque ignorás a ${quien}: I para dejar de ignorarlo.`);
    }
    alternarIgnorado(`mensaje:${post.id}`, { si: `No.${post.id} ignorado · i para dejar de ignorarlo`, no: `No.${post.id} sin ignorar.` });
  };

  const empezarRespuesta = (citar) => {
    const hilo = estadoHilo?.hilo;
    if (!hilo) return;
    if (!sesion) return setAviso('Para responder hay que entrar: salí (q) y corré txt login');
    if (hilo.archivado || hilo.cerrado) return setAviso('Esta publicación ya no acepta respuestas.');
    const cita = citar ? mensajeArriba() : null;
    const inicial = cita ? `>>${cita}\n` : '';
    setRespuesta({ hiloId, cita, inicial, texto: inicial, sage: false, enviando: false, error: null, descartar: false });
  };
  const enviarRespuesta = () => {
    const r = respuesta;
    if (!r.texto.trim() || r.texto === r.inicial) return setRespuesta({ ...r, error: 'El mensaje está vacío.' });
    if (r.texto.length > MAX_CUERPO) return setRespuesta({ ...r, error: `El mensaje puede tener hasta ${MAX_CUERPO} caracteres.` });
    setRespuesta({ ...r, enviando: true, error: null, descartar: false });
    cliente.responder(r.hiloId, r.texto, { sage: r.sage }).then(
      ({ postId, enCola }) => {
        setRespuesta(null);
        setAviso(enCola ? 'Respuesta enviada: quedó en revisión y va a aparecer cuando la aprueben.' : 'Respuesta publicada.');
        if (!enCola && postId != null) setDestino({ hiloId: r.hiloId, postId });
        cliente.hilo(r.hiloId, { fresco: true }).then(
          (hilo) => (hilos.current.set(r.hiloId, { hilo }), avisar()),
          () => {},
        );
      },
      (err) => setRespuesta((x) => x && { ...x, enviando: false, error: err.message }),
    );
  };
  const editarRespuesta = (input, key) => {
    const r = respuesta;
    if (r.enviando) return;
    const editar = (texto) => setRespuesta({ ...r, texto, error: null, descartar: false });
    if (key.escape) {
      if (r.texto !== r.inicial && !r.descartar) return setRespuesta({ ...r, descartar: true });
      return setRespuesta(null);
    }
    if (key.ctrl && (input === 'd' || input === 's')) return enviarRespuesta();
    if (key.tab) return setRespuesta({ ...r, sage: !r.sage, descartar: false });
    if (key.return) return editar(`${r.texto}\n`);
    if (key.backspace || key.delete) return editar(Array.from(r.texto).slice(0, -1).join(''));
    if (input && !key.ctrl && !key.meta) editar(r.texto + input.replace(/\r\n?/g, '\n'));
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
    if (respuesta) return editarRespuesta(input, key);
    if (aviso) setAviso(null);
    if (busqueda?.foco && !enHilo) return editarBusqueda(input, key);
    if (menu != null) return usarMenu(input, key);
    if (input === 'm') return setMenu(0);
    if (input === 'b' && !enHilo && !ayuda) {
      if (busqueda) return cerrarBusqueda();
      if (pantalla) setPantalla(null);
      return setBusqueda({ texto: '', foco: true });
    }
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
      if (input === 'c' || input === 'C') return empezarRespuesta(input === 'c');
      if (input === 'i' || input === 'I') return ignorarEnHilo(input === 'I');
      if (input === 's') return alternarGuardada(hiloId);
      if (key.escape || key.backspace || key.delete || key.leftArrow || input === 'q') cerrarHilo();
      return;
    }

    if (enPantalla && pantalla === 'buscar') {
      const d = estadoPantalla?.datos;
      if (input === '/') return setBusqueda((b) => ({ ...b, foco: true }));
      if ((input === ']' || input === 'n') && d && d.pagina < d.paginas) return buscar(consulta.texto, d.pagina + 1);
      if ((input === '[' || input === 'p') && d && d.pagina > 1) return buscar(consulta.texto, d.pagina - 1);
      if (key.escape || key.backspace || key.delete || key.leftArrow || input === 'q') return cerrarBusqueda();
    }
    if (enPantalla) {
      const ancla = vistaPantalla?.anclas[selPantalla];
      if (key.return && ancla) return abrirHilo(ancla.hilo, ancla.post ?? null);
      if (input === 's' && pantalla === 'guardados' && ancla) return alternarGuardada(ancla.hilo);
      if (key.escape || key.backspace || key.delete || key.leftArrow || input === 'q') return setPantalla(null);
      // A section's number goes to that section.
      if (/^[1-6]$/.test(input)) {
        setPantalla(null);
        setBusqueda(null);
        setConsulta(null);
        cambiarPestana(Number(input) - 1);
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
    if (input === 'i' && entradas[sel]) {
      const { id, asunto } = entradas[sel];
      return alternarIgnorado(`hilo:${id}`, { si: `Ignorada: «${asunto}» · i para dejar de ignorarla`, no: `Sin ignorar: «${asunto}»` });
    }
    if (key.return && entradas[sel]) abrirHilo(entradas[sel].id);
  });

  // --- Drawing -------------------------------------------------------------------------------
  let cuerpo;
  let estado;
  if (respuesta) {
    const hilo = estadoHilo?.hilo;
    const post = respuesta.cita != null ? hilo?.posts.find((p) => p.id === respuesta.cita) : null;
    const citado = post && { post: { ...post, nombre: nombres?.get(post.anon) }, esOp: post === hilo.posts[0] };
    cuerpo = h`<${Redactor} respuesta=${respuesta} asunto=${hilo?.asunto ?? ''} citado=${citado} ancho=${ancho} alto=${alto} />`;
    estado = respuesta.enviando
      ? 'Enviando…'
      : respuesta.descartar
        ? 'Esc de nuevo para descartar la respuesta · cualquier otra tecla para seguir'
        : `Ctrl+D enviar · Enter nueva línea · Tab sage · Esc descartar  ·  ${respuesta.texto.length}/${MAX_CUERPO}`;
  } else if (ayuda) {
    cuerpo = h`<${Box} flexDirection="column" paddingLeft=${1}>
      <${Text} color=${COLOR.verde} bold>Teclas<//>
      <${Text}> <//>
      ${AYUDA.map(([k, d], i) => h`<${Text} key=${i}><${Text} color=${COLOR.cita}>${k.padEnd(22)}<//><${Text} color=${COLOR.texto}>${d}<//><//>`)}
    <//>`;
    estado = '? o Esc para volver';
  } else if (enHilo) {
    if (estadoHilo.error) cuerpo = h`<${Text} color=${COLOR.error}>  No se pudo cargar la publicación: ${estadoHilo.error}<//>`;
    else if (!vistaHilo) cuerpo = h`<${Text} color=${COLOR.tenue}>  cargando…<//>`;
    const mensaje = mensajeArriba();
    const guardada = guardadas?.has(hiloId) ? '★ guardada  ·  ' : '';
    estado = `${guardada}${cliente.baseUrl}/h/${hiloId}  ·  ↑↓ mover · j/k mensaje${mensaje ? ` · c responder a No.${mensaje} · i/I ignorar` : ''}${sesion ? ` · s ${guardada ? 'sacar' : 'guardar'}` : ''} · Esc volver · m menú`;
  } else if (enPantalla) {
    const nombre = { respuestas: 'Respuestas', guardados: 'Guardados', normas: 'Normas', buscar: 'Buscar' }[pantalla];
    if (estadoPantalla.error && !estadoPantalla.datos) cuerpo = h`<${Text} color=${COLOR.error}>  No se pudo cargar ${nombre}: ${estadoPantalla.error} (r para reintentar)<//>`;
    else if (!vistaPantalla) cuerpo = h`<${Text} color=${COLOR.tenue}>  cargando…<//>`;
    estado =
      pantalla === 'normas'
        ? `${nombre}  ·  ↑↓ desplazarse · Esc volver · m menú`
        : pantalla === 'buscar'
          ? `${nombre}  ·  j/k mover · Enter abrir · ][ página · / cambiar · b cerrar · m menú`
          : `${nombre}  ·  j/k mover · Enter abrir${pantalla === 'guardados' ? ' · s sacar' : ''} · r recargar · Esc volver · m menú`;
  } else {
    if (estadoListado.error && !datos) cuerpo = h`<${Text} color=${COLOR.error}>  No se pudo cargar: ${estadoListado.error} (r para reintentar)<//>`;
    else if (!datos) cuerpo = h`<${Text} color=${COLOR.tenue}>  cargando…<//>`;
    estado = `Página ${pagina + 1} de ${totalPaginas}  ·  ←→ sección · j/k publicación · Enter abrir · i ignorar · ][ página${board ? ' · a archivo' : ''} · m menú · ? ayuda`;
  }
  if (conCaja && busqueda.foco) estado = `Enter buscar · Esc ${consulta ? 'volver a los resultados' : 'cerrar'} · Ctrl+U borrar`;
  if (menu != null) estado = '↑↓ elegir · Enter abrir · la letra de cada opción · Esc cerrar';
  if (aviso) estado = aviso;
  if (!cuerpo && contenido) {
    cuerpo = contenido.lineas.slice(off, off + alto).map((l, i) => h`<${Linea} key=${off + i} segs=${l.segs} />`);
  }

  const pestanaHilo = enHilo && estadoHilo?.hilo ? PESTANAS.findIndex((p) => p.slug === estadoHilo.hilo.board) : enPantalla ? -1 : pestana;
  const posicion = !respuesta && total > alto ? `${Math.round((off / Math.max(1, total - alto)) * 100)}%` : '';
  return h`<${Box} flexDirection="column" width=${columns} height=${rows}>
    <${Cabecera} columnas=${columns} pestana=${pestanaHilo} archivo=${!enHilo && !enPantalla && archivo} derecha=${posicion} menuAbierto=${menu != null} novedades=${novedades} />
    ${conCaja ? h`<${Box} paddingLeft=${1}><${CajaBusqueda} busqueda=${busqueda} ancho=${ancho} /><//>` : ''}
    <${Box} flexDirection="column" height=${alto} paddingLeft=${1} overflow="hidden">${cuerpo}<//>
    <${Text} wrap="truncate" color=${aviso ? COLOR.cita : COLOR.tenue}>${estado}<//>
    ${menu != null ? h`<${Menu} items=${itemsMenu} sel=${menu} novedades=${novedades} columnas=${columns} />` : ''}
  <//>`;
}
