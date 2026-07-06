import { formatTimestamp, writeJson } from '../output.js';
import {
  aggregateUsage,
  discoverSessions,
  findConversationFile,
  readSessionInfo,
} from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface TokensOptions extends GlobalOptions {
  project?: string;
  daily?: boolean;
  byModel?: boolean;
}

interface TokenBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

function newBucket(): TokenBucket {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

function bucketTotal(b: TokenBucket): number {
  return b.input + b.output + b.cacheRead + b.cacheCreation;
}

async function tokensByModel(opts: TokensOptions): Promise<void> {
  const modelTotals = new Map<string, TokenBucket>();
  const discovered = await discoverSessions(opts.claudeDir);

  for (const s of discovered) {
    if (opts.project) {
      const info = await readSessionInfo(s.filePath);
      if (!info.cwd.startsWith(opts.project)) continue;
    }

    const usages = await aggregateUsage(s.filePath);
    for (const u of usages) {
      const existing = modelTotals.get(u.model) ?? newBucket();
      existing.input += u.inputTokens;
      existing.output += u.outputTokens;
      existing.cacheRead += u.cacheReadTokens;
      existing.cacheCreation += u.cacheCreationTokens;
      modelTotals.set(u.model, existing);
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
    const usages = await aggregateUsage(s.filePath);
    const existing = dailyTotals.get(dateKey) ?? newBucket();
    for (const u of usages) {
      existing.input += u.inputTokens;
      existing.output += u.outputTokens;
      existing.cacheRead += u.cacheReadTokens;
      existing.cacheCreation += u.cacheCreationTokens;
    }
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

    const usages = await aggregateUsage(s.filePath);
    const b = newBucket();
    for (const u of usages) {
      b.input += u.inputTokens;
      b.output += u.outputTokens;
      b.cacheRead += u.cacheReadTokens;
      b.cacheCreation += u.cacheCreationTokens;
    }

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

    const usages = await aggregateUsage(file);
    writeJson(
      usages.map((u, i) => ({
        turnIndex: i,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        cacheCreationTokens: u.cacheCreationTokens,
        model: u.model,
      })),
    );
    return;
  }

  if (opts.byModel) return tokensByModel(opts);
  if (opts.daily) return tokensDaily(opts);
  if (opts.project) return tokensByProject(opts.project, opts);

  process.stderr.write('error: provide a session ID, --project, --daily, or --by-model\n');
  process.exit(1);
}
