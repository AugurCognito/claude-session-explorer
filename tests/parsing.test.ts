import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJsonlFile } from '../src/reader.js';

const FIXTURE_DIR = join(import.meta.dirname, 'fixtures/fake-claude-home');
const TRUNCATED_FILE = join(FIXTURE_DIR, 'projects/-Users-x-myapp/truncated.jsonl');

describe('JSONL parsing', () => {
  it('reads valid lines from a truncated file without crashing', async () => {
    const entries: unknown[] = [];
    // The current code throws on the truncated line — this test should pass
    // once per-line error handling is added (T1.4)
    for await (const entry of readJsonlFile(TRUNCATED_FILE)) {
      entries.push(entry);
    }

    // The fixture has 4 valid lines before the truncated 5th line
    expect(entries.length).toBe(4);
  });

  it('reports the bad line on stderr, not silently swallows it', async () => {
    const stderrMessages: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrMessages.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      const entries: unknown[] = [];
      for await (const entry of readJsonlFile(TRUNCATED_FILE)) {
        entries.push(entry);
      }

      // Should have emitted a warning about the bad line
      expect(stderrMessages.some((m) => m.includes('invalid') || m.includes('JSONL'))).toBe(true);
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it('exits with error for nonexistent --claude-dir', async () => {
    // Verifies that a bad path doesn't silently return empty — it should be a hard error
    const bogusDir = '/nonexistent/claude/dir';
    // readJsonlFile on a nonexistent file should throw, not return []
    await expect(async () => {
      for await (const _entry of readJsonlFile(join(bogusDir, 'nope.jsonl'))) {
        // drain
      }
    }).rejects.toThrow();
  });
});
