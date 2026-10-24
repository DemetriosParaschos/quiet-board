import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";

import { boardSquares, renderBoardSvg } from "../src/core/board";
import { DONATION_URL, PUBLIC_WEBSITE_URL } from "../src/core/config";
import { allPieceKeys, pieceVectorElements } from "../src/core/pieces";
import { parsePgn, PGNValidationError } from "../src/core/pgn";
import { selectPositions } from "../src/core/selection";
import { DEFAULT_OPTIONS, type ExportOptions } from "../src/core/types";
import { generatePdf, layoutPositionBlock, type FontBytes } from "../src/pdf/generator";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const samplePgn = fs.readFileSync(path.join(root, "sample_games/fischer_spassky_1972.pgn"), "utf8");
const fixtureFonts: FontBytes = {
  latin: new Uint8Array(fs.readFileSync(path.join(root, "src/assets/fonts/noto-sans-latin.woff"))),
  greek: new Uint8Array(fs.readFileSync(path.join(root, "src/assets/fonts/noto-sans-greek.woff"))),
  greekExt: new Uint8Array(fs.readFileSync(path.join(root, "src/assets/fonts/noto-sans-greek-ext.woff"))),
};

const simplePgn = `[Event "Test Match"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const specialMovesPgn = `[SetUp "1"]
[FEN "6k1/P6p/8/3pP3/8/8/8/7K w - d6 0 1"]
[White "Promotion"]
[Black "Tactics"]

