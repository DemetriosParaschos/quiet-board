import "./styles.css";

import { MAX_PGN_BYTES, DEFAULT_OPTIONS, type Compact, type ExportOptions, type Orientation, type PageSize, type StudyMode } from "./core/types";
import type { FontBytes } from "./pdf/generator";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Quiet Board could not find ${selector}.`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#export-form");
const pgnText = requiredElement<HTMLTextAreaElement>("#pgn-text");
const pgnFile = requiredElement<HTMLInputElement>("#pgn-file");
const fileError = requiredElement<HTMLElement>("#file-error");
const formError = requiredElement<HTMLElement>("#form-error");
const formStatus = requiredElement<HTMLElement>("#form-status");
const generateButton = requiredElement<HTMLButtonElement>("#generate-button");
const previewCard = requiredElement<HTMLElement>("#preview-card");
const previewHeading = requiredElement<HTMLElement>("#preview-heading");
const previewFrame = requiredElement<HTMLIFrameElement>("#pdf-preview");
const downloadLink = requiredElement<HTMLAnchorElement>("#download-pdf");
const previewFilename = requiredElement<HTMLElement>("#preview-filename");
const previewSize = requiredElement<HTMLElement>("#preview-size");

let currentPdfUrl: string | undefined;
let bundledFonts: Promise<FontBytes> | undefined;

function showError(message: string): void {
  formError.textContent = message;
  formError.hidden = false;
  formStatus.textContent = "";
}

function clearError(): void {
  formError.hidden = true;
  formError.textContent = "";
  fileError.hidden = true;
  fileError.textContent = "";
}

function selectedValue<T extends string>(name: string, fallback: T): T {
  return (new FormData(form).get(name) as T | null) ?? fallback;
}

function getOptions(): ExportOptions {
  return {
    studyMode: selectedValue<StudyMode>("study_mode", DEFAULT_OPTIONS.studyMode),
    orientation: selectedValue<Orientation>("orientation", DEFAULT_OPTIONS.orientation),
    pageSize: selectedValue<PageSize>("page_size", DEFAULT_OPTIONS.pageSize),
    compact: Number(selectedValue("compact", String(DEFAULT_OPTIONS.compact))) as Compact,
    showLastMove: new FormData(form).has("show_last_move"),
    showHistory: new FormData(form).has("show_history"),
    showPlayers: new FormData(form).has("show_players"),
    includeComments: new FormData(form).has("include_comments"),
    includeCovers: new FormData(form).has("include_covers"),
  };
}

async function fileText(file: File): Promise<string> {
  if (file.size > MAX_PGN_BYTES) throw new Error("The PGN file must be 512 KB or smaller.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("The PGN file must be UTF-8 text.");
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

pgnFile.addEventListener("change", () => {
  fileError.hidden = true;
  if (pgnFile.files?.[0]) fileError.textContent = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const file = pgnFile.files?.[0];
  const pasted = pgnText.value.trim();
  if (pasted && file) {
    showError("Paste PGN text or upload a PGN file, not both.");
    return;
  }
  if (!pasted && !file) {
    showError("Add PGN text or choose a .pgn file to continue.");
    return;
  }

  generateButton.disabled = true;
  generateButton.textContent = "Generating…";
  formStatus.textContent = "Reading and validating the PGN locally…";
  try {
    const source = file ? await fileText(file) : pgnText.value;
    const [{ parsePgn }, pdfModule] = await Promise.all([import("./core/pgn"), import("./pdf/generator")]);
    const records = parsePgn(source);
    bundledFonts ??= pdfModule.loadBundledFontBytes();
    const { bytes, filename } = await pdfModule.generatePdf(records, getOptions(), await bundledFonts);
    if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
    currentPdfUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
    previewFrame.src = currentPdfUrl;
    downloadLink.href = currentPdfUrl;
    downloadLink.download = filename;
    previewFilename.textContent = filename;
    previewSize.textContent = `${formatBytes(bytes.byteLength)} · held in memory only`;
    previewCard.hidden = false;
    formStatus.textContent = `${records.length} game${records.length === 1 ? "" : "s"} ready. The PDF was generated on this device.`;
    previewHeading.focus({ preventScroll: true });
    previewCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not generate the study PDF.");
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = "Generate &amp; preview <span aria-hidden=\"true\">→</span>";
  }
});
