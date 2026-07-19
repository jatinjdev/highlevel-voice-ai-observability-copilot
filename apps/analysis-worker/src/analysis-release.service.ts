import { analysisReleases } from '@copilot/database';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { ACTIVE_ANALYSIS_DEFINITION } from './analysis-definition';
import { WorkerDatabaseService } from './database.service';

export interface ResolvedAnalysisRelease {
  id: string;
  releaseKey: string;
  definition: typeof ACTIVE_ANALYSIS_DEFINITION;
}

export interface AnalysisRuntimeIdentity {
  provider: string | null;
  model: string | null;
  modelParameters?: Record<string, unknown>;
}

export function analysisReleaseIdentity(runtime: AnalysisRuntimeIdentity) {
  const modelParameters = runtime.modelParameters ?? {};
  const definition = {
    ...ACTIVE_ANALYSIS_DEFINITION,
    provider: runtime.provider,
    model: runtime.model,
    modelParameters,
  };
  return {
    releaseKey: createHash('sha256').update(stableJson(definition)).digest('hex'),
    modelParameters,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class AnalysisReleaseService {
  constructor(private readonly databaseService: WorkerDatabaseService) {}

  async resolve(runtime: AnalysisRuntimeIdentity): Promise<ResolvedAnalysisRelease> {
    const { releaseKey, modelParameters } = analysisReleaseIdentity(runtime);

    const [existing] = await this.databaseService.client
      .select({ id: analysisReleases.id })
      .from(analysisReleases)
      .where(eq(analysisReleases.releaseKey, releaseKey))
      .limit(1);
    if (existing) return { ...existing, releaseKey, definition: ACTIVE_ANALYSIS_DEFINITION };

    const [created] = await this.databaseService.client
      .insert(analysisReleases)
      .values({
        releaseKey,
        version: ACTIVE_ANALYSIS_DEFINITION.version,
        semanticPromptVersion: ACTIVE_ANALYSIS_DEFINITION.semanticPromptVersion,
        evaluatorVersion: ACTIVE_ANALYSIS_DEFINITION.evaluatorVersion,
        deterministicEvaluatorVersion: ACTIVE_ANALYSIS_DEFINITION.deterministicEvaluatorVersion,
        criterionCompilerVersion: ACTIVE_ANALYSIS_DEFINITION.criterionCompilerVersion,
        recommendationCatalogueVersion: ACTIVE_ANALYSIS_DEFINITION.recommendationCatalogueVersion,
        outputSchemaVersion: ACTIVE_ANALYSIS_DEFINITION.outputSchemaVersion,
        provider: runtime.provider,
        model: runtime.model,
        modelParameters,
      })
      .onConflictDoNothing({ target: analysisReleases.releaseKey })
      .returning({ id: analysisReleases.id });
    if (created) return { ...created, releaseKey, definition: ACTIVE_ANALYSIS_DEFINITION };

    const [concurrent] = await this.databaseService.client
      .select({ id: analysisReleases.id })
      .from(analysisReleases)
      .where(eq(analysisReleases.releaseKey, releaseKey))
      .limit(1);
    if (!concurrent) throw new Error('Analysis Release could not be resolved.');
    return { ...concurrent, releaseKey, definition: ACTIVE_ANALYSIS_DEFINITION };
  }
}
