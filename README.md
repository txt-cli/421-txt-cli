# txt-cli

Cliente de terminal para [txt.421.news](https://txt.421.news), hecho con Node e [Ink](https://github.com/vadimdemedes/ink). Muestra la **vista de lista** del sitio (cada publicación con su mensaje inicial, las respuestas omitidas y las últimas tres), permite cambiar de sección y abrir publicaciones completas.

Para responder hay que entrar con `txt login` (ver [Sesión](#sesión-prototipo)). Para abrir publicaciones nuevas, entrá desde la web.

## Probarlo

```sh
curl -fsSL https://raw.githubusercontent.com/txt-cli/421-txt-cli/main/txt-cli.sh | bash
```

Con argumentos (una sección o una publicación):

```sh
curl -fsSL https://raw.githubusercontent.com/txt-cli/421-txt-cli/main/txt-cli.sh | bash -s -- cultura
```

El script [`txt-cli.sh`](txt-cli.sh):

1. Baja el ZIP del repositorio y lo descomprime en `~/.txt-cli` (no hace falta `git`; usa `unzip` o, si no está, Python).
2. Si no está [nvm](https://github.com/nvm-sh/nvm), lo instala sin tocar `~/.bashrc` ni `~/.zshrc`.
3. Con nvm, instala y usa la versión de Node de [`.nvmrc`](.nvmrc).
4. Instala las dependencias (solo la primera vez o si cambiaron) y abre la aplicación.

Cada vez que se corre baja la última versión; si no hay red, abre la que ya está instalada. Solo necesita `bash` y `curl`.

| Variable | Para qué |
|---|---|
| `TXT_CLI_DIR` | Dónde instalarlo (por defecto `~/.txt-cli`) |
| `TXT_CLI_REF` | Rama a bajar (por defecto `main`) |
| `TXT_CLI_SIN_ACTUALIZAR=1` | Abrir la copia instalada sin bajar de nuevo |
| `NVM_DIR` | Dónde está (o se instala) nvm (por defecto `~/.nvm`) |
| `TXT_URL` | Otra instancia de txt (por defecto `https://txt.421.news`) |

Para desinstalarlo: `rm -rf ~/.txt-cli` (y `~/.nvm` si nvm lo instaló el script).

## Desde una copia del repositorio

```sh
./txt-cli.sh            # lo mismo que arriba, usando esta carpeta (con las dependencias de los tests)
```

O a mano, con Node 22 o más nuevo:

```sh
npm install
npm start               # portada
node bin/txt.js cultura # una sección
node bin/txt.js 588     # una publicación
npm link                # instala el comando `txt`
```

`--url` (o `TXT_URL`) apunta a otra instancia de txt.

## Sesión (prototipo)

```sh
txt login        # abre el navegador para entrar con Google y te pide la cookie de sesión
txt login <sid>  # usa directamente el valor de la cookie sid
txt logout       # la borra
```

El login con Google del sitio vuelve siempre a `/auth/google/callback` y el intercambio del código lo hace el servidor, así que la terminal no puede completarlo sola: entrás en el navegador y pegás el encabezado `Cookie` de un pedido (o "Copiar como cURL", o solo el valor de `sid`) desde la pestaña Red de las herramientas de desarrollo. De lo pegado se queda solo con `sid`, y antes de guardarla comprueba que el sitio la reconozca (pide `/cuenta`, que sin sesión redirige a `/entrar`). Se guarda en `~/.config/txt-cli/sesiones.json` (permisos `600`), separada por sitio, y se manda solo a ese sitio.

### Responder

Dentro de una publicación, `c` abre una respuesta que empieza citando (`>>número`) el mensaje que está arriba de la pantalla, y `C` una sin cita. Al citar, el mensaje original se muestra arriba del texto (hasta un tercio de la pantalla). El texto se escribe al final (sin mover el cursor): `Enter` agrega una línea, `Tab` activa o desactiva sage, `Ctrl+D` envía y `Esc` descarta (pide confirmación si escribiste algo). La respuesta pasa por la moderación del sitio, que puede tardar unos segundos: si la publica, la publicación se recarga y queda a la vista; si la deja en revisión, o la rechaza, lo dice abajo.

El token del formulario (CSRF) sale de `/cuenta` y se pide una sola vez por sesión.

## Teclas

| Tecla | Qué hace |
|---|---|
| `←` `→` · `h` `l` · `Tab` | Sección anterior / siguiente |
| `1` … `6` | Ir a una sección (1 = portada) |
| `↑` `↓` | Desplazarse una línea |
| `PgUp` `PgDn` · `Espacio` | Desplazarse una pantalla |
| `Inicio` `Fin` · `g` `G` | Arriba / abajo de todo |
| `j` `k` | Publicación (o mensaje) siguiente / anterior |
| `Enter` | Abrir la publicación marcada con ▶ |
| `c` · `C` | En una publicación: responder citando el mensaje de arriba de la pantalla · sin citar |
| `b` | Buscar: abre la caja de búsqueda debajo de las secciones; en los resultados, la cierra y vuelve a la portada |
| `/` | En los resultados: cambiar lo buscado |
| `m` | Menú: Respuestas, Guardados, Normas y Salir (sin sesión: Normas y Entrar) |
| `s` | En una publicación (o en Guardados): guardarla o sacarla de Guardados |
| `i` | Ignorar (o dejar de ignorar) la publicación marcada; adentro de una publicación, el mensaje de arriba |
| `I` | En una publicación: ignorar todos los mensajes del autor del mensaje de arriba |
| `]` `[` · `n` `p` | Página siguiente / anterior |
| `a` | Archivo de la sección |
| `r` | Recargar |
| `Esc` `Backspace` `q` | Volver a la lista (en la lista, `q` sale) |
| `?` | Ayuda |

## Cómo funciona

Lee la versión en texto plano del sitio: `index.txt` y `/b/<sección>.txt` para los listados (60 publicaciones por página) y `/h/<id>.txt` para cada publicación. Con eso arma la vista de lista igual que la web: 10 publicaciones por página, cada una con su mensaje inicial y las últimas 3 respuestas publicadas.

El servidor corta el texto plano a 78 columnas. `src/parse.js` deshace esos cortes con la misma regla que usó el servidor (un salto es del servidor solo si la palabra siguiente no entraba en la línea) y el texto se vuelve a acomodar al ancho de tu terminal.

Límites de la versión de texto: los spoilers no se pueden ver (el sitio los reemplaza por `[spoiler]`) y no hay marcas de "nuevo".

Las respuestas se guardan un minuto en memoria, se piden de a 4 como mucho, y el User-Agent incluye `bot` para no sumar visitas en las estadísticas del sitio.

Las publicaciones fijadas van con la etiqueta `FIJADA` junto al título y el mensaje inicial con borde ámbar. La versión texto de una publicación no dice si está fijada: adentro se resalta si ya apareció fijada en una lista.

## Buscar

`b` abre una caja de búsqueda debajo de las secciones, arriba de las publicaciones. Lo que se escribe va a la caja (también letras que en otro momento son teclas, como `b`, `m` o `q`); `Enter` busca con el buscador del sitio (`/buscar`) y los resultados aparecen debajo: un mensaje por resultado, con lo encontrado resaltado y el archivo incluido, de a 20 (`]` `[` cambian de página). `Enter` abre la publicación en ese mensaje y `Esc` vuelve a los resultados. `/` vuelve a la caja para cambiar lo buscado (`Esc` ahí deja los resultados como estaban). `b`, o `Esc` en los resultados, cierra la búsqueda y vuelve a la portada; sin resultados todavía, `Esc` en la caja la cierra.

La búsqueda no tiene versión texto: se lee del HTML del sitio y no necesita sesión.

## Menú

`m` abre el menú, a la derecha de la fila de secciones (el botón `≡ MENÚ`, con la cantidad de respuestas sin leer al lado). Se elige con `↑` `↓` y `Enter` o con la letra de cada opción; `Esc` lo cierra.

- **Respuestas**: los avisos de la web (te respondieron, comentaron en tu publicación o en una que guardaste), con las nuevas marcadas `NUEVA`, y las publicaciones donde participaste. `Enter` abre la publicación en ese mensaje; `Esc` vuelve. Igual que en la web, abrirla las marca como leídas.
- **Guardados**: las publicaciones que guardaste. `s` saca la marcada; adentro de cualquier publicación, `s` la guarda o la saca (la barra de abajo dice `★ guardada`).
- **Normas**: las del sitio (`/normas.txt`).
- **Salir**: cierra la sesión en el sitio y la olvida acá; la aplicación sigue sin sesión. Si el sitio no responde, la sesión queda como estaba.

Respuestas y Guardados no tienen versión texto: se leen del HTML del sitio (`src/html.js`). Con sesión, el contador de no leídas (y qué está guardado) se consulta al abrir y cada 2 minutos, pidiendo `/guardados`. "Mi cuenta" y "Formato" quedan en la web.

## Estado local

`src/store.js` guarda estado local por sesión en `~/.local/state/txt-cli/<md5 del sid>/` (o `$XDG_STATE_HOME/txt-cli/…`; sin sesión, en `anonimo/`). Cada función usa un store por nombre: un archivo `<nombre>.json` con pares clave → valor (`get`, `set`, `setMany`, `delete`, `has`, `keys`).

**Nombres en vez de IDs.** Los IDs anónimos del sitio cambian en cada publicación. Al abrir una, cada ID se muestra con un nombre de usuario inventado con [Faker](https://fakerjs.dev) (`faker.internet.username()`, con nombres en español), así es más fácil seguir quién responde a quién. Se guardan en el store `usuarios` como `<publicación>-<ID>` → nombre, así que son siempre los mismos; dentro de una publicación no se repiten. Se ven en la vista de lista y en la publicación abierta (mientras una publicación carga, la lista muestra el extracto sin nombre).

**Ignorar.** Lo ignorado se ve solo como su cabecera, con el borde gris. `i` en la lista ignora la publicación marcada (queda el título y la cabecera del mensaje inicial, sin respuestas); adentro de una publicación ignora el mensaje de arriba de la pantalla (en el mensaje inicial, la publicación entera, igual que desde la lista). `I` ignora todo lo que escribió el autor de ese mensaje en esa publicación: los IDs son por publicación, así que no alcanza a otras. Las mismas teclas lo deshacen. Se guarda en el store `ignorados` como `hilo:<id>`, `mensaje:<número>` y `usuario:<publicación>-<ID>`.

## Tests

```sh
npm test
```

Usan páginas reales guardadas en `test/fixtures/`; no hace falta red. Las páginas HTML (Respuestas, Guardados y Buscar) se generan con las vistas del propio sitio: con su repositorio al lado de este, `node scripts/fixtures-html.mjs` (o `TXT_SERVIDOR=<ruta>`).
