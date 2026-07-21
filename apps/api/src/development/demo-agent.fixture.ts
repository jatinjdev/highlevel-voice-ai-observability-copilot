import { criterionStatusSchema, MAX_SUCCESS_CRITERIA_PER_AGENT } from '@copilot/contracts';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const demoActionSchema = z.object({
  actionType: z.string().min(1).optional(),
  actionName: z.string().min(1).optional(),
  outcome: z.string().min(1).optional(),
  resultSummary: z.record(z.string(), z.unknown()).default({}),
});

export const demoAgentFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    key: z
      .string()
      .max(24)
      .regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    prompt: z.string().min(1),
    criteria: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(96),
          description: z.string().trim().min(10).max(2_000),
        }),
      )
      .min(1)
      .max(MAX_SUCCESS_CRITERIA_PER_AGENT),
    calls: z
      .array(
        z.object({
          key: z
            .string()
            .max(24)
            .regex(/^[a-z0-9-]+$/),
          name: z.string().min(1),
          durationSeconds: z.number().int().positive(),
          summary: z.string().default(''),
          transcript: z.string().min(1),
          actions: z.array(demoActionSchema).default([]),
          expectedResults: z.record(z.string(), criterionStatusSchema).default({}),
        }),
      )
      .min(1),
    expectedRecommendations: z.array(z.string()).default([]),
  })
  .superRefine((fixture, context) => {
    checkUnique(
      fixture.criteria.map(({ name }) => name.toLocaleLowerCase('en-US')),
      'Success Criterion names',
      context,
    );
    checkUnique(
      fixture.calls.map(({ key }) => key),
      'Call keys',
      context,
    );

    const criterionNames = new Set(fixture.criteria.map(({ name }) => name));
    for (const [callIndex, call] of fixture.calls.entries()) {
      for (const criterionName of Object.keys(call.expectedResults)) {
        if (!criterionNames.has(criterionName)) {
          context.addIssue({
            code: 'custom',
            path: ['calls', callIndex, 'expectedResults', criterionName],
            message: `Unknown Success Criterion: ${criterionName}`,
          });
        }
      }
    }
    for (const [index, criterionName] of fixture.expectedRecommendations.entries()) {
      if (!criterionNames.has(criterionName)) {
        context.addIssue({
          code: 'custom',
          path: ['expectedRecommendations', index],
          message: `Unknown Success Criterion: ${criterionName}`,
        });
      }
    }
  });

export type DemoAgentFixture = z.infer<typeof demoAgentFixtureSchema>;

export async function loadDemoAgentFixture(path: string): Promise<DemoAgentFixture> {
  const contents = await readFile(path, 'utf8');
  return demoAgentFixtureSchema.parse(JSON.parse(contents) as unknown);
}

function checkUnique(values: string[], label: string, context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message: `${label} must be unique.` });
  }
}