1. exd6+ Kf8 2. a8=Q+ 1-0`;

function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

function annotationUrls(pdf: PDFDocument, pageIndex: number): string[] {
  const annotations = pdf.getPages()[pageIndex].node.Annots();
  if (!annotations) return [];
  return Array.from({ length: annotations.size() }, (_, index) => {
    const annotation = pdf.context.lookup(annotations.get(index), PDFDict);
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    return action.lookup(PDFName.of("URI"), PDFString).asString();
  });
}

describe("PGN parsing and position selection", () => {
  it("keeps the initial position and each verified main-line position", () => {
    const game = parsePgn(simplePgn)[0];
    expect(game.positions).toHaveLength(7);
    expect(game.positions[0].fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(game.positions[1].lastMoveLabel).toBe("1. e4");
    expect(game.positions[2].lastMoveLabel).toBe("1... e5");
    expect(game.positions.at(-1)?.history.at(-1)).toBe("3... a6");
  });

  it("supports multiple games and retains all relevant headers", () => {
    const games = parsePgn(`${simplePgn}\n\n${samplePgn}`);
    expect(games).toHaveLength(2);
    expect(games[1].index).toBe(2);
    expect(games[1].headers.Site).toBe("Reykjavik");
    expect(games[1].headers.ECO).toBe("D59");
  });

  it("follows only the main line and handles custom FEN starts", () => {
    const pgn = simplePgn.replace("2. Nf3", "2. Nf3 (2. Bc4 {ignored variation})");
    const mainLine = parsePgn(pgn)[0];
    expect(mainLine.positions).toHaveLength(7);
    expect(mainLine.positions.some((position) => position.lastMoveSan === "Bc4")).toBe(false);

    const special = parsePgn(specialMovesPgn)[0];
    expect(special.initialFen.startsWith("6k1/P6p/8/3pP3/8/8/8/7K w")).toBe(true);
    expect(special.positions[1].lastMoveSan).toBe("exd6");
    expect(special.positions[3].lastMoveSan).toBe("a8=Q+");
    expect(special.positions[3].fen.split(" ")[0]).toContain("Q");
  });

  it("rejects invalid or incomplete PGN input with a user-facing error", () => {
    expect(() => parsePgn("not a chess game")).toThrow(PGNValidationError);
    expect(() => parsePgn('[White "Only headers"]')).toThrow("No complete PGN game");
    expect(() => parsePgn('[White "Broken"]\n\n1. e4 e5 2. e5')).toThrow(PGNValidationError);
  });

  it("associates comments with the current FEN only", () => {
    const pgn = simplePgn.replace("1. e4 e5", "1. e4 {A current note} (1. d4 {ignored variation}) e5 {A future note}");
    const game = parsePgn(pgn)[0];
    expect(game.positions[1].comment).toBe("A current note");
    expect(game.positions[1].comment).not.toContain("future");
    expect(game.positions[2].comment).toBe("A future note");
    expect(game.positions[1].history).toEqual(["1. e4"]);
  });

  it("keeps before/after pairs for each color without future replies", () => {
    const game = parsePgn(simplePgn)[0];
    expect(selectPositions(game, "white").map((position) => position.lastMoveLabel)).toEqual(["", "1. e4", "1... e5", "2. Nf3", "2... Nc6", "3. Bb5"]);
    expect(selectPositions(game, "white").at(-1)?.history.join(" ")).not.toContain("a6");
    expect(selectPositions(game, "black").map((position) => position.lastMoveLabel)).toEqual(["", "1. e4", "1... e5", "2. Nf3", "2... Nc6", "3. Bb5", "3... a6"]);
  });
});

describe("board and PDF output", () => {
  it("changes coordinate and piece order when orientation changes", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const white = boardSquares(fen, "white");
    const black = boardSquares(fen, "black");
    expect(white[0]).toMatchObject({ file: 0, rank: 7, piece: { type: "r", color: "b" } });
    expect(black[0]).toMatchObject({ file: 7, rank: 0, piece: { type: "r", color: "w" } });
    expect(renderBoardSvg(fen, "black")).toContain("<svg");
    expect(renderBoardSvg(fen, "black")).toContain("<path");
  });

  it("uses all twelve locally bundled Cburnett piece variants as vectors", () => {
    expect(allPieceKeys()).toHaveLength(12);
    for (const pieceKey of allPieceKeys()) {
      const piece = { color: pieceKey[0] as "w" | "b", type: pieceKey[1].toLowerCase() as "p" | "n" | "b" | "r" | "q" | "k" };
      expect(pieceVectorElements(piece).length).toBeGreaterThan(0);
    }
    const initial = renderBoardSvg("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect((initial.match(/<g transform=/g) ?? []).length).toBe(32);
  });

  it("keeps coordinates, details, and the following block within their cells", () => {
    const block = layoutPositionBlock(320, 250, 62, 760, 230);
    expect(block.boardY + block.boardSize).toBe(760);
    expect(block.coordinateBaseline - block.detailsY).toBeGreaterThan(8);
    expect(block.detailsBottom).toBeGreaterThanOrEqual(440);
  });

  it("matches the regression sample's initial-plus-plies page count", async () => {
    const records = parsePgn(samplePgn);
    expect(records[0].positions).toHaveLength(78);
    const { bytes, filename } = await generatePdf(records, options({ includeCovers: false }), fixtureFonts);
    expect(filename).toBe("boris-spassky-robert-james-fischer.pdf");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages()).toHaveLength(78);
    expect(pdf.getTitle()).toContain("Quiet Board");
  });

  it("adds exactly two cover pages by default with working links", async () => {
    const records = parsePgn(simplePgn);
    const covered = await generatePdf(records, options(), fixtureFonts);
    const withCovers = await PDFDocument.load(covered.bytes);
    expect(withCovers.getPages()).toHaveLength(9);
    expect(annotationUrls(withCovers, 0)).toEqual([PUBLIC_WEBSITE_URL]);
    expect(annotationUrls(withCovers, 1)).toEqual([]);
    expect(annotationUrls(withCovers, 8)).toEqual(expect.arrayContaining([PUBLIC_WEBSITE_URL, DONATION_URL]));

    const withoutCovers = await generatePdf(records, options({ includeCovers: false }), fixtureFonts);
    expect((await PDFDocument.load(withoutCovers.bytes)).getPages()).toHaveLength(7);
  });

  it("places collection covers at both ends for A4 and US Letter", async () => {
    const records = parsePgn(`${simplePgn}\n\n${simplePgn.replace("Alice", "Carol")}`);
    for (const pageSize of ["a4", "letter"] as const) {
      const { bytes } = await generatePdf(records, options({ pageSize }), fixtureFonts);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPages()).toHaveLength(16);
      expect(pdf.getPages()[0].getSize()).toEqual(pageSize === "a4" ? { width: 595.28, height: 841.89 } : { width: 612, height: 792 });
      expect(pdf.getPages()[0].getSize()).toEqual(pdf.getPages().at(-1)?.getSize());
      expect(annotationUrls(pdf, 0)).toEqual([PUBLIC_WEBSITE_URL]);
      expect(annotationUrls(pdf, 15)).toEqual(expect.arrayContaining([PUBLIC_WEBSITE_URL, DONATION_URL]));
    }
  });

  it("packs compact positions chronologically and preserves page counts", async () => {
    const records = parsePgn(simplePgn);
    const { bytes } = await generatePdf(records, options({ compact: 2, includeCovers: false }), fixtureFonts);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages()).toHaveLength(4);
  });

  it("supports one, two, and four positions per page on both paper sizes", async () => {
    const records = parsePgn(simplePgn);
    for (const pageSize of ["a4", "letter"] as const) {
      for (const compact of [1, 2, 4] as const) {
        const { bytes } = await generatePdf(records, options({ pageSize, compact, includeCovers: false }), fixtureFonts);
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPages()).toHaveLength(Math.ceil(records[0].positions.length / compact));
        expect(pdf.getPages()[0].getSize()).toEqual(pageSize === "a4" ? { width: 595.28, height: 841.89 } : { width: 612, height: 792 });
      }
    }
  });

  it("embeds long Unicode comments without rasterizing the board", async () => {
    const pgn = simplePgn.replace("1. e4 e5", "1. e4 {Σημείωση: αυτή είναι μια αρκετά μεγάλη ελληνική παρατήρηση για το άνοιγμα.} e5");
    const { bytes } = await generatePdf(parsePgn(pgn), options({ includeComments: true, includeCovers: false }), fixtureFonts);
    expect(bytes.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages()).toHaveLength(7);
    expect(bytes.byteLength).toBeGreaterThan(10000);
    expect(new TextDecoder().decode(bytes)).not.toContain("/Subtype /Image");
  });
});
