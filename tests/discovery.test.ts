import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const FIXTURE_DIR = join(import.meta.dirname, 'fixtures/fake-claude-home');
const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe('session discovery', () => {
  it('cse list finds ALL JSONL sessions, not just sessions/*.json metadata', async () => {
    const { stdout } = await exec('node', [CLI, 'list', '--claude-dir', FIXTURE_DIR, '--json']);
    const sessions = JSON.parse(stdout) as unknown[];

    // Fixture has 2 real UUID-named session JSONL files across 2 project dirs
    // (plus truncated.jsonl which isn't UUID-named)
    // The current bug: list reads sessions/*.json (1 file) instead of projects/*/*.jsonl
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('discovers sessions in project dirs with dots and underscores in name', async () => {
    const { stdout } = await exec('node', [CLI, 'list', '--claude-dir', FIXTURE_DIR, '--json']);
    const sessions = JSON.parse(stdout) as Array<{ id: string }>;

    // Session bbbbbbbb... lives in -Users-x-my.dotted_project/
    const hasDottedProject = sessions.some((s) => s.id.startsWith('bbbbbbbb'));
    expect(hasDottedProject).toBe(true);
  });
});
