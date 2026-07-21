import { describe, expect, it } from 'vitest';

import { hashAgentConfiguration } from './agent-configuration';

describe('hashAgentConfiguration', () => {
  it('is stable across object key ordering and changes for any configuration value', () => {
    const first = hashAgentConfiguration('Prompt', { voice: 'Jessica', actions: [{ id: 'a' }] });
    const reordered = hashAgentConfiguration('Prompt', {
      actions: [{ id: 'a' }],
      voice: 'Jessica',
    });
    const changed = hashAgentConfiguration('Prompt', {
      actions: [{ id: 'b' }],
      voice: 'Jessica',
    });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });
});
