import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'index.css'), 'utf8');

/** Declarations of the first rule for `selector` in the base layer. */
function rule(selector: string) {
  const base = css.slice(css.indexOf('@layer base'));
  const escaped = selector
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Prettier puts each selector of a list on its own line.
    .replace(/, /g, ',\\s*');
  const match = base.match(
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`),
  );
  return match?.[1].replace(/\s+/g, ' ').trim();
}

describe('dark mode for native controls', () => {
  it('tells the browser which colour scheme native controls use', () => {
    expect(rule(':root')).toContain('color-scheme: light');
    expect(rule('.dark')).toContain('color-scheme: dark');
  });

  it('gives native dropdowns and their lists the theme colours', () => {
    expect(rule('select')).toBe(
      'background-color: var(--background); color: var(--foreground);',
    );
    expect(rule('option, optgroup')).toBe(
      'background-color: var(--popover); color: var(--popover-foreground);',
    );
  });

  it('leaves no native select on a fixed light background', () => {
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.tsx') && !path.includes('.test.'))
          sources.push(readFileSync(path, 'utf8'));
      }
    };
    walk(join(__dirname, '..'));
    // The app has native selects, so the check below is meaningful.
    expect(sources.some((source) => /<select\b/.test(source))).toBe(true);
    for (const source of sources)
      expect(source).not.toMatch(/<select\b[^>]*className="[^"]*\bbg-white\b/);
  });
});
