#!/usr/bin/env bash
# Instala lo necesario y abre txt-cli.
#
#   curl -fsSL https://raw.githubusercontent.com/txt-cli/421-txt-cli/main/txt-cli.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/txt-cli/421-txt-cli/main/txt-cli.sh | bash -s -- cultura
#   ./txt-cli.sh [sección | número de publicación]      desde una copia del repositorio
#
# 1. Por curl, baja el ZIP del repositorio y lo descomprime en TXT_CLI_DIR (no hace falta git).
# 2. Si no está nvm, lo instala (https://github.com/nvm-sh/nvm).
# 3. Con nvm, instala y usa la versión de Node de .nvmrc.
# 4. Instala las dependencias si faltan o cambiaron y abre la aplicación.
#
# Variables: TXT_CLI_DIR (por defecto ~/.txt-cli), TXT_CLI_REF (rama, por defecto main),
# TXT_CLI_ZIP (dirección del ZIP), TXT_CLI_SIN_ACTUALIZAR=1 (no bajar de nuevo), NVM_DIR, TXT_URL.
set -euo pipefail

TXT_CLI_REF="${TXT_CLI_REF:-main}"
TXT_CLI_ZIP="${TXT_CLI_ZIP:-https://github.com/txt-cli/421-txt-cli/archive/refs/heads/$TXT_CLI_REF.zip}"
NVM_VERSION="v0.40.8"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

info() { printf '\033[32m[txt-cli]\033[0m %s\n' "$*" >&2; }
fallar() {
  printf '\033[31m[txt-cli]\033[0m %s\n' "$*" >&2
  exit 1
}
requiere() { command -v "$1" >/dev/null 2>&1 || fallar "Hace falta '$1' y no está instalado."; }

requiere curl

# unzip no viene en todas partes (imágenes mínimas de Linux): si falta, el zipfile de Python.
descomprimir() {
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$1" -d "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e "$1" "$2"
  else
    fallar "Para descomprimir hace falta 'unzip' o 'python3'."
  fi
}

# Baja el ZIP y reemplaza la copia instalada. node_modules pasa a la versión nueva (si las
# dependencias cambiaron se reinstalan más abajo). Si no hay red, sigue con la que ya está.
descargar() {
  local destino="$1" tmp origen
  tmp="$(mktemp -d)"
  # El trap cubre las salidas con error; al terminar bien se borra acá (exec no dispara EXIT).
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  info "Bajando $TXT_CLI_ZIP"
  if ! curl -fsSL -o "$tmp/txt-cli.zip" "$TXT_CLI_ZIP"; then
    [[ -f "$destino/bin/txt.js" ]] || fallar "No se pudo bajar txt-cli."
    info "No se pudo bajar la versión nueva; sigo con la que ya está."
    rm -rf "$tmp"
    trap - EXIT
    return
  fi
  mkdir "$tmp/zip"
  descomprimir "$tmp/txt-cli.zip" "$tmp/zip"
  # GitHub mete todo en una carpeta <repo>-<rama>/.
  origen="$(find "$tmp/zip" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "$origen" && -f "$origen/bin/txt.js" ]] || fallar "El ZIP no trae txt-cli."
  if [[ -e "$destino" ]]; then
    # Se borra solo una copia de txt-cli: TXT_CLI_DIR podría apuntar a otra carpeta por error.
    [[ -f "$destino/bin/txt.js" ]] || fallar "$destino ya existe y no es txt-cli; elegí otra carpeta con TXT_CLI_DIR."
    [[ -d "$destino/node_modules" ]] && mv "$destino/node_modules" "$origen/"
    rm -rf "$destino"
  fi
  mkdir -p "$(dirname "$destino")"
  mv "$origen" "$destino"
  rm -rf "$tmp"
  trap - EXIT
}

# --- Dónde está la aplicación ------------------------------------------------------------------
# Con ./txt-cli.sh desde el repositorio, esa carpeta. Por curl no hay carpeta: se baja a TXT_CLI_DIR.
aqui=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [[ -n "$aqui" && -f "$aqui/package.json" && -f "$aqui/bin/txt.js" ]]; then
  proyecto="$aqui"
  npm_extra=() # copia de desarrollo: con las dependencias de los tests
else
  proyecto="${TXT_CLI_DIR:-$HOME/.txt-cli}"
  npm_extra=(--omit=dev)
  if [[ "${TXT_CLI_SIN_ACTUALIZAR:-}" != 1 || ! -f "$proyecto/bin/txt.js" ]]; then
    descargar "$proyecto"
  fi
fi
cd "$proyecto"

# --- nvm -----------------------------------------------------------------------------------------
# nvm es una función de shell: en un script no alcanza con `command -v nvm`, hay que cargar nvm.sh.
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  info "nvm no está instalado: instalando nvm $NVM_VERSION"
  # PROFILE=/dev/null: no se tocan ~/.bashrc ni ~/.zshrc. Este script carga nvm solo.
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | PROFILE=/dev/null bash >&2
  [[ -s "$NVM_DIR/nvm.sh" ]] || fallar "La instalación de nvm no dejó $NVM_DIR/nvm.sh."
fi
# nvm.sh no funciona con `set -u`. --no-use: sin eso, recién instalado (sin versión "default")
# devuelve 3 y `set -e` corta el script. La versión se elige abajo.
set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh" --no-use

# --- Node ----------------------------------------------------------------------------------------
version="$(tr -d '[:space:]' < .nvmrc)"
if ! nvm use --silent "$version" >/dev/null 2>&1; then
  info "Instalando Node $version con nvm"
  nvm install "$version" >&2
  nvm use --silent "$version" >/dev/null
fi
set -u
info "Node $(node --version)"

# --- Dependencias --------------------------------------------------------------------------------
# npm ci solo la primera vez o si cambió package-lock.json. Se compara el contenido (no la fecha:
# el ZIP trae las fechas del commit) con la copia que se guarda al instalar.
marca=node_modules/.txt-cli-package-lock.json
if ! cmp -s package-lock.json "$marca"; then
  info "Instalando dependencias"
  # ${a[@]+...}: con bash 3.2 (macOS), un arreglo vacío con `set -u` da error.
  npm ci ${npm_extra[@]+"${npm_extra[@]}"} --no-audit --no-fund --loglevel=error >&2
  cp package-lock.json "$marca"
fi

# --- Abrir ---------------------------------------------------------------------------------------
# Por `curl | bash` la entrada estándar es el script, no el teclado: la aplicación lee de la terminal.
if [[ -t 0 ]]; then
  exec node bin/txt.js "$@"
elif [[ -r /dev/tty ]]; then
  exec node bin/txt.js "$@" < /dev/tty
else
  fallar "txt-cli necesita una terminal interactiva."
fi
