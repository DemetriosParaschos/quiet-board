import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";

import {
  boardSquares,
  type BoardPiece,
} from "../core/board";
import { gameTitle, headerValue } from "../core/pgn";
import { pieceVectorElements } from "../core/pieces";
import { selectPositions } from "../core/selection";
import type {
  ExportOptions,
  GameRecord,
  Orientation,
  PositionSnapshot,
} from "../core/types";
import { renderBackCover, renderFrontCover } from "./covers";
import { drawCenteredText, drawText, type FontSet, wrapText } from "./text";

const MM = 72 / 25.4;
const MARGIN = 19 * MM;
const INK = rgb(0.145, 0.204, 0.227);
const MUTED = rgb(0.37, 0.44, 0.46);
const LIGHT_SQUARE = rgb(0.918, 0.875, 0.78);
const DARK_SQUARE = rgb(0.72, 0.45, 0.31);
const BOARD_COORDINATE_GAP = 5;
const DETAILS_GAP = 7;

const FONT_URLS = {
  latin: new URL("../assets/fonts/noto-sans-latin.woff", import.meta.url).href,
  greek: new URL("../assets/fonts/noto-sans-greek.woff", import.meta.url).href,
  greekExt: new URL("../assets/fonts/noto-sans-greek-ext.woff", import.meta.url).href,
};

export interface FontBytes {
  latin: Uint8Array;
  greek: Uint8Array;
  greekExt: Uint8Array;
}

interface PageGeometry {
  width: number;
  height: number;
}

