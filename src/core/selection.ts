import type { GameRecord, PositionSnapshot, StudyMode } from "./types";

export function selectPositions(record: GameRecord, studyMode: StudyMode): readonly PositionSnapshot[] {
  if (studyMode === "all") return record.positions;

  const target = studyMode === "white" ? "White" : "Black";
  const selected: PositionSnapshot[] = [];
  for (let index = 1; index < record.positions.length; index += 1) {
    const position = record.positions[index];
    if (position.movedColor === target) {
      const before = record.positions[index - 1];
      if (!selected.includes(before)) selected.push(before);
      selected.push(position);
    }
  }

  if (selected.length === 0) return [record.positions[0]];
  if (!selected.includes(record.positions[0])) selected.unshift(record.positions[0]);
  return selected;
}
