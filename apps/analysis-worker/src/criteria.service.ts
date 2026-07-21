import { DEFAULT_SUCCESS_CRITERIA, normalizeCriterionName } from '@copilot/contracts';
import { successCriteria, voiceAgentConfigurations } from '@copilot/database';
import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { WorkerDatabaseService } from './database.service';
import type { EvaluationCriterion } from './evaluation.types';

@Injectable()
export class CriteriaService {
  constructor(private readonly databaseService: WorkerDatabaseService) {}

  async listForEvaluation(agentId: string): Promise<EvaluationCriterion[]> {
    await this.ensureDefaults(agentId);

    return this.databaseService.client
      .select({
        criterionId: successCriteria.id,
        description: successCriteria.description,
      })
      .from(successCriteria)
      .where(eq(successCriteria.agentId, agentId))
      .orderBy(asc(successCriteria.createdAt));
  }

  private async ensureDefaults(agentId: string): Promise<void> {
    await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .insert(voiceAgentConfigurations)
        .values({ agentId })
        .onConflictDoNothing({ target: voiceAgentConfigurations.agentId });
      const [configuration] = await transaction
        .select({ initializedAt: voiceAgentConfigurations.criteriaInitializedAt })
        .from(voiceAgentConfigurations)
        .where(eq(voiceAgentConfigurations.agentId, agentId))
        .for('update');
      if (configuration?.initializedAt) return;

      await transaction
        .insert(successCriteria)
        .values(
          DEFAULT_SUCCESS_CRITERIA.map((criterion) => ({
            agentId,
            name: criterion.name,
            normalizedName: normalizeCriterionName(criterion.name),
            description: criterion.description,
            source: 'default',
          })),
        )
        .onConflictDoNothing({ target: [successCriteria.agentId, successCriteria.normalizedName] });
      await transaction
        .update(voiceAgentConfigurations)
        .set({ criteriaInitializedAt: new Date(), updatedAt: new Date() })
        .where(eq(voiceAgentConfigurations.agentId, agentId));
    });
  }
}
