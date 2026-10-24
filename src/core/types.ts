export type StudyMode = "all" | "white" | "black";
export type Orientation = "white" | "black";
export type PageSize = "a4" | "letter";
export type Compact = 1 | 2 | 4;

export interface PositionSnapshot {
  ply: number;
  fen: string;
  moveNumber: number;
  lastMoveSan: string;
  lastMoveLabel: string;
  turn: "White" | "Black";
  history: readonly string[];
  comment: string;
  movedColor: "White" | "Black" | null;
}

export interface GameRecord {
  index: number;
  headers: Readonly<Record<string, string>>;
  initialFen: string;
  positions: readonly PositionSnapshot[];
}

export interface ExportOptions {
  studyMode: StudyMode;
  orientation: Orientation;
  pageSize: PageSize;
  compact: Compact;
  showLastMove: boolean;
  showHistory: boolean;
  showPlayers: boolean;
  includeComments: boolean;
  includeCovers: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = {
  studyMode: "all",
  orientation: "white",
  pageSize: "a4",
  compact: 1,
  showLastMove: true,
  showHistory: false,
  showPlayers: true,
  includeComments: false,
  includeCovers: true,
};

export const MAX_GAMES = 50;
export const MAX_PLIES_PER_GAME = 2000;
export const MAX_PGN_BYTES = 512 * 1024;
