import { Chess, type Move } from "chess.js";

import {
  MAX_GAMES,
  MAX_PGN_BYTES,
  MAX_PLIES_PER_GAME,
  type GameRecord,
  type PositionSnapshot,
} from "./types";

export class PGNValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PGNValidationError";
  }
}

function splitPgnGames(pgn: string): string[] {
  const lines = pgn.replace(/\r\n?/g, "\n").split("\n");
  const games: string[] = [];
  let current: string[] = [];
  let currentHasMovetext = false;
  let commentDepth = 0;

  const headerPattern = /^\s*\[[A-Za-z][A-Za-z0-9_]*\s+/;

  for (const line of lines) {
    const isHeader = commentDepth === 0 && headerPattern.test(line);
    if (isHeader && currentHasMovetext) {
      const text = current.join("\n").trim();
      if (text) games.push(text);
      current = [];
      currentHasMovetext = false;
    }

    current.push(line);

    if (!isHeader && line.trim() && !line.trim().startsWith(";")) {
      currentHasMovetext = true;
    }

    let escaped = false;
    for (const character of line) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
      } else if (character === "{") {
        commentDepth += 1;
      } else if (character === "}" && commentDepth > 0) {
        commentDepth -= 1;
      }
    }
  }

  const text = current.join("\n").trim();
  if (text) games.push(text);
  return games;
}

function fenTurn(fen: string): "White" | "Black" {
  return fen.split(/\s+/)[1] === "b" ? "Black" : "White";
}

function fenMoveNumber(fen: string): number {
  const value = Number.parseInt(fen.split(/\s+/)[5] ?? "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function createSnapshot(
  ply: number,
  fen: string,
  moveNumber: number,
  lastMoveSan: string,
  lastMoveLabel: string,
  history: readonly string[],
  comment: string,
  movedColor: "White" | "Black" | null,
): PositionSnapshot {
  return {
    ply,
    fen,
    moveNumber,
    lastMoveSan,
    lastMoveLabel,
    turn: fenTurn(fen),
    history: [...history],
    comment: comment.trim(),
    movedColor,
  };
}

function commentByFen(chess: Chess): ReadonlyMap<string, string> {
  return new Map(chess.getComments().map(({ fen, comment }) => [fen, comment]));
}

function parseGame(text: string, index: number): GameRecord {
  const chess = new Chess();
  try {
    // chess.js follows variations[0] while loading a PGN, which is the
    // library's documented main-line behavior and matches the legacy app.
    chess.loadPgn(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PGNValidationError(`Could not read PGN near game ${index}: ${detail}`);
  }

  const moves = chess.history({ verbose: true }) as Move[];
  if (moves.length === 0) {
    throw new PGNValidationError(`No complete PGN game was found near game ${index}.`);
  }
  if (moves.length > MAX_PLIES_PER_GAME) {
    throw new PGNValidationError(
      `Game ${index} contains more than ${MAX_PLIES_PER_GAME} half-moves.`,
    );
  }

  const comments = commentByFen(chess);
  const initialFen = moves[0].before;
  const positions: PositionSnapshot[] = [
    createSnapshot(
      0,
      initialFen,
      fenMoveNumber(initialFen),
      "",
      "",
      [],
      comments.get(initialFen) ?? "",
      null,
    ),
  ];

  const history: string[] = [];
  for (const [offset, move] of moves.entries()) {
    const ply = offset + 1;
    const label = move.color === "w" ? `${fenMoveNumber(move.before)}. ${move.san}` : `${fenMoveNumber(move.before)}... ${move.san}`;
    history.push(label);
    positions.push(
      createSnapshot(
        ply,
        move.after,
        fenMoveNumber(move.before),
        move.san,
        label,
        history,
        comments.get(move.after) ?? "",
        move.color === "w" ? "White" : "Black",
      ),
    );
  }

  return {
    index,
    headers: chess.getHeaders(),
    initialFen,
    positions,
  };
}

export function parsePgn(pgnText: string): readonly GameRecord[] {
  if (!pgnText || !pgnText.trim()) {
    throw new PGNValidationError("The PGN input is empty.");
  }
  if (new TextEncoder().encode(pgnText).byteLength > MAX_PGN_BYTES) {
    throw new PGNValidationError("The PGN input must be 512 KB or smaller.");
  }

  const chunks = splitPgnGames(pgnText);
  if (chunks.length === 0) {
    throw new PGNValidationError("No complete PGN game was found in the input.");
  }
  if (chunks.length > MAX_GAMES) {
    throw new PGNValidationError(`A maximum of ${MAX_GAMES} games can be exported at once.`);
  }

  const records = chunks.map((chunk, offset) => parseGame(chunk, offset + 1));
  if (records.length === 0) {
    throw new PGNValidationError("No complete PGN game was found in the input.");
  }
  return records;
}

export function headerValue(record: GameRecord, key: string, fallback = ""): string {
  return record.headers[key] ?? fallback;
}

export function gameTitle(record: GameRecord): string {
  const white = headerValue(record, "White", "White");
  const black = headerValue(record, "Black", "Black");
  if (record.headers.White || record.headers.Black) return `${white} - ${black}`;
  return `Game ${record.index}`;
}
