import type { CallAnalysisDetail } from '@copilot/contracts';

type CriterionResult = CallAnalysisDetail['criterionResults'][number];

export interface TurnAnnotation {
  key: string;
  criterionId: string;
  title: string;
  explanation: string;
  turnId: string;
  turnOrdinal: number;
  text: string;
}

export interface TurnSegment {
  text: string;
  annotationKey: string | null;
}

export type TurnAnnotationIndex = Map<string, TurnAnnotation[]>;

export function buildTurnAnnotations(results: CriterionResult[]): TurnAnnotationIndex {
  const annotations: TurnAnnotationIndex = new Map();
  for (const result of results) {
    if (result.result !== 'fail') continue;
    for (const evidence of result.evidence) {
      const annotation: TurnAnnotation = {
        key: `criterion:${result.id}:${evidence.turnId}`,
        criterionId: result.criterionId,
        title: result.criterionName,
        explanation: result.rationale,
        turnId: evidence.turnId,
        turnOrdinal: evidence.turnOrdinal,
        text: evidence.text,
      };
      annotations.set(evidence.turnId, [...(annotations.get(evidence.turnId) ?? []), annotation]);
    }
  }
  return annotations;
}

export function findAnnotation(
  annotations: TurnAnnotationIndex,
  key: string | null,
): TurnAnnotation | null {
  if (!key) return null;
  for (const values of annotations.values()) {
    const annotation = values.find((item) => item.key === key);
    if (annotation) return annotation;
  }
  return null;
}

export function firstCriterionAnnotationKey(result: CriterionResult): string | null {
  const evidence = result.evidence[0];
  return evidence ? `criterion:${result.id}:${evidence.turnId}` : null;
}

export function segmentsForTurn(
  annotations: TurnAnnotationIndex,
  selectedAnnotationKey: string | null,
  turnId: string,
  text: string,
): TurnSegment[] {
  const ranges = (annotations.get(turnId) ?? [])
    .map((annotation) => {
      const start = text.indexOf(annotation.text);
      return { start, end: start + annotation.text.length, annotation };
    })
    .filter(({ start, end }) => start >= 0 && end > start)
    .sort(
      (left, right) =>
        left.start - right.start ||
        Number(right.annotation.key === selectedAnnotationKey) -
          Number(left.annotation.key === selectedAnnotationKey),
    );
  if (!ranges.length) return [{ text, annotationKey: null }];

  const segments: TurnSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor)
      segments.push({ text: text.slice(cursor, range.start), annotationKey: null });
    segments.push({
      text: text.slice(range.start, range.end),
      annotationKey: range.annotation.key,
    });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), annotationKey: null });
  return segments;
}
