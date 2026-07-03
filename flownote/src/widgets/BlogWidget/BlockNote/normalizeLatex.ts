const COMPATIBILITY_SYMBOLS: Record<string, string> = {
  "℃": "{}^\\circ\\mathrm{C}",
  "℉": "{}^\\circ\\mathrm{F}",
  "㎍": "\\mathrm{\\mu g}",
  "㎎": "\\mathrm{mg}",
  "㎏": "\\mathrm{kg}",
  "㎐": "\\mathrm{Hz}",
  "㎑": "\\mathrm{kHz}",
  "㎒": "\\mathrm{MHz}",
  "㎓": "\\mathrm{GHz}",
  "㎕": "\\mathrm{\\mu l}",
  "㎖": "\\mathrm{ml}",
  "㎗": "\\mathrm{dl}",
  "㎘": "\\mathrm{kl}",
  "㎚": "\\mathrm{nm}",
  "㎛": "\\mathrm{\\mu m}",
  "㎜": "\\mathrm{mm}",
  "㎝": "\\mathrm{cm}",
  "㎞": "\\mathrm{km}",
  "㎟": "\\mathrm{mm^2}",
  "㎠": "\\mathrm{cm^2}",
  "㎡": "\\mathrm{m^2}",
  "㎢": "\\mathrm{km^2}",
  "㎣": "\\mathrm{mm^3}",
  "㎤": "\\mathrm{cm^3}",
  "㎥": "\\mathrm{m^3}",
  "㎦": "\\mathrm{km^3}",
  "㎧": "\\mathrm{m/s}",
  "㎨": "\\mathrm{m/s^2}",
  "㎩": "\\mathrm{Pa}",
  "㎪": "\\mathrm{kPa}",
  "㎫": "\\mathrm{MPa}",
  "㎬": "\\mathrm{GPa}",
};

export const normalizeLatex = (latex: string) =>
  Array.from(latex)
    .map((char) => COMPATIBILITY_SYMBOLS[char] ?? char)
    .join("");
