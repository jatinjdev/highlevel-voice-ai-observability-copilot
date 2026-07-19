import {
  criterionSetMembers,
  criterionSets,
  successCriteria,
  successCriterionVersions,
  voiceAgents,
} from '@copilot/database';
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { WorkerDatabaseService } from './database.service';
import type { EvaluationCriterion } from './evaluation.types';

const COMPILER_VERSION = 'success-criteria-compiler-v1';

interface CriterionTemplate {
  stableKey: string;
  title: string;
  criterionClass: EvaluationCriterion['criterionClass'];
  rule: string;
  applicability: Record<string, unknown>;
  instructions: string;
  requiredEvidence: string[];
  allowedTargets: string[];
}

export interface ResolvedCriterionSet {
  id: string;
  fingerprint: string;
  criteria: EvaluationCriterion[];
}

@Injectable()
export class CriteriaService {
  constructor(private readonly databaseService: WorkerDatabaseService) {}

  async resolve(
    agentId: string,
    configuration: Record<string, unknown>,
  ): Promise<ResolvedCriterionSet> {
    await this.ensureSystemCriteria(agentId, configuration);

    const rows = await this.databaseService.client
      .select({
        criterionId: successCriteria.id,
        criterionVersionId: successCriterionVersions.id,
        stableKey: successCriteria.stableKey,
        title: successCriterionVersions.title,
        origin: successCriteria.origin,
        criterionClass: successCriteria.criterionClass,
        naturalLanguageRule: successCriterionVersions.naturalLanguageRule,
        applicabilityDefinition: successCriterionVersions.applicabilityDefinition,
        evaluationInstructions: successCriterionVersions.evaluationInstructions,
        requiredEvidence: successCriterionVersions.requiredEvidence,
        allowedRecommendationTargetIds: successCriterionVersions.allowedRecommendationTargetIds,
      })
      .from(successCriteria)
      .innerJoin(
        successCriterionVersions,
        eq(successCriterionVersions.criterionId, successCriteria.id),
      )
      .where(
        and(eq(successCriteria.agentId, agentId), eq(successCriteria.lifecycleState, 'active')),
      )
      .orderBy(asc(successCriteria.createdAt), desc(successCriterionVersions.version));

    const latestByCriterion = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByCriterion.has(row.criterionId)) latestByCriterion.set(row.criterionId, row);
    }
    const criteria = [...latestByCriterion.values()] as EvaluationCriterion[];
    if (criteria.length === 0) throw new Error(`Agent ${agentId} has no active Success Criteria.`);

    const fingerprint = hash(
      criteria
        .map(({ criterionVersionId }) => criterionVersionId)
        .sort()
        .join(':'),
    );
    const [existing] = await this.databaseService.client
      .select({ id: criterionSets.id, fingerprint: criterionSets.fingerprint })
      .from(criterionSets)
      .where(and(eq(criterionSets.agentId, agentId), eq(criterionSets.fingerprint, fingerprint)))
      .limit(1);
    if (existing) {
      if (!(await this.isActiveSet(existing.id))) await this.activateSet(agentId, existing.id);
      return { ...existing, criteria };
    }

    return this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .select({ id: voiceAgents.id })
        .from(voiceAgents)
        .where(eq(voiceAgents.id, agentId))
        .for('update');
      const [createdByConcurrentResolver] = await transaction
        .select({ id: criterionSets.id, fingerprint: criterionSets.fingerprint })
        .from(criterionSets)
        .where(and(eq(criterionSets.agentId, agentId), eq(criterionSets.fingerprint, fingerprint)))
        .limit(1);
      if (createdByConcurrentResolver) {
        await transaction
          .update(criterionSets)
          .set({ active: false })
          .where(eq(criterionSets.agentId, agentId));
        await transaction
          .update(criterionSets)
          .set({ active: true })
          .where(eq(criterionSets.id, createdByConcurrentResolver.id));
        return { ...createdByConcurrentResolver, criteria };
      }
      const [latest] = await transaction
        .select({ version: criterionSets.version })
        .from(criterionSets)
        .where(eq(criterionSets.agentId, agentId))
        .orderBy(desc(criterionSets.version))
        .limit(1);
      await transaction
        .update(criterionSets)
        .set({ active: false })
        .where(eq(criterionSets.agentId, agentId));
      const [created] = await transaction
        .insert(criterionSets)
        .values({ agentId, version: (latest?.version ?? 0) + 1, fingerprint, active: true })
        .returning({ id: criterionSets.id, fingerprint: criterionSets.fingerprint });
      if (!created) throw new Error('Criterion Set creation returned no record.');
      await transaction.insert(criterionSetMembers).values(
        criteria.map((criterion, displayOrder) => ({
          criterionSetId: created.id,
          criterionVersionId: criterion.criterionVersionId,
          displayOrder,
        })),
      );
      return { ...created, criteria };
    });
  }

  private async ensureSystemCriteria(
    agentId: string,
    configuration: Record<string, unknown>,
  ): Promise<void> {
    const templates = [...UNIVERSAL_CRITERIA];
    const prompt = readPrompt(configuration);
    if (prompt) {
      templates.push({
        stableKey: 'agent.prompt_requirements',
        title: 'Agent-specific prompt requirements',
        criterionClass: 'adherence',
        rule: `When applicable to the caller's request, follow these configured instructions without contradiction:\n${prompt}`,
        applicability: { appliesWhen: 'A configured prompt instruction is exercised by the call.' },
        instructions:
          'Evaluate only requirements actually triggered by this call. Do not penalize unexercised branches.',
        requiredEvidence: ['current agent prompt', 'quoted transcript evidence'],
        allowedTargets: [
          'prompt.core-instructions',
          'prompt.action-trigger-instructions',
          'prompt.fallback-boundaries',
          'prompt.custom-values',
          'greeting.inbound-outbound',
        ],
      });
    }

    for (const template of templates) {
      await this.ensureCriterion(
        agentId,
        template,
        template.stableKey.startsWith('agent.') ? 'prompt_generated' : 'universal',
      );
    }
  }

  private async ensureCriterion(
    agentId: string,
    template: CriterionTemplate,
    origin: 'universal' | 'prompt_generated',
  ): Promise<void> {
    const [created] = await this.databaseService.client
      .insert(successCriteria)
      .values({
        agentId,
        stableKey: template.stableKey,
        origin,
        criterionClass: template.criterionClass,
        lifecycleState: 'active',
      })
      .onConflictDoNothing({ target: [successCriteria.agentId, successCriteria.stableKey] })
      .returning({ id: successCriteria.id });
    const [criterion] = created
      ? [created]
      : await this.databaseService.client
          .select({ id: successCriteria.id })
          .from(successCriteria)
          .where(
            and(
              eq(successCriteria.agentId, agentId),
              eq(successCriteria.stableKey, template.stableKey),
            ),
          )
          .limit(1);
    if (!criterion) throw new Error(`Could not ensure criterion ${template.stableKey}.`);

    await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .select({ id: successCriteria.id })
        .from(successCriteria)
        .where(eq(successCriteria.id, criterion.id))
        .for('update');

      const definitionFingerprint = hash(JSON.stringify(template));
      const [latest] = await transaction
        .select({
          version: successCriterionVersions.version,
          sourceReferences: successCriterionVersions.sourceReferences,
        })
        .from(successCriterionVersions)
        .where(eq(successCriterionVersions.criterionId, criterion.id))
        .orderBy(desc(successCriterionVersions.version))
        .limit(1);
      if (latest?.sourceReferences.includes(`definition:${definitionFingerprint}`)) return;

      await transaction.insert(successCriterionVersions).values({
        criterionId: criterion.id,
        version: (latest?.version ?? 0) + 1,
        title: template.title,
        naturalLanguageRule: template.rule,
        applicabilityDefinition: template.applicability,
        evaluationInstructions: template.instructions,
        requiredEvidence: template.requiredEvidence,
        severityPolicy: { fail: 'Observable violation of this criterion' },
        sourceReferences: [`definition:${definitionFingerprint}`],
        allowedRecommendationTargetIds: template.allowedTargets,
        compilerVersion: COMPILER_VERSION,
      });
    });
  }

  private async isActiveSet(id: string): Promise<boolean> {
    const [row] = await this.databaseService.client
      .select({ active: criterionSets.active })
      .from(criterionSets)
      .where(eq(criterionSets.id, id))
      .limit(1);
    return row?.active ?? false;
  }

  private async activateSet(agentId: string, id: string): Promise<void> {
    await this.databaseService.client.transaction(async (transaction) => {
      await transaction
        .update(criterionSets)
        .set({ active: false })
        .where(eq(criterionSets.agentId, agentId));
      await transaction.update(criterionSets).set({ active: true }).where(eq(criterionSets.id, id));
    });
  }
}

