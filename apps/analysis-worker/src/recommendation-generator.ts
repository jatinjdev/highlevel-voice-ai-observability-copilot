import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  LANGUAGE_MODEL,
  type StructuredGenerationRequest,
  type StructuredOutputLanguageModel,
} from './language-model';
import {
  CONFIGURATION_RECOMMENDATION_CAPABILITY_IDS,
  PROMPT_RECOMMENDATION_CAPABILITY_IDS,
  renderRecommendationCapabilityCatalogue,
} from './recommendation-capabilities';

const recommendationSchema = z.discriminatedUnion('changeType', [
  z.object({
    changeType: z.literal('prompt'),
    capabilityId: z.enum(PROMPT_RECOMMENDATION_CAPABILITY_IDS),
    headline: z.string().min(1),
    advice: z.string().min(1),
    promptRemovals: z.array(z.string().min(1)).max(3),
    promptAddition: z.string().min(1).nullable(),
  }),
  z.object({
    changeType: z.literal('configuration'),
    capabilityId: z.enum(CONFIGURATION_RECOMMENDATION_CAPABILITY_IDS),
    headline: z.string().min(1),
    advice: z.string().min(1),
    promptRemovals: z.array(z.string()).length(0),
    promptAddition: z.null(),
  }),
]);

function recommendationOutputSchema(currentPrompt: string) {
  return z
    .object({
      decision: z.enum(['change_required', 'no_supported_change']),
      explanation: z.string().min(1),
      recommendation: recommendationSchema.nullable(),
    })
    .superRefine((output, context) => {
      if (output.decision === 'change_required' && !output.recommendation) {
        context.addIssue({
          code: 'custom',
          path: ['recommendation'],
          message: 'A change_required decision requires one recommendation.',
        });
        return;
      }
      if (output.decision === 'no_supported_change' && output.recommendation) {
        context.addIssue({
          code: 'custom',
          path: ['recommendation'],
          message: 'A no_supported_change decision cannot include a recommendation.',
        });
        return;
      }
      if (!output.recommendation) return;

      if (output.recommendation.changeType === 'prompt') {
        if (
          output.recommendation.promptRemovals.length === 0 &&
          output.recommendation.promptAddition === null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['recommendation'],
            message: 'A prompt recommendation requires a removal, an addition, or both.',
          });
        }

        const seen = new Set<string>();
        output.recommendation.promptRemovals.forEach((removal, index) => {
          if (!currentPrompt.includes(removal)) {
            context.addIssue({
              code: 'custom',
              path: ['recommendation', 'promptRemovals', index],
              message:
                'Each removal must be one contiguous verbatim fragment of the current prompt.',
            });
          }
          if (seen.has(removal)) {
            context.addIssue({
              code: 'custom',
              path: ['recommendation', 'promptRemovals', index],
              message: 'Prompt removals must be unique.',
            });
          }
          seen.add(removal);
        });
      }
    });
}

export type RecommendationGenerationOutput = z.infer<ReturnType<typeof recommendationOutputSchema>>;

export interface RecommendationFailure {
  rationale: string;
  quotes: string[];
  actions: string[];
}

@Injectable()
export class RecommendationGenerator {
  constructor(
    @Inject(LANGUAGE_MODEL)
    private readonly languageModel: StructuredOutputLanguageModel | null,
  ) {}

  generate(input: {
    criterionDescription: string;
    currentPrompt: string;
    currentConfiguration: Record<string, unknown>;
    failures: RecommendationFailure[];
  }): Promise<RecommendationGenerationOutput> {
    if (!this.languageModel) {
      throw new Error('A language-model provider is required to generate recommendations.');
    }
    return this.languageModel.generateObject(buildRecommendationRequest(input));
  }
}

