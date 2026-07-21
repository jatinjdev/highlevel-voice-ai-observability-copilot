import { describe, expect, it } from 'vitest';

import { parseTranscript } from './ingestion.service';

describe('parseTranscript', () => {
  it('keeps an unlabeled paragraph with the preceding speaker', () => {
    const turns = parseTranscript(
      [
        'bot:Thanks for sharing your phone number. Our team will reach out soon.',
        '',
        'Thanks again for your patience, Jatin. We’re on it, and I hope you have a great day!',
        'human:Okay.',
      ].join('\n'),
    );

    expect(turns).toEqual([
      {
        speaker: 'agent',
        text: [
          'Thanks for sharing your phone number. Our team will reach out soon.',
          'Thanks again for your patience, Jatin. We’re on it, and I hope you have a great day!',
        ].join('\n'),
      },
      { speaker: 'customer', text: 'Okay.' },
    ]);
  });
});
