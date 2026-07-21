import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = ['base.css', 'recommendations.css', 'shared-workspace.css', 'agent.css', 'call.css']
  .map((file) => readFileSync(`src/styles/${file}`, 'utf8'))
  .join('\n');

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

  it('renders notices as the established fixed toast and recommendations as a vertical list', () => {
    expect(styles).toMatch(
      /\.toast\s*\{[^}]*position:\s*fixed;[^}]*right:\s*20px;[^}]*bottom:\s*20px;/s,
    );
    expect(styles).toMatch(
      /\.recommendation-list\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow-y:\s*auto;/s,
    );
  });

  it('uses two agent recommendation columns except on small displays without stacking criteria', () => {
    expect(styles).toMatch(
      /\.recommendation-panel\[data-scope='agent'\] \.recommendation-list\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.recommendation-panel\[data-scope='agent'\] \.recommendation-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-shell\[data-view='agent'\] \.agent-review-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/,
    );
    expect(styles).not.toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-shell\[data-view='agent'\] \.agent-review-grid\s*\{[^}]*grid-template-columns:\s*1fr;/,
    );
  });

  it('stacks call date and time and wraps the flagged issues header on narrow screens', () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-shell\[data-view='agent'\] \.calls-table time\s*\{[^}]*display:\s*grid;[^}]*white-space:\s*normal;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-shell\[data-view='agent'\] \.calls-table \.flagged-issues-heading\s*\{[^}]*display:\s*inline-grid;[^}]*white-space:\s*normal;/,
    );
  });

  it('keeps the active criterion filter fluid and reveals its dismiss affordance', () => {
    expect(styles).toMatch(
      /\.active-criterion-filter\s*\{[^}]*max-width:\s*min\(460px, calc\(100% - 64px\)\);[^}]*min-width:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.active-criterion-filter-label\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s,
    );
    expect(styles).toMatch(
      /\.active-criterion-filter:hover \.active-criterion-filter-dismiss,[\s\S]*?opacity:\s*1;/,
    );
  });

  it('restores the collapsible right-hand call details strip in the HighLevel embed', () => {
    expect(styles).toContain('@media (max-width: 1080px)');
    expect(styles).toMatch(/\.call-sidebar-strip\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(
      /\.call-reference-rail:hover \.call-sidebar-strip,[\s\S]*visibility:\s*hidden;/,
    );
  });

  it('connects every transcript turn instead of limiting the timeline to the scroll viewport', () => {
    expect(styles).toMatch(
      /\.reference-transcript-turn:not\(:last-child\)::before\s*\{[^}]*top:\s*25px;[^}]*bottom:\s*-25px;/s,
    );
    expect(styles).not.toContain('.reference-transcript-list::before');
  });

  it('keeps all four agent statistics on one compressed row in a narrow embed', () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-shell\[data-view='agent'\] \.summary-strip\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/,
    );
    expect(styles).not.toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.summary-strip,[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });
});
