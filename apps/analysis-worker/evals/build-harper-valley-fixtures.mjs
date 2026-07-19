import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_REPOSITORY = 'https://github.com/cricketclub/gridspace-stanford-harper-valley';
const SOURCE_REVISION = '0bd721e877c4a85d8c13ff837e68661ea6200a98';
const RAW_ROOT = `https://raw.githubusercontent.com/cricketclub/gridspace-stanford-harper-valley/${SOURCE_REVISION}/data`;

const cases = [
  {
    sourceId: '0002f70f7386445b',
    mustFlagChecks: [],
    mustClearChecks: ['customer_outcome', 'grounding_and_uncertainty'],
    mustRecommendTargets: [],
    mustNotRecommendTargets: ['prompt.core-instructions', 'prompt.fallback-boundaries'],
    rationale: 'The submitted replacement-card task matches the assigned debit-card task.',
  },
  {
    sourceId: '0df279dab5a44e6c',
    mustFlagChecks: [],
    mustClearChecks: ['customer_outcome', 'listening_and_context'],
    mustRecommendTargets: [],
    mustNotRecommendTargets: ['prompt.core-instructions', 'prompt.fallback-boundaries'],
    rationale: 'The requested appointment day and time were captured, confirmed, and submitted.',
  },
  {
    sourceId: '4640c702d4b3414d',
    mustFlagChecks: [],
    mustClearChecks: ['customer_outcome', 'listening_and_context'],
    mustRecommendTargets: [],
    mustNotRecommendTargets: ['prompt.core-instructions', 'prompt.fallback-boundaries'],
    rationale: 'The check order used the complete address and the source task submission matches.',
  },
  {
    sourceId: '0bbbedb40f224e9a',
    mustFlagChecks: ['customer_outcome'],
    mustClearChecks: [],
    mustRecommendTargets: ['prompt.fallback-boundaries'],
    mustNotRecommendTargets: [],
    rationale:
      'The agent requested an address but the call ended in noise and laughter without a clear customer-facing completion.',
  },
  {
    sourceId: '8e5f2787249d463f',
    mustFlagChecks: ['customer_outcome', 'listening_and_context'],
    mustClearChecks: [],
    mustRecommendTargets: ['prompt.core-instructions'],
    mustNotRecommendTargets: [],
    rationale:
      'The caller repeatedly said credit card, the agent repeatedly asked debit or credit, and the interaction ended before a confirmed resolution.',
  },
  {
    sourceId: '01f7ec3700424bc0',
    mustFlagChecks: ['customer_outcome', 'grounding_and_uncertainty'],
    mustClearChecks: [],
    mustRecommendTargets: ['prompt.fallback-boundaries'],
    mustNotRecommendTargets: [],
    rationale:
      'The verified task says the branch opens at 8:30 AM, while the agent told the caller 9:30 AM.',
  },
  {
    sourceId: 'b0d63ed287c04649',
    mustFlagChecks: ['customer_outcome', 'prompt_requirements'],
    mustClearChecks: [],
    mustRecommendTargets: ['prompt.core-instructions'],
    mustNotRecommendTargets: [],
    rationale:
      'The caller requested a bill payment, the conversation stopped before completion, and the submitted source task was replace card.',
  },
  {
    sourceId: '2ee2ac9dcf6e4e8e',
    mustFlagChecks: ['customer_outcome', 'listening_and_context'],
    mustClearChecks: [],
    mustRecommendTargets: ['prompt.core-instructions'],
    mustNotRecommendTargets: [],
    rationale:
      'The submitted address differs from the caller task and omits the postal code even though the agent claimed the checkbook was sent.',
  },
];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

function taskPrompt(task) {
  const { task_type: taskType, ...facts } = task;
  const verifiedFacts = Object.entries(facts)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('; ');
  return [
    'You are the Harper Valley National Bank phone agent.',
    `Complete the caller's ${taskType} request accurately and confirm critical details.`,
    verifiedFacts ? `Verified scenario facts: ${verifiedFacts}.` : '',
    'Do not claim completion unless the request was actually completed.',
  ]
    .filter(Boolean)
    .join(' ');
}

