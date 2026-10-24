import type { BoardPiece, PieceType } from "./board";

import bB from "../assets/pieces/cburnett/bB.svg?raw";
import bK from "../assets/pieces/cburnett/bK.svg?raw";
import bN from "../assets/pieces/cburnett/bN.svg?raw";
import bP from "../assets/pieces/cburnett/bP.svg?raw";
import bQ from "../assets/pieces/cburnett/bQ.svg?raw";
import bR from "../assets/pieces/cburnett/bR.svg?raw";
import wB from "../assets/pieces/cburnett/wB.svg?raw";
import wK from "../assets/pieces/cburnett/wK.svg?raw";
import wN from "../assets/pieces/cburnett/wN.svg?raw";
import wP from "../assets/pieces/cburnett/wP.svg?raw";
import wQ from "../assets/pieces/cburnett/wQ.svg?raw";
import wR from "../assets/pieces/cburnett/wR.svg?raw";

export type PieceKey = `${"w" | "b"}${Uppercase<PieceType>}`;

const PIECE_SOURCES: Record<PieceKey, string> = {
  wB,
  wK,
  wN,
  wP,
  wQ,
  wR,
  bB,
  bK,
  bN,
  bP,
  bQ,
  bR,
};

export interface PieceVectorElement {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

interface VectorStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

function keyFor(piece: BoardPiece): PieceKey {
  return `${piece.color}${piece.type.toUpperCase()}` as PieceKey;
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([\w-]+)="([^"]*)"/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

function mergeStyle(parent: VectorStyle, source: string): VectorStyle {
  const values = attributes(source);
  return {
    fill: values.fill ?? parent.fill,
    stroke: values.stroke ?? parent.stroke,
    strokeWidth: values["stroke-width"] ? Number(values["stroke-width"]) : parent.strokeWidth,
  };
}

function circlePath(cx: number, cy: number, radius: number): string {
  const control = radius * 0.5522847498;
  return [
    `M ${cx - radius} ${cy}`,
    `C ${cx - radius} ${cy - control} ${cx - control} ${cy - radius} ${cx} ${cy - radius}`,
    `C ${cx + control} ${cy - radius} ${cx + radius} ${cy - control} ${cx + radius} ${cy}`,
    `C ${cx + radius} ${cy + control} ${cx + control} ${cy + radius} ${cx} ${cy + radius}`,
    `C ${cx - control} ${cy + radius} ${cx - radius} ${cy + control} ${cx - radius} ${cy} Z`,
  ].join(" ");
}

function parsePieceVector(source: string): readonly PieceVectorElement[] {
  const elements: PieceVectorElement[] = [];
  const styles: VectorStyle[] = [{ fill: "#000000", stroke: "none", strokeWidth: 1 }];
  const tokens = /<\/g\s*>|<(g|path|circle)\b([^>]*)\/?>/g;

  for (const match of source.matchAll(tokens)) {
    if (match[0].startsWith("</g")) {
      if (styles.length > 1) styles.pop();
      continue;
    }

    const tag = match[1];
    const rawAttributes = match[2] ?? "";
    if (tag === "g") {
      styles.push(mergeStyle(styles.at(-1) as VectorStyle, rawAttributes));
      continue;
    }

    const values = attributes(rawAttributes);
    const style = mergeStyle(styles.at(-1) as VectorStyle, rawAttributes);
    if (tag === "path" && values.d) {
      elements.push({ d: values.d, ...style });
    } else if (tag === "circle" && values.cx && values.cy && values.r) {
      elements.push({
        d: circlePath(Number(values.cx), Number(values.cy), Number(values.r)),
        ...style,
      });
    }
  }

  return elements;
}

const VECTOR_CACHE = new Map<PieceKey, readonly PieceVectorElement[]>();

export function pieceKey(piece: BoardPiece): PieceKey {
  return keyFor(piece);
}

export function pieceSvgMarkup(piece: BoardPiece): string {
  return PIECE_SOURCES[keyFor(piece)].replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

export function pieceVectorElements(piece: BoardPiece): readonly PieceVectorElement[] {
  const key = keyFor(piece);
  const cached = VECTOR_CACHE.get(key);
  if (cached) return cached;
  const parsed = parsePieceVector(PIECE_SOURCES[key]);
  VECTOR_CACHE.set(key, parsed);
  return parsed;
}

export function allPieceKeys(): readonly PieceKey[] {
  return Object.keys(PIECE_SOURCES) as PieceKey[];
}
