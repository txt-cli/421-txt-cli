// Ignore filters: one regular expression per line, matched against a post's title and summary,
// without caring about case or accents ("politica" finds "Política"). The ñ stays an ñ.

// Takes the accents off (keeping the tilde of ñ) so that pattern and text compare the same way.
export const sinAcentos = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/(?![̃])[̀-ͯ]/g, '')
    .normalize('NFC');

// lineas (the textarea's) → { reglas: [{ fuente, re }], errores: Map of line index → message }.
// Blank lines don't count; a line that isn't a valid regex is skipped and reported.
export function compilarFiltros(lineas) {
  const reglas = [];
  const errores = new Map();
  lineas.forEach((linea, i) => {
    const fuente = linea.trim();
    if (!fuente) return;
    try {
      reglas.push({ fuente, re: new RegExp(sinAcentos(fuente), 'i') });
    } catch (err) {
      errores.set(i, err.message.replace(/^Invalid regular expression: (\/.*\/\w*: )?/, ''));
    }
  });
  return { reglas, errores };
}

// The first rule that matches any of the texts (its source), or null.
export function coincide(reglas, ...textos) {
  if (!reglas.length) return null;
  const limpios = textos.filter(Boolean).map(sinAcentos);
  return reglas.find((r) => limpios.some((t) => r.re.test(t)))?.fuente ?? null;
}
