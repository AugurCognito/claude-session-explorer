import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { formatTimestamp, writeJson } from '../output.js';
import {
  discoverSessions,
  findConversationFile,
  listProjectDirs,
  readJsonlFile,
  readSessionInfo,
} from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface TokensOptions extends GlobalOptions {
  project?: string;
  daily?: boolean;
  byModel?: boolean;
}

interface TurnTokens {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
}

interface TokenBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

function extractUsage(record: Record<string, unknown>): TurnTokens | null {
  const message = record.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const usage = message.usage as Record<string, number> | undefined;
  if (!usage) return null;

  return {
    turnIndex: 0,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    model: (message.model as string) ?? 'unknown',
  };
}

async function sessionTokens(filePath: string): Promise<TurnTokens[]> {
  const turns: TurnTokens[] = [];
  let turnIndex = 0;

  for await (const entry of readJsonlFile(filePath)) {
    const record = entry as Record<string, unknown>;
    const usage = extractUsage(record);
    if (usage) {
      usage.turnIndex = turnIndex;
      turns.push(usage);
    }
    turnIndex++;
  }

  return turns;
}

function newBucket(): TokenBucket {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

function addTurnToBucket(bucket: TokenBucket, t: TurnTokens): void {
  bucket.input += t.inputTokens;
  bucket.output += t.outputTokens;
  bucket.cacheRead += t.cacheReadTokens;
  bucket.cacheCreation += t.cacheCreationTokens;
}

function bucketTotal(b: TokenBucket): number {
  return b.input + b.output + b.cacheRead + b.cacheCreation;
}

async function tokensByModel(opts: TokensOptions): Promise<void> {
  const modelTotals = new Map<string, TokenBucket>();
  const projectDirs = await listProjectDirs(opts.claudeDir);

  for (const dir of projectDirs) {
    if (opts.project && !dir.includes(opts.project.replaceAll('/', '-'))) continue;
    const files = await readdir(dir);
    for (const f of files.filter((x) => x.endsWith('.jsonl'))) {
      const turns = await sessionTokens(join(dir, f));
      for (const t of turns) {
        const existing = modelTotals.get(t.model) ?? newBucket();
        addTurnToBucket(existing, t);
        modelTotals.set(t.model, existing);
      }
    }
  }

  writeJson(
    [...modelTotals.entries()].map(([model, b]) => ({
      model,
      inputTokens: b.input,
      outputTokens: b.output,
      cacheReadTokens: b.cacheRead,
      cacheCreationTokens: b.cacheCreation,
      totalTokens: bucketTotal(b),
    })),
  );
}

async function tokensDaily(opts: TokensOptions): Promise<void> {
  const dailyTotals = new Map<string, TokenBucket>();
  const discovered = await discoverSessions(opts.claudeDir);

  for (const s of discovered) {
    const info = await readSessionInfo(s.filePath);
    if (opts.project && !info.cwd.startsWith(opts.project)) continue;

    const dateKey = formatTimestamp(info.startedAt).split(' ')[0] ?? '';
    const turns = await sessionTokens(s.filePath);
    const existing = dailyTotals.get(dateKey) ?? newBucket();
    for (const t of turns) addTurnToBucket(existing, t);
    dailyTotals.set(dateKey, existing);
  }

  writeJson(
    [...dailyTotals.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, b]) => ({
        date,
        inputTokens: b.input,
        outputTokens: b.output,
        cacheReadTokens: b.cacheRead,
        cacheCreationTokens: b.cacheCreation,
        totalTokens: bucketTotal(b),
      })),
  );
}

async function tokensByProject(project: string, opts: TokensOptions): Promise<void> {
  const discovered = await discoverSessions(opts.claudeDir);
  const summaries: Record<string, unknown>[] = [];

  for (const s of discovered) {
    const info = await readSessionInfo(s.filePath);
    if (!info.cwd.startsWith(project)) continue;

    const turns = await sessionTokens(s.filePath);
    const b = newBucket();
    for (const t of turns) addTurnToBucket(b, t);

    summaries.push({
      sessionId: s.sessionId,
      inputTokens: b.input,
      outputTokens: b.output,
      cacheReadTokens: b.cacheRead,
      cacheCreationTokens: b.cacheCreation,
      totalTokens: bucketTotal(b),
    });
  }

  writeJson(summaries);
}

export async function tokens(sessionId: string | undefined, opts: TokensOptions): Promise<void> {
  if (sessionId) {
    const file = await findConversationFile(opts.claudeDir, sessionId);
    if (!file) {
      process.stderr.write(`error: session not found: ${sessionId}\n`);
      process.exit(1);
    }
    writeJson(await sessionTokens(file));
    return;
  }

  if (opts.byModel) return tokensByModel(opts);
  if (opts.daily) return tokensDaily(opts);
  if (opts.project) return tokensByProject(opts.project, opts);

  process.stderr.write('error: provide a session ID, --project, --daily, or --by-model\n');
  process.exit(1);
}
