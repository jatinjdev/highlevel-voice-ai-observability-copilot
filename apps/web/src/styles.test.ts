import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

describe('established observability layout', () => {
  it('keeps the agent review and recommendation regions in the canonical fixed workspace', () => {
    expect(styles).toMatch(/\.app-shell\[data-view='agent'\]\s*\{[^}]*height:\s*100dvh;/s);
    expect(styles).toMatch(
      /\.app-shell\[data-view='agent'\] \.agent-analysis-layout\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) minmax\(180px, 30dvh\);/s,
    );
  });

  it('keeps recommendation cards at the established information density', () => {
    expect(styles).toMatch(/\.recommendation-panel \.recommendation-card h3\s*\{/s);
    expect(styles).toMatch(/\.recommendation-copy-block blockquote\s*\{/s);
  });

  it('restores the collapsible right-hand call details strip in the HighLevel embed', () => {
    expect(styles).toContain('@media (max-width: 1080px)');
    expect(styles).toMatch(/\.call-sidebar-strip\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(
      /\.call-reference-rail:hover \.call-sidebar-strip,[\s\S]*visibility:\s*hidden;/,
    );
  });
});
