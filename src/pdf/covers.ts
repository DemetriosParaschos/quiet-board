import { PDFString, type PDFPage, rgb } from "pdf-lib";

import { DONATION_URL, PUBLIC_WEBSITE_URL } from "../core/config";
import { headerValue, gameTitle } from "../core/pgn";
import type { GameRecord } from "../core/types";
import { drawCenteredText, drawText, type FontSet, widthOfText, wrapText } from "./text";

interface PageGeometry {
  width: number;
  height: number;
}

const MM = 72 / 25.4;
const MARGIN = 19 * MM;
const PAPER = rgb(0.973, 0.965, 0.937);
const PAPER_DARK = rgb(0.94, 0.925, 0.884);
const INK = rgb(0.145, 0.204, 0.227);
const MUTED = rgb(0.37, 0.44, 0.46);
const GREEN = rgb(0.376, 0.467, 0.431);
const ACCENT = rgb(0.714, 0.373, 0.239);
const LIGHT_SQUARE = rgb(0.918, 0.875, 0.78);
const DARK_SQUARE = rgb(0.72, 0.45, 0.31);

// The cover emblem is part of the existing cover artwork, rather than a board
// piece. Keep it unchanged while the board diagrams use the bundled Cburnett set.
const COVER_KNIGHT_PATHS = [
  "M22 91 L78 91 L82 96 L18 96 Z",
  "M29 88 C31 77 36 69 45 60 C35 56 29 48 30 38 C31 27 40 18 54 14 C62 12 72 15 78 20 L68 29 C61 26 56 27 52 31 C49 35 50 40 57 44 C68 50 72 59 69 69 C67 78 62 83 58 88 Z",
  "M52 30 L58 34 L51 39 L45 35 Z",
];

function addUriLink(page: PDFPage, url: string, x: number, y: number, width: number, height: number): void {
  const annotation = page.doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });
  page.node.addAnnot(page.doc.context.register(annotation));
}

function drawCoverLink(page: PDFPage, text: string, url: string, centerX: number, y: number, size: number, fonts: FontSet): void {
  const width = widthOfText(text, size, fonts);
  const x = centerX - width / 2;
  drawText(page, text, x, y, size, fonts, GREEN);
  page.drawLine({ start: { x, y: y - 2 }, end: { x: x + width, y: y - 2 }, thickness: 0.45, color: GREEN });
  addUriLink(page, url, x - 2, y - 3, width + 4, size + 5);
}

function drawBackground(page: PDFPage, geometry: PageGeometry): void {
  page.drawRectangle({ x: 0, y: 0, width: geometry.width, height: geometry.height, color: PAPER });
  page.drawRectangle({
    x: MARGIN,
    y: MARGIN,
    width: geometry.width - 2 * MARGIN,
    height: geometry.height - 2 * MARGIN,
    borderColor: PAPER_DARK,
    borderWidth: 0.8,
  });
}

function drawBoardMotif(page: PDFPage, x: number, y: number, size: number, cells = 8): void {
  const cell = size / cells;
  for (let rank = 0; rank < cells; rank += 1) {
    for (let file = 0; file < cells; file += 1) {
      page.drawRectangle({
        x: x + file * cell,
        y: y + rank * cell,
        width: cell + 0.15,
        height: cell + 0.15,
        color: (file + rank) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE,
        opacity: cells === 8 ? 0.7 : 0.82,
      });
    }
  }
  page.drawRectangle({ x, y, width: size, height: size, borderColor: GREEN, borderWidth: 1.1 });
}

function drawBackEmblem(page: PDFPage, centerX: number, centerY: number, size: number): void {
  page.drawCircle({ x: centerX, y: centerY, size: size * 0.58, borderColor: GREEN, borderWidth: 0.9, color: PAPER });
  for (const path of COVER_KNIGHT_PATHS) {
    page.drawSvgPath(path, {
      x: centerX - size / 2,
      y: centerY + size * 0.54,
      scale: size / 100,
      color: GREEN,
      borderColor: GREEN,
      borderWidth: 0.5,
    });
  }
}

function cleanHeaderValue(record: GameRecord, key: string): string {
  const value = headerValue(record, key).trim();
  return value && !["?", "*", "????.??.??"].includes(value) ? value : "";
}

function playersForCover(record: GameRecord): string {
  const white = cleanHeaderValue(record, "White");
  const black = cleanHeaderValue(record, "Black");
  if (white && black) return `${white} - ${black}`;
  if (white) return `White: ${white}`;
  if (black) return `Black: ${black}`;
  return "";
}

function drawCoverMetadata(page: PDFPage, records: readonly GameRecord[], centerX: number, y: number, width: number, fonts: FontSet): void {
  const multiple = records.length > 1;
  const title = multiple ? `A Collection of ${records.length} Chess Studies` : playersForCover(records[0]) || gameTitle(records[0]);
  const titleLines = wrapText(title, width, 14, fonts, 2);
  titleLines.forEach((line, index) => drawCenteredText(page, line, centerX, y - index * 18, 14, fonts, INK));

  if (multiple) return;
  const details = [cleanHeaderValue(records[0], "Event"), cleanHeaderValue(records[0], "Date")].filter(Boolean).join("  •  ");
  if (details) drawCenteredText(page, details, centerX, y - titleLines.length * 18 - 8, 8.5, fonts, MUTED);
}

export function renderFrontCover(page: PDFPage, records: readonly GameRecord[], geometry: PageGeometry, fonts: FontSet): void {
  drawBackground(page, geometry);
  const centerX = geometry.width / 2;
  drawCenteredText(page, "QUIET BOARD", centerX, geometry.height - MARGIN - 62, 28, fonts, INK);
  drawCenteredText(page, "STUDY PRESS", centerX, geometry.height - MARGIN - 89, 10.5, fonts, GREEN);
  page.drawLine({ start: { x: centerX - 72, y: geometry.height - MARGIN - 112 }, end: { x: centerX + 72, y: geometry.height - MARGIN - 112 }, thickness: 0.8, color: ACCENT });

  const motifSize = Math.min(182, geometry.width - 2 * MARGIN - 100);
  const motifY = geometry.height / 2 - motifSize / 2 + 18;
  drawBoardMotif(page, centerX - motifSize / 2, motifY, motifSize);
  drawCoverMetadata(page, records, centerX, motifY - 43, geometry.width - 2 * MARGIN - 38, fonts);
  drawCenteredText(page, "Printable chess study material", centerX, MARGIN + 60, 8.5, fonts, MUTED);
  drawCoverLink(page, PUBLIC_WEBSITE_URL, PUBLIC_WEBSITE_URL, centerX, MARGIN + 35, 7.5, fonts);
}

export function renderBackCover(page: PDFPage, geometry: PageGeometry, fonts: FontSet): void {
  drawBackground(page, geometry);
  const centerX = geometry.width / 2;
  drawBackEmblem(page, centerX, geometry.height / 2 + 112, 42);
  drawCenteredText(page, "QUIET BOARD / STUDY PRESS", centerX, geometry.height / 2 + 38, 10, fonts, GREEN);
  drawCenteredText(page, "Chess studies, prepared for the printed page.", centerX, geometry.height / 2 + 3, 9.5, fonts, MUTED);
  drawCoverLink(page, PUBLIC_WEBSITE_URL, PUBLIC_WEBSITE_URL, centerX, MARGIN + 48, 7.5, fonts);
  drawCoverLink(page, "Support this project", DONATION_URL, centerX, MARGIN + 27, 8, fonts);
}
