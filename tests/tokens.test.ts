import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const FIXTURE_DIR = join(import.meta.dirname, 'fixtures/fake-claude-home');
const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

// Known truth from the fixture (session aaaaaaaa-1111-2222-3333-000000000001):
// 3 unique message.ids, each repeated across 2-3 JSONL entries (content blocks).
// msg-001: output=1200, input=500, cache_read=100, cache_creation=50   (3 entries)
// msg-002: output=1500, input=800, cache_read=200, cache_creation=0    (3 entries)
// msg-003: output=800,  input=1000, cache_read=300, cache_creation=0   (2 entries)
const CORRECT_OUTPUT_TOKENS = 1200 + 1500 + 800; // 3500
const NAIVE_OUTPUT_SUM = 1200 * 3 + 1500 * 3 + 800 * 2; // 9700

describe('token aggregation', () => {
  it('tokens command output matches deduped totals, not naive sum', async () => {
    const sessionId = 'aaaaaaaa-1111-2222-3333-000000000001';
    const { stdout } = await exec('node', [
      CLI,
      'tokens',
      sessionId,
      '--claude-dir',
      FIXTURE_DIR,
      '--json',
    ]);
    const turns = JSON.parse(stdout) as Array<{ outputTokens: number }>;

    const totalOutput = turns.reduce((sum, t) => sum + t.outputTokens, 0);

    // The correct total after dedup by message.id
    expect(totalOutput).toBe(CORRECT_OUTPUT_TOKENS);

    // Confirm the naive sum is wrong (current bug: ~3x inflation)
    expect(totalOutput).not.toBe(NAIVE_OUTPUT_SUM);
  });

  it('stats command totals match deduped values', async () => {
    const { stdout } = await exec('node', [CLI, 'stats', '--claude-dir', FIXTURE_DIR, '--json']);
    const result = JSON.parse(stdout) as { totalOutputTokens: number };

    // Fixture has 2 sessions: aaaaaaaa (3500 output) + bbbbbbbb (600 output) = 4100
    const ALL_SESSIONS_OUTPUT = CORRECT_OUTPUT_TOKENS + 600;
    expect(result.totalOutputTokens).toBe(ALL_SESSIONS_OUTPUT);
    expect(result.totalOutputTokens).not.toBe(NAIVE_OUTPUT_SUM);
  });
});