function highLevelTranscript(segments, field) {
  return segments
    .filter((segment) => segment[field].trim().length > 0)
    .map((segment) => {
      const speaker = segment.speaker_role === 'agent' ? 'bot' : 'human';
      return `${speaker}:${segment[field].trim()}`;
    })
    .join('\n');
}

function taskSubmissionMatches(task, responses) {
  const submitted = responses.at(-1)?.data;
  return submitted ? JSON.stringify(submitted) === JSON.stringify(task) : false;
}

async function buildCase(definition) {
  const [metadata, segments] = await Promise.all([
    fetchJson(`${RAW_ROOT}/metadata/${definition.sourceId}.json`),
    fetchJson(`${RAW_ROOT}/transcript/${definition.sourceId}.json`),
  ]);
  const task = metadata.tasks[0];
  const duration = Math.max(0, Math.ceil((metadata.end_time_ms - metadata.start_time_ms) / 1_000));
  const partnerRating = Number(metadata.caller.survey_response.data.partner_rating);

  return {
    id: `harper-valley-${definition.sourceId}`,
    name: `${task.task_type}: source call ${definition.sourceId}`,
    agentPrompt: taskPrompt(task),
    provenance: {
      dataset: 'Gridspace–Stanford Harper Valley',
      sourceId: definition.sourceId,
      sourceUrl: `${SOURCE_REPOSITORY}/blob/${SOURCE_REVISION}/data/transcript/${definition.sourceId}.json`,
      license: 'CC-BY-4.0',
      taskType: task.task_type,
      callerPartnerRating: Number.isFinite(partnerRating) ? partnerRating : null,
      taskSubmissionMatchesAssigned: taskSubmissionMatches(task, metadata.agent.responses),
    },
    referenceTranscript: highLevelTranscript(segments, 'human_transcript'),
    payload: {
      type: 'VoiceAiCallEnd',
      id: `eval-harper-${definition.sourceId}`,
      locationId: 'eval-location-harper-valley',
      agentId: 'eval-harper-valley-agent',
      createdAt: new Date(metadata.start_time_ms).toISOString(),
      duration,
      summary: `Caller contacted Harper Valley National Bank to ${task.task_type}.`,
      transcript: highLevelTranscript(segments, 'transcript'),
      translation: null,
      extractedData: {
        evaluationGroundTruth: task,
        sourceDataset: 'gridspace-stanford-harper-valley',
        sourceId: definition.sourceId,
        sourcePartnerRating: Number.isFinite(partnerRating) ? partnerRating : null,
      },
      executedCallActions: metadata.agent.responses.map((response, index) => ({
        actionType: 'SOURCE_TASK_SUBMISSION',
        actionName: response.data?.task_type ?? 'unknown',
        description: JSON.stringify(response.data ?? {}),
        executedAt: new Date(response.submit_time_ms).toISOString(),
        sourceSequence: index + 1,
      })),
      trialCall: true,
    },
    expectations: {
      annotationStatus: 'provisional_manual',
      mustFlagChecks: definition.mustFlagChecks,
      mustClearChecks: definition.mustClearChecks,
      mustRecommendTargets: definition.mustRecommendTargets,
      mustNotRecommendTargets: definition.mustNotRecommendTargets,
      rationale: definition.rationale,
    },
  };
}

const output = {
  schemaVersion: 1,
  name: 'Harper Valley HighLevel call evaluation suite',
  description:
    'A small, attributed evaluation slice formatted as HighLevel VoiceAiCallEnd payloads. Human expectations are provisional and must be reviewed before becoming a release gate.',
  provenance: {
    dataset: 'Gridspace–Stanford Harper Valley',
    repository: SOURCE_REPOSITORY,
    revision: SOURCE_REVISION,
    license: 'CC-BY-4.0',
  },
  cases: await Promise.all(cases.map(buildCase)),
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPaths = [resolve(scriptDirectory, 'harper-valley.highlevel.json')];
const serialized = `${JSON.stringify(output, null, 2)}\n`;
for (const outputPath of outputPaths) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized);
}
console.log(`Wrote ${output.cases.length} evaluation calls to ${outputPaths.join(' and ')}`);
