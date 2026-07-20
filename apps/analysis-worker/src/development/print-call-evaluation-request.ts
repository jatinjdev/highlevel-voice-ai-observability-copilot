import { buildCriterionEvaluationRequest } from '../criterion-evaluator';
import type { CallEvaluationInput } from '../evaluation.types';

const input: CallEvaluationInput = {
  callId: 'preview-call',
  agentId: 'preview-agent',
  durationSeconds: 30,
  criteria: [
    {
      criterionId: 'preview-criterion',
      description:
        'Before completing an order, the agent must repeat the final items and ask the caller to confirm.',
    },
  ],
  turns: [
    { id: 'turn-1', ordinal: 1, speaker: 'customer', text: 'I would like one chocolate cake.' },
    { id: 'turn-2', ordinal: 2, speaker: 'agent', text: 'Your order is placed.' },
  ],
  actionEvents: [],
};

const { request } = buildCriterionEvaluationRequest(input);
process.stdout.write(
  `${JSON.stringify({ system: request.systemPrompt, user: request.userPrompt }, null, 2)}\n`,
);
