import { createHash } from 'node:crypto';

export function hashAgentConfiguration(
  currentPrompt: string | null,
  configuration: Record<string, unknown>,
): string {
  return createHash('sha256').update(stableJson({ currentPrompt, configuration })).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
