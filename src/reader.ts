import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { HistoryEntry } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function* readJsonlFile(path: string): AsyncGenerator<unknown> {
  const stream = createReadStream(path, 'utf-8');
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed);
    } catch {
      process.stderr.write(`warning: invalid JSONL at ${path}:${lineNum}\n`);
    }
  }
}

export interface DiscoveredSession {
  sessionId: string;
  filePath: string;
  projectDir: string;
  projectSlug: string;
}

export async function discoverSessions(claudeDir: string): Promise<DiscoveredSession[]> {
  const projectDirs = await listProjectDirs(claudeDir);
  const sessions: DiscoveredSession[] = [];

  for (const dir of projectDirs) {
    const slug = basename(dir);
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.replace('.jsonl', '');
      if (!UUID_RE.test(id)) continue;
      sessions.push({ sessionId: id, filePath: join(dir, f), projectDir: dir, projectSlug: slug });
    }
  }

  return sessions;
}

export interface SessionInfo {
  cwd: string;
  entrypoint: string;
  startedAt: number;
  updatedAt: number;
  title: string;
}

export async function readSessionInfo(filePath: string): Promise<SessionInfo> {
  let cwd = '';
  let entrypoint = '';
  let startedAt = 0;
  let updatedAt = 0;
  let title = '';

  for await (const entry of readJsonlFile(filePath)) {
    const record = entry as Record<string, unknown>;

    if (record.type === 'ai-title' && typeof record.aiTitle === 'string') {
      title = record.aiTitle;
    }

    const ts = typeof record.timestamp === 'number' ? record.timestamp : 0;
    if (ts > 0) {
      if (startedAt === 0 || ts < startedAt) startedAt = ts;
      if (ts > updatedAt) updatedAt = ts;
    }

    if (!cwd && typeof record.cwd === 'string') {
      cwd = record.cwd;
    }
    if (!entrypoint && typeof record.entrypoint === 'string') {
      entrypoint = record.entrypoint;
    }
  }

  return { cwd, entrypoint, startedAt, updatedAt, title };
}

export async function listProjectDirs(claudeDir: string): Promise<string[]> {
  const projectsDir = join(claudeDir, 'projects');
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(projectsDir, e.name));
  } catch {
    return [];
  }
}

export async function findConversationFile(
  claudeDir: string,
  sessionId: string,
): Promise<string | null> {
  const projectDirs = await listProjectDirs(claudeDir);

  for (const dir of projectDirs) {
    const files = await readdir(dir);
    const match = files.find((f) => f.includes(sessionId) && f.endsWith('.jsonl'));
    if (match) return join(dir, match);
  }

  return null;
}

export interface DedupedUsage {
  messageId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  toolNames: string[];
}

export async function aggregateUsage(filePath: string): Promise<DedupedUsage[]> {
  const byId = new Map<string, DedupedUsage>();

  for await (const entry of readJsonlFile(filePath)) {
    const record = entry as Record<string, unknown>;
    const message = record.message as Record<string, unknown> | undefined;
    if (!message?.usage) continue;

    const id =
      (message.id as string | undefined) ?? (message.requestId as string | undefined) ?? '';
    const usage = message.usage as Record<string, number>;

    const tools: string[] = [];
    if (Array.isArray(message.content)) {
      for (const block of message.content as Record<string, unknown>[]) {
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          tools.push(block.name);
        }
      }
    }

    const existing = byId.get(id);
    if (existing) {
      existing.toolNames.push(...tools);
    } else {
      byId.set(id, {
        messageId: id,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        model: (message.model as string) ?? 'unknown',
        toolNames: tools,
      });
    }
  }

  return [...byId.values()];
}

export async function* readHistory(claudeDir: string): AsyncGenerator<HistoryEntry> {
  const historyPath = join(claudeDir, 'history.jsonl');
  try {
    for await (const entry of readJsonlFile(historyPath)) {
      yield entry as HistoryEntry;
    }
  } catch {
    // history.jsonl doesn't exist
  }
}
