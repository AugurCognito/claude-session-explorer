import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeError, writeJson } from '../output.js';
import { listProjectDirs, readJsonlFile } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface SearchOptions extends GlobalOptions {
  all?: boolean;
  tools?: boolean;
  project?: string;
  since?: string;
  context?: number;
  regex?: boolean;
}

interface SearchResult {
  sessionId: string;
  messageIndex: number;
  timestamp: number;
  matchingText: string;
}

function buildMatcher(query: string, useRegex?: boolean): (text: string) => boolean {
  if (useRegex) {
    const re = new RegExp(query);
    return (text) => re.test(text);
  }
  return (text) => text.includes(query);
}

function extractText(
  record: Record<string, unknown>,
  includeAssistant?: boolean,
  includeTools?: boolean,
): string | null {
  const type = record.type as string;
  if (type !== 'user' && !(includeAssistant && type === 'assistant')) return null;

  const content = record.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .filter(
        (b: Record<string, unknown>) =>
          b.type === 'text' || (includeTools && b.type === 'tool_use'),
      )
      .map((b: Record<string, unknown>) => (b.type === 'text' ? b.text : JSON.stringify(b.input)))
      .join('\n');
  }

  return null;
}

async function searchFile(
  filePath: string,
  sessionId: string,
  matcher: (text: string) => boolean,
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let messageIndex = 0;

  for await (const entry of readJsonlFile(filePath)) {
    const record = entry as Record<string, unknown>;
    const content = extractText(record, opts.all, opts.tools);

    if (content && matcher(content)) {
      results.push({
        sessionId,
        messageIndex,
        timestamp: (record.timestamp as number) ?? 0,
        matchingText: content.slice(0, 200),
      });
    }
    messageIndex++;
  }

  return results;
}

export async function search(query: string, opts: SearchOptions): Promise<void> {
  if (!query) {
    writeError('Search query required');
    process.exit(1);
  }

  const matcher = buildMatcher(query, opts.regex);
  const results: SearchResult[] = [];
  const projectDirs = await listProjectDirs(opts.claudeDir);

  for (const dir of projectDirs) {
    if (opts.project && !dir.includes(opts.project)) continue;

    const files = await readdir(dir);
    for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
      const sessionId = file.replace('.jsonl', '');
      const matches = await searchFile(join(dir, file), sessionId, matcher, opts);
      results.push(...matches);
    }
  }

  writeJson(results);
}