const UNIVERSAL_CRITERIA: CriterionTemplate[] = [
  {
    stableKey: 'universal.customer_outcome',
    title: 'Customer outcome',
    criterionClass: 'outcome',
    rule: "Resolve the caller's actual request, materially advance it, or establish a clear and honest next step.",
    applicability: { appliesWhen: 'Every substantive customer call.' },
    instructions: 'Judge the outcome against the request expressed in this call.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: [
      'prompt.core-instructions',
      'prompt.fallback-boundaries',
      'knowledge-base.attach-or-create',
      'knowledge-base.content-gap',
      'action.custom-or-mcp',
      'action.workflow',
      'post-call.workflow-and-notifications',
    ],
  },
  {
    stableKey: 'universal.safe_and_trustworthy',
    title: 'Safe and trustworthy behavior',
    criterionClass: 'safety',
    rule: 'Avoid hostile, deceptive, discriminatory, unsafe, fabricated, privacy-invasive, or unjustifiably certain claims.',
    applicability: { appliesWhen: 'Every call.' },
    instructions: 'Fail only when the transcript contains an observable breach of this rule.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: ['prompt.fallback-boundaries', 'prompt.core-instructions'],
  },
  {
    stableKey: 'universal.agent_caused_frustration',
    title: 'Agent-caused frustration',
    criterionClass: 'diagnostic',
    rule: 'Do not cause or worsen frustration by ignoring, contradicting, needlessly repeating, or mishandling the caller.',
    applicability: { appliesWhen: 'The transcript contains an observable interaction.' },
    instructions: 'Do not penalize negative sentiment that existed before the agent response.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: ['prompt.core-instructions', 'prompt.fallback-boundaries'],
  },
  {
    stableKey: 'universal.listening_and_context',
    title: 'Listening and context retention',
    criterionClass: 'diagnostic',
    rule: 'Retain established facts and avoid making the caller restate information that was ignored.',
    applicability: { appliesWhen: 'The caller supplies facts or answers questions.' },
    instructions: 'Mark not applicable when there is no information to retain.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: ['prompt.core-instructions'],
  },
  {
    stableKey: 'universal.relevance_and_clarity',
    title: 'Relevance and clarity',
    criterionClass: 'diagnostic',
    rule: 'Respond directly and clearly without confusing, evasive, or needless repetition.',
    applicability: { appliesWhen: 'Every substantive exchange.' },
    instructions: 'Pass harmless stylistic differences that do not reduce clarity.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: ['prompt.core-instructions'],
  },
  {
    stableKey: 'universal.appropriate_empathy',
    title: 'Appropriate empathy',
    criterionClass: 'diagnostic',
    rule: 'Acknowledge emotion or inconvenience when the situation calls for it.',
    applicability: { appliesWhen: 'The caller expresses distress, anger, loss, or inconvenience.' },
    instructions: 'Do not require emotional language in routine transactional calls.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: ['prompt.core-instructions'],
  },
  {
    stableKey: 'universal.grounding_and_uncertainty',
    title: 'Grounding and uncertainty',
    criterionClass: 'safety',
    rule: 'Do not invent business facts; communicate uncertainty honestly when evidence is absent.',
    applicability: { appliesWhen: 'The agent supplies a factual answer or claim.' },
    instructions: 'Distinguish missing knowledge from a prompt-behavior defect.',
    requiredEvidence: ['quoted transcript evidence', 'current knowledge configuration'],
    allowedTargets: [
      'prompt.fallback-boundaries',
      'knowledge-base.attach-or-create',
      'knowledge-base.content-gap',
    ],
  },
  {
    stableKey: 'universal.escalation_judgment',
    title: 'Escalation judgment',
    criterionClass: 'outcome',
    rule: 'When resolution is impossible or risk is high, establish an appropriate human next step.',
    applicability: { appliesWhen: 'Resolution is impossible, unsupported, or high-risk.' },
    instructions: 'Mark not applicable when escalation is unnecessary.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedTargets: [
      'prompt.fallback-boundaries',
      'action.custom-or-mcp',
      'action.workflow',
      'post-call.workflow-and-notifications',
    ],
  },
];

export function systemCriterionTemplates(): CriterionTemplate[] {
  return UNIVERSAL_CRITERIA;
}

function readPrompt(configuration: Record<string, unknown>): string | null {
  const candidate = configuration.agentPrompt ?? configuration.prompt;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  const raw = configuration.raw;
  if (raw && typeof raw === 'object') return readPrompt(raw as Record<string, unknown>);
  return null;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
