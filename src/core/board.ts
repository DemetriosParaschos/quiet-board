import type { Orientation } from "./types";
import { pieceSvgMarkup } from "./pieces";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";
export interface BoardPiece {
  type: PieceType;
  color: PieceColor;
}

export interface BoardSquare {
  file: number;
  rank: number;
  piece: BoardPiece | null;
  displayFile: number;
  displayRank: number;
}

export const BOARD_COLORS = {
  light: "#eadfc7",
  dark: "#b87350",
  ink: "#25343a",
  coordinate: "#56666a",
  whitePiece: "#f8f3e8",
  blackPiece: "#26383d",
} as const;

const FILES = "abcdefgh";

export function parseFenBoard(fen: string): (BoardPiece | null)[][] {
  const placement = fen.split(/\s+/)[0] ?? "";
  const rows = placement.split("/");
  if (rows.length !== 8) throw new Error("Invalid FEN board placement.");

  return rows.map((row) => {
    const cells: (BoardPiece | null)[] = [];
    for (const character of row) {
      if (/^[1-8]$/.test(character)) {
        cells.push(...Array.from({ length: Number(character) }, () => null));
      } else if (/^[prnbqkPRNBQK]$/.test(character)) {
        cells.push({
          type: character.toLowerCase() as PieceType,
          color: character === character.toUpperCase() ? "w" : "b",
        });
      } else {
        throw new Error("Invalid FEN board placement.");
      }
    }
    if (cells.length !== 8) throw new Error("Invalid FEN board placement.");
    return cells;
  });
}

export function boardSquares(fen: string, orientation: Orientation): BoardSquare[] {
  const board = parseFenBoard(fen);
  const squares: BoardSquare[] = [];
  for (let displayRank = 0; displayRank < 8; displayRank += 1) {
    const rank = orientation === "white" ? 7 - displayRank : displayRank;
    for (let displayFile = 0; displayFile < 8; displayFile += 1) {
      const file = orientation === "white" ? displayFile : 7 - displayFile;
      squares.push({
        file,
        rank,
        piece: board[7 - rank][file],
        displayFile,
        displayRank,
      });
    }
  }
  return squares;
}

function svgPiece(piece: BoardPiece, x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 45})">${pieceSvgMarkup(piece)}</g>`;
}

export function renderBoardSvg(fen: string, orientation: Orientation = "white", size = 600): string {
  const padding = size * 0.075;
  const boardSize = size - padding * 2;
  const squareSize = boardSize / 8;
  const squares = boardSquares(fen, orientation);
  const squareMarkup = squares
    .map(({ displayFile, displayRank, piece }) => {
      const x = padding + displayFile * squareSize;
      const y = padding + displayRank * squareSize;
      const background = (displayFile + displayRank) % 2 === 0 ? BOARD_COLORS.light : BOARD_COLORS.dark;
      return `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${background}"/>${piece ? svgPiece(piece, x, y, squareSize) : ""}`;
    })
    .join("");
  const files = orientation === "white" ? FILES.split("") : FILES.split("").reverse();
  const ranks = orientation === "white" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];
  const fontSize = Math.max(10, squareSize * 0.19);
  const fileLabels = files
    .map((file, index) => `<text x="${padding + (index + 0.5) * squareSize}" y="${size - padding * 0.25}" text-anchor="middle">${file}</text>`)
    .join("");
  const rankLabels = ranks
    .map((rank, index) => `<text x="${padding * 0.4}" y="${padding + (index + 0.62) * squareSize}" text-anchor="middle">${rank}</text>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Chess position"><style>text{font-family:Arial,sans-serif;font-size:${fontSize}px;font-weight:600;fill:${BOARD_COLORS.coordinate}}</style><rect width="100%" height="100%" fill="#fffdf8"/>${squareMarkup}<rect x="${padding}" y="${padding}" width="${boardSize}" height="${boardSize}" fill="none" stroke="${BOARD_COLORS.ink}" stroke-width="2"/>${fileLabels}${rankLabels}</svg>`;
}
