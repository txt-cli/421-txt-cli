# txt-cli

Cliente de terminal para [txt.421.news](https://txt.421.news), hecho con Node e [Ink](https://github.com/vadimdemedes/ink). Muestra la **vista de lista** del sitio (cada publicación con su mensaje inicial, las respuestas omitidas y las últimas tres), permite cambiar de sección y abrir publicaciones completas.

Solo lee. Para publicar o responder, entrá desde la web.

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

## Tests

```sh
npm test
```

Usan páginas reales guardadas en `test/fixtures/`; no hace falta red.
