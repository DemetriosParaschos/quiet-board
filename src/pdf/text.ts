import type { Color, PDFFont, PDFPage } from "pdf-lib";

export interface FontSet {
  latin: PDFFont;
  greek: PDFFont;
  greekExt: PDFFont;
  fallback: PDFFont;
}

function fontForCharacter(character: string, fonts: FontSet): PDFFont {
  const codePoint = character.codePointAt(0) ?? 0;
  if ((codePoint >= 0x1f00 && codePoint <= 0x1fff) || (codePoint >= 0x1c80 && codePoint <= 0x1cff)) return fonts.greekExt;
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return fonts.greek;
  if (codePoint <= 0x024f || (codePoint >= 0x2000 && codePoint <= 0x20cf)) return fonts.latin;
  return fonts.fallback;
}

function runs(text: string, fonts: FontSet): { text: string; font: PDFFont }[] {
  const output: { text: string; font: PDFFont }[] = [];
  for (const character of [...text]) {
    const font = fontForCharacter(character, fonts);
    const previous = output.at(-1);
    if (previous && previous.font === font) previous.text += character;
    else output.push({ text: character, font });
  }
  return output;
}

export function widthOfText(text: string, size: number, fonts: FontSet): number {
  return runs(text, fonts).reduce((total, run) => total + run.font.widthOfTextAtSize(run.text, size), 0);
}

export function drawText(page: PDFPage, text: string, x: number, y: number, size: number, fonts: FontSet, color: Color): void {
  let offset = 0;
  for (const run of runs(text, fonts)) {
    page.drawText(run.text, { x: x + offset, y, size, font: run.font, color });
    offset += run.font.widthOfTextAtSize(run.text, size);
  }
}

export function drawCenteredText(page: PDFPage, text: string, centerX: number, y: number, size: number, fonts: FontSet, color: Color): void {
  drawText(page, text, centerX - widthOfText(text, size, fonts) / 2, y, size, fonts, color);
}

export function wrapText(text: string, maxWidth: number, size: number, fonts: FontSet, maxLines = Number.POSITIVE_INFINITY): string[] {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  const takeFittingPrefix = (value: string): [string, string] => {
    let prefix = "";
    for (const character of [...value]) {
      if (prefix && widthOfText(`${prefix}${character}`, size, fonts) > maxWidth) return [prefix, value.slice(prefix.length)];
      prefix += character;
    }
    if (!prefix && value) return [[...value][0], value.slice([...value][0].length)];
    return [prefix, ""];
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
      while (word) {
        if (!line && widthOfText(word, size, fonts) > maxWidth) {
          const [prefix, remainder] = takeFittingPrefix(word);
          lines.push(prefix);
          word = remainder;
          if (lines.length >= maxLines) break;
          continue;
        }
        const candidate = line ? `${line} ${word}` : word;
        if (!line || widthOfText(candidate, size, fonts) <= maxWidth) {
          line = candidate;
          word = "";
          continue;
        }
        lines.push(line);
        line = "";
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && text.length > 0) {
    const last = lines.at(-1) ?? "";
    const ellipsis = "…";
    let shortened = last;
    while (shortened && widthOfText(`${shortened}${ellipsis}`, size, fonts) > maxWidth) shortened = shortened.slice(0, -1);
    lines[lines.length - 1] = `${shortened.trimEnd()}${ellipsis}`;
  }
  return lines;
}
