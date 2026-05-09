import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { HistoryEntry, SessionMeta } from './types.js';

export async function readJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

export async function* readJsonlFile(path: string): AsyncGenerator<unknown> {
  const stream = createReadStream(path, 'utf-8');
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) {
      yield JSON.parse(trimmed);
    }
  }
}

export async function listSessionFiles(claudeDir: string): Promise<string[]> {
  const sessionsDir = join(claudeDir, 'sessions');
  try {
    const files = await readdir(sessionsDir);
    return files.filter((f) => f.endsWith('.json')).map((f) => join(sessionsDir, f));
  } catch {
    return [];
  }
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

export async function readSessionMeta(path: string): Promise<SessionMeta | null> {
  try {
    return await readJsonFile<SessionMeta>(path);
  } catch {
    return null;
  }
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
