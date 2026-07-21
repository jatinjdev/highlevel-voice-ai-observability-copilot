import {
  MAX_SUCCESS_CRITERIA_PER_AGENT,
  normalizeCriterionName,
  type SuccessCriterion,
} from '@copilot/contracts';
import { locations, successCriteria, voiceAgents } from '@copilot/database';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';

type CriterionWithoutDistribution = Omit<SuccessCriterion, 'resultDistribution'>;

@Injectable()
export class SuccessCriteriaService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(locationId: string, agentId: string, name: string, description: string) {
    await this.requireAgent(locationId, agentId);
    const [existingCount] = await this.databaseService.client
      .select({ value: count() })
      .from(successCriteria)
      .where(eq(successCriteria.agentId, agentId));
    if ((existingCount?.value ?? 0) >= MAX_SUCCESS_CRITERIA_PER_AGENT) {
      throw new UnprocessableEntityException(
        `A Voice Agent can have at most ${MAX_SUCCESS_CRITERIA_PER_AGENT} Success Criteria.`,
      );
    }
    const normalizedName = normalizeCriterionName(name);
    const [criterion] = await this.databaseService.client
      .insert(successCriteria)
      .values({
        agentId,
        name: name.trim(),
        normalizedName,
        description: description.trim(),
        source: 'user',
      })
      .onConflictDoNothing({ target: [successCriteria.agentId, successCriteria.normalizedName] })
      .returning();
    if (!criterion)
      throw new ConflictException('A Success Criterion with this name already exists.');
    return { criterion: serializeCriterion(criterion) };
  }

  async remove(locationId: string, agentId: string, criterionId: string): Promise<void> {
    await this.requireCriterion(locationId, agentId, criterionId);
    await this.databaseService.client
      .delete(successCriteria)
      .where(eq(successCriteria.id, criterionId));
  }

  private async requireAgent(locationId: string, agentId: string) {
    const [agent] = await this.databaseService.client
      .select({ id: voiceAgents.id })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(and(eq(voiceAgents.id, agentId), eq(locations.highLevelLocationId, locationId)))
      .limit(1);
    if (!agent) throw new NotFoundException('Voice Agent was not found for this location.');
    return agent;
  }

  private async requireCriterion(locationId: string, agentId: string, criterionId: string) {
    await this.requireAgent(locationId, agentId);
    const [criterion] = await this.databaseService.client
      .select()
      .from(successCriteria)
      .where(and(eq(successCriteria.id, criterionId), eq(successCriteria.agentId, agentId)))
      .limit(1);
    if (!criterion) throw new NotFoundException('Success Criterion was not found for this agent.');
    return criterion;
  }
}

function serializeCriterion(
  criterion: typeof successCriteria.$inferSelect,
): CriterionWithoutDistribution {
  return {
    id: criterion.id,
    name: criterion.name,
    description: criterion.description,
    source: criterion.source === 'default' ? 'default' : 'user',
  };
}