export async function loadBundledFontBytes(): Promise<FontBytes> {
  const entries = await Promise.all(
    Object.entries(FONT_URLS).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load bundled font asset: ${response.status}`);
      return [key, new Uint8Array(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as FontBytes;
}

async function createFonts(pdf: PDFDocument, bytes?: Partial<FontBytes>): Promise<FontSet> {
  const fallback = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.registerFontkit(fontkit);
  const latin = bytes?.latin ? await pdf.embedFont(bytes.latin, { subset: true }) : fallback;
  const greek = bytes?.greek ? await pdf.embedFont(bytes.greek, { subset: true }) : latin;
  const greekExt = bytes?.greekExt ? await pdf.embedFont(bytes.greekExt, { subset: true }) : greek;
  return { latin, greek, greekExt, fallback };
}

function pageGeometry(pageSize: ExportOptions["pageSize"]): PageGeometry {
  return pageSize === "a4" ? { width: 595.28, height: 841.89 } : { width: 612, height: 792 };
}

function displayMetadata(record: GameRecord, options: ExportOptions): string {
  const values: string[] = [];
  if (options.showPlayers) values.push(`${headerValue(record, "White", "White")} - ${headerValue(record, "Black", "Black")}`);
  for (const [key, label] of [["Event", "Event"], ["Date", "Date"], ["Round", "Round"], ["Result", "Result"], ["ECO", "ECO"]] as const) {
    const value = headerValue(record, key).trim();
    if (value && !["?", "*", "????.??.??"].includes(value)) values.push(`${label}: ${value}`);
  }
  return values.join(" • ");
}

function drawPageHeading(page: PDFPage, record: GameRecord, options: ExportOptions, geometry: PageGeometry, fonts: FontSet, compact: boolean): number {
  const text = `Game ${record.index}${displayMetadata(record, options) ? `  |  ${displayMetadata(record, options)}` : ""}`;
  const size = compact ? 7.5 : 8.5;
  const lines = wrapText(text, geometry.width - 2 * MARGIN, size, fonts, compact ? 2 : 3);
  const top = geometry.height - MARGIN;
  lines.forEach((line, index) => drawCenteredText(page, line, geometry.width / 2, top - index * (size + 3), size, fonts, MUTED));
  return top - lines.length * (size + 3) - (compact ? 16 : 25);
}

function pdfColour(value: string): ReturnType<typeof rgb> | undefined {
  if (value === "none") return undefined;
  let hex = value.toLowerCase() === "black" ? "000000" : value.toLowerCase() === "white" ? "ffffff" : value.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(hex)) hex = [...hex].map((digit) => `${digit}${digit}`).join("");
  if (!/^[0-9a-f]{6}$/.test(hex)) return undefined;
  return rgb(Number.parseInt(hex.slice(0, 2), 16) / 255, Number.parseInt(hex.slice(2, 4), 16) / 255, Number.parseInt(hex.slice(4, 6), 16) / 255);
}

function drawPdfPiece(page: PDFPage, piece: BoardPiece, x: number, top: number, size: number): void {
  for (const element of pieceVectorElements(piece)) {
    const color = pdfColour(element.fill);
    const borderColor = pdfColour(element.stroke);
    page.drawSvgPath(element.d, {
      x,
      y: top,
      scale: size / 45,
      color,
      borderColor,
      borderWidth: borderColor ? element.strokeWidth : undefined,
    });
  }
}

export function drawBoardPdf(page: PDFPage, fen: string, orientation: Orientation, x: number, y: number, boardSize: number): void {
  const squareSize = boardSize / 8;
  for (const square of boardSquares(fen, orientation)) {
    const squareX = x + square.displayFile * squareSize;
    const squareY = y + (7 - square.displayRank) * squareSize;
    page.drawRectangle({
      x: squareX,
      y: squareY,
      width: squareSize + 0.2,
      height: squareSize + 0.2,
      color: (square.displayFile + square.displayRank) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE,
    });
    if (square.piece) {
      // pdf-lib's SVG path coordinates grow down from the path origin. Start
      // at the top of the square so the same glyph geometry is used as in the
      // browser SVG preview.
      drawPdfPiece(page, square.piece, squareX, squareY + squareSize, squareSize);
    }
  }
  page.drawRectangle({ x, y, width: boardSize, height: boardSize, borderColor: INK, borderWidth: 1.2 });
}

function drawBoardCoordinates(page: PDFPage, orientation: Orientation, x: number, y: number, boardSize: number, fonts: FontSet): void {
  const squareSize = boardSize / 8;
  const files = orientation === "white" ? "abcdefgh".split("") : "abcdefgh".split("").reverse();
  const ranks = orientation === "white" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];
  const coordinateSize = coordinateSizeForBoard(boardSize);
  for (const [index, file] of files.entries()) drawCenteredText(page, file, x + (index + 0.5) * squareSize, y - coordinateSize - 3, coordinateSize, fonts, MUTED);
  ranks.forEach((rank, index) => drawCenteredText(page, rank, x - coordinateSize - 4, y + (7 - index + 0.5) * squareSize - coordinateSize * 0.35, coordinateSize, fonts, MUTED));
}

function coordinateSizeForBoard(boardSize: number): number {
  return Math.max(6.5, Math.min(10, (boardSize / 8) * 0.18));
}

function coordinateAreaHeight(boardSize: number): number {
  return coordinateSizeForBoard(boardSize) + BOARD_COORDINATE_GAP;
}

function drawBoardWithCoordinates(page: PDFPage, fen: string, orientation: Orientation, x: number, y: number, boardSize: number, fonts: FontSet): void {
  drawBoardPdf(page, fen, orientation, x, y, boardSize);
  drawBoardCoordinates(page, orientation, x, y, boardSize, fonts);
}

function drawFooter(page: PDFPage, pageNumber: number, geometry: PageGeometry, fonts: FontSet): void {
  drawCenteredText(page, "Turn the page to reveal the next position.", geometry.width / 2, MARGIN - 2, 7.5, fonts, MUTED);
  drawCenteredText(page, String(pageNumber), geometry.width / 2, 19, 7.5, fonts, MUTED);
}

interface PositionDetailsLayout {
  headingSize: number;
  bodySize: number;
  lineHeight: number;
  label: string;
  historyLines: string[];
  commentLines: string[];
  height: number;
}

function measurePositionDetails(position: PositionSnapshot, options: ExportOptions, width: number, fonts: FontSet, compact: boolean): PositionDetailsLayout {
  const headingSize = compact ? 8.5 : 13;
  const bodySize = compact ? 6.8 : 8.5;
  const lineHeight = compact ? 8.2 : 10.5;
  const label = options.showLastMove ? position.lastMoveLabel || "Initial position" : "Position";
  const historyLines = options.showHistory && position.history.length > 0
    ? wrapText(position.history.join(" "), width * 0.92, bodySize, fonts, compact ? 2 : 4)
    : [];
  const commentLines = options.includeComments && position.comment
    ? wrapText(position.comment, width * 0.88, bodySize, fonts, compact ? 2 : 7)
    : [];

  let height = (compact ? 10 : 16) + (compact ? 10 : 14);
  if (historyLines.length > 0) height += historyLines.length * lineHeight + (compact ? 1 : 2);
  height += commentLines.length * lineHeight;
  return { headingSize, bodySize, lineHeight, label, historyLines, commentLines, height };
}

function renderPositionDetails(
  page: PDFPage,
  position: PositionSnapshot,
  options: ExportOptions,
  x: number,
  y: number,
  width: number,
  fonts: FontSet,
  compact: boolean,
  layout: PositionDetailsLayout,
): number {
  let cursor = y;
  drawCenteredText(page, layout.label, x + width / 2, cursor, layout.headingSize, fonts, INK);
  cursor -= compact ? 10 : 16;
  drawCenteredText(page, `${position.turn} to move`, x + width / 2, cursor, layout.bodySize, fonts, MUTED);
  cursor -= compact ? 10 : 14;
  if (layout.historyLines.length > 0) {
    layout.historyLines.forEach((line) => {
      drawCenteredText(page, line, x + width / 2, cursor, layout.bodySize, fonts, MUTED);
      cursor -= layout.lineHeight;
    });
    cursor -= compact ? 1 : 2;
  }
  if (layout.commentLines.length > 0) {
    layout.commentLines.forEach((line) => {
      drawText(page, line, x + width * 0.06, cursor, layout.bodySize, fonts, MUTED);
      cursor -= layout.lineHeight;
    });
  }
  return cursor;
}

export interface PositionBlockLayout {
  boardSize: number;
  boardY: number;
  detailsY: number;
  coordinateBaseline: number;
  detailsBottom: number;
}

export function layoutPositionBlock(cellHeight: number, cellWidth: number, detailsHeight: number, cellTop: number, maxBoardSize = Number.POSITIVE_INFINITY): PositionBlockLayout {
  const maxBoardWidth = Math.max(0, Math.min(cellWidth - 20, maxBoardSize));
  let boardSize = Math.min(maxBoardWidth, Math.max(0, cellHeight - detailsHeight - DETAILS_GAP - coordinateAreaHeight(maxBoardWidth)));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    boardSize = Math.min(maxBoardWidth, Math.max(0, cellHeight - detailsHeight - DETAILS_GAP - coordinateAreaHeight(boardSize)));
  }
  const boardY = cellTop - boardSize;
  const coordinateBaseline = boardY - coordinateSizeForBoard(boardSize) - 3;
  return {
    boardSize,
    boardY,
    detailsY: boardY - coordinateAreaHeight(boardSize) - DETAILS_GAP,
    coordinateBaseline,
    detailsBottom: boardY - coordinateAreaHeight(boardSize) - DETAILS_GAP - detailsHeight,
  };
}

function renderPositionBlock(
  page: PDFPage,
  position: PositionSnapshot,
  options: ExportOptions,
  cellX: number,
  cellTop: number,
  cellWidth: number,
  cellHeight: number,
  fonts: FontSet,
  compact: boolean,
  maxBoardSize = Number.POSITIVE_INFINITY,
): void {
  const details = measurePositionDetails(position, options, cellWidth, fonts, compact);
  const layout = layoutPositionBlock(cellHeight, cellWidth, details.height, cellTop, maxBoardSize);
  const boardX = cellX + (cellWidth - layout.boardSize) / 2;
  drawBoardWithCoordinates(page, position.fen, options.orientation, boardX, layout.boardY, layout.boardSize, fonts);
  renderPositionDetails(page, position, options, cellX, layout.detailsY, cellWidth, fonts, compact, details);
}

function renderSinglePosition(page: PDFPage, record: GameRecord, position: PositionSnapshot, options: ExportOptions, geometry: PageGeometry, fonts: FontSet, pageNumber: number): void {
  const contentTop = drawPageHeading(page, record, options, geometry, fonts, false);
  const bottom = MARGIN + 35;
  const width = geometry.width - 2 * MARGIN;
  const blockHeight = contentTop - bottom;
  renderPositionBlock(page, position, options, MARGIN, contentTop, width, blockHeight, fonts, false, 365);
  drawFooter(page, pageNumber, geometry, fonts);
}

function renderCompactPage(page: PDFPage, record: GameRecord, positions: readonly PositionSnapshot[], options: ExportOptions, geometry: PageGeometry, fonts: FontSet, pageNumber: number): void {
  const contentTop = drawPageHeading(page, record, options, geometry, fonts, true);
  const columns = options.compact === 4 ? 2 : 1;
  const rows = options.compact === 4 ? 2 : Math.min(2, positions.length);
  const gap = 16;
  const cellWidth = (geometry.width - 2 * MARGIN - gap * (columns - 1)) / columns;
  const cellHeight = (contentTop - (MARGIN + 28) - gap * (rows - 1)) / rows;

  positions.forEach((position, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = MARGIN + column * (cellWidth + gap);
    const cellTop = contentTop - row * (cellHeight + gap);
    renderPositionBlock(page, position, options, cellX, cellTop, cellWidth, cellHeight, fonts, true);
  });
  drawFooter(page, pageNumber, geometry, fonts);
}

function safeFilename(records: readonly GameRecord[]): string {
  const source = records.length === 1 ? gameTitle(records[0]) : `${gameTitle(records[0])} and ${records.length - 1} more`;
  const normalized = source.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const filename = normalized.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${filename || "chess-study"}.pdf`;
}

export async function generatePdf(records: readonly GameRecord[], options: ExportOptions, fontBytes?: Partial<FontBytes>): Promise<{ bytes: Uint8Array; filename: string }> {
  if (records.length === 0) throw new Error("At least one game is required to generate a PDF.");
  const pdf = await PDFDocument.create();
  const fonts = await createFonts(pdf, fontBytes);
  const geometry = pageGeometry(options.pageSize);
  let pageNumber = 0;

  if (options.includeCovers) {
    renderFrontCover(pdf.addPage([geometry.width, geometry.height]), records, geometry, fonts);
  }

  for (const record of records) {
    const positions = selectPositions(record, options.studyMode);
    for (let offset = 0; offset < positions.length; offset += options.compact) {
      const page = pdf.addPage([geometry.width, geometry.height]);
      pageNumber += 1;
      const pagePositions = positions.slice(offset, offset + options.compact);
      if (options.compact === 1) renderSinglePosition(page, record, pagePositions[0], options, geometry, fonts, pageNumber);
      else renderCompactPage(page, record, pagePositions, options, geometry, fonts, pageNumber);
    }
  }

  if (options.includeCovers) {
    renderBackCover(pdf.addPage([geometry.width, geometry.height]), geometry, fonts);
  }

  pdf.setTitle(`Quiet Board - ${gameTitle(records[0])}`);
  pdf.setSubject("Printable chess study positions");
  pdf.setCreator("Quiet Board");
  return { bytes: await pdf.save(), filename: safeFilename(records) };
}