export function buildRecommendationRequest(input: {
  criterionDescription: string;
  currentPrompt: string;
  currentConfiguration: Record<string, unknown>;
  failures: RecommendationFailure[];
}): StructuredGenerationRequest<ReturnType<typeof recommendationOutputSchema>> {
  return {
    schema: recommendationOutputSchema(input.currentPrompt),
    schemaName: 'agent_recommendation',
    systemPrompt: `You recommend one change to a HighLevel Voice AI agent for one repeatedly failed Success Criterion.

DECISION RULES
1. Every Success Criterion is mandatory. Words such as "should", "must", and "expected to" all define firm requirements.
2. Use only the supplied current configuration and failed-call evidence. Do not assume a historical call used the current configuration.
3. Return "change_required" when one documented change is justified and the current configuration does not already resolve the specific concern.
4. A current prompt instruction that causes or contradicts the failed criterion always means "change_required". Revising the current prompt is fully within scope.
5. Return "no_supported_change" only in one of these cases: (a) quote the exact current instruction or setting that already resolves the concern and verify that nothing conflicts with it; or (b) name the specific evidence type required before any catalogue capability can be recommended.
6. If your explanation identifies a missing instruction, conflicting instruction, missing capability, or incorrect setting, the only logically valid decision is "change_required".

CHOOSING THE CHANGE
- Choose exactly one capability from the catalogue below. Prefer the narrowest, lowest-risk capability supported by the evidence.
- Use a Prompt capability for missing or conflicting conversational instructions.
- Use Actions, Knowledge Base, greeting, or another configuration capability when the agent lacks data or a product capability that prompt text cannot provide.
- If a criterion requires an operation such as booking, transfer, SMS, workflow execution, or contact update and the corresponding action is absent, recommend configuring the native Action. Never paste an instruction that tells the agent to use an unconfigured action.
- Use advanced audio, timing, transcription, pronunciation, temperature, model, or voice capabilities only when their listed evidence is actually present. Transcript text alone is not audio evidence.
- Never use a prompt change to fix speech recognition, pronunciation, noise, timing, or other acoustic behavior. Without recording-based evidence, return "no_supported_change" for that kind of diagnosis.
- Never invent a HighLevel setting, action, workflow, calendar, destination, knowledge source, custom value, or exact setting value.

PROMPT PATCH RULES
- A Prompt recommendation may remove conflicting text, add paste-ready instruction text, or do both. It must contain at least one removal or one addition.
- If deleting a conflicting instruction fully resolves the criterion without needing replacement guidance, return its exact text in promptRemovals and set promptAddition to null.
- If replacement guidance is needed, promptAddition is paste-ready agent instruction text, not advice such as "add a rule".
- Each promptRemovals item is copied character-for-character from <current_prompt> and must be one contiguous prompt fragment. Put non-contiguous conflicting lines in separate array items; never concatenate or reformat them.
- If the prompt only lacks guidance, promptRemovals is [] and promptAddition contains the new paste-ready instruction.
- For every non-Prompt capability, promptRemovals is [] and promptAddition is null; advice states the direct manual change and the evidence-based constraint.
- Paste-ready text must not promise an action, source, destination, workflow, handoff, or business fact that is absent from the supplied current configuration.
- For a prohibitive criterion such as "do not quote prices", prefer a narrow prohibition and neutral response. Do not add a human handoff, callback, lookup, or follow-up unless that exact capability is present in the current configuration.

AVAILABLE EVIDENCE
- Current public HighLevel agent configuration, including configured actions when returned.
- Recent failure rationales, cited transcript lines, and cited executed action events.
- No call recording, acoustic comparison, trusted transcript ground truth, or precise turn timing is supplied unless explicitly present in those inputs.

DOCUMENTED CAPABILITY CATALOGUE
${renderRecommendationCapabilityCatalogue()}

DECISION EXAMPLES
- Two separate current prompt lines tell the agent to estimate and fabricate prices, while the criterion forbids price quotes: change_required; Prompt; return those exact lines as two separate promptRemovals items and provide one neutral replacement.
- One current prompt line tells the agent to be rude, while another existing instruction already requires a polite tone: change_required; Prompt; return the conflicting line in promptRemovals and set promptAddition to null.
- Calls require appointment booking, but the current action inventory has no booking action: change_required; Actions > Book Appointment; no prompt patch; advise the user to connect an eligible calendar and configure fallback behavior without inventing either.
- A transcript allegedly misspells a brand name, but no reviewed audio or trusted ground truth is supplied: no_supported_change; recommendation null; state that recording-to-transcript evidence is required. Do not propose prompt text or boosted keywords.

Return only the requested schema. Keep the headline, explanation, and advice concise. Do not reveal chain-of-thought.`,
    userPrompt: `<success_criterion>
${escapeDelimited(input.criterionDescription)}
</success_criterion>

<current_prompt>
${escapeDelimited(input.currentPrompt)}
</current_prompt>

<current_configuration>
${escapeDelimited(JSON.stringify(sanitizeConfiguration(input.currentConfiguration), null, 2))}
</current_configuration>

<observed_failures>
${input.failures.map(renderFailure).join('\n\n')}
</observed_failures>`,
  };
}

function renderFailure(failure: RecommendationFailure, index: number): string {
  const quotes = failure.quotes.length
    ? failure.quotes.map((quote) => `- ${escapeDelimited(quote)}`).join('\n')
    : '- No transcript quote was retained.';
  const actions = failure.actions.length
    ? failure.actions.map((action) => `- ${escapeDelimited(action)}`).join('\n')
    : '- No executed action evidence was retained.';
  return `Failure ${index + 1}: ${escapeDelimited(failure.rationale)}\nTranscript evidence:\n${quotes}\nExecuted action evidence:\n${actions}`;
}

function sanitizeConfiguration(value: unknown, key = ''): unknown {
  if (/secret|token|password|authorization|api.?key/i.test(key)) return '[REDACTED]';
  if (/^(agentPrompt|currentPrompt)$/i.test(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeConfiguration(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([childKey, childValue]) => [childKey, sanitizeConfiguration(childValue, childKey)])
        .filter((entry) => entry[1] !== undefined),
    );
  }
  if (typeof value === 'string') return redactContactDetails(value);
  return value;
}

function redactContactDetails(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, '[PHONE]');
}

function escapeDelimited(value: string): string {
  return value.replaceAll('<', '&lt;').replaceAll('>', '&gt;').trim();
}
