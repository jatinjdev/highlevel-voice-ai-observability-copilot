import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

describe('established observability layout', () => {
  it('keeps success criteria compact inside the fixed-height agent workspace', () => {
    expect(styles).toMatch(
      /\.criteria-list article\s*\{[^}]*min-height:\s*92px;[^}]*padding:\s*12px 70px 30px 12px;/s,
    );
    expect(styles).toMatch(/\.criteria-list p\s*\{[^}]*-webkit-line-clamp:\s*2;/s);
  });

  it('keeps recommendation cards at the established information density', () => {
    expect(styles).toMatch(/\.recommendation-card h3\s*\{[^}]*font-size:\s*11px;/s);
    expect(styles).toMatch(/\.recommendation-card > p\s*\{[^}]*font-size:\s*8px;/s);
    expect(styles).toMatch(/\.copy-block code\s*\{[^}]*font-size:\s*8px;/s);
  });

  it('does not collapse the desktop workspace inside the HighLevel iframe', () => {
    expect(styles).toContain('@media (max-width: 640px)');
    expect(styles).not.toContain('@media (max-width: 900px)');
  });
});
