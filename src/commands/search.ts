import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJson } from '../output.js';
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
  type: string;
  timestamp: string;
  matchingText: string;
  context?: ContextMessage[];
}

interface ContextMessage {
  index: number;
  type: string;
  text: string;
}

function buildMatcher(query: string, useRegex?: boolean): (text: string) => boolean {
  if (useRegex) {
    const re = new RegExp(query, 'i');
    return (text) => re.test(text);
  }
  const lower = query.toLowerCase();
  return (text) => text.toLowerCase().includes(lower);
}

function extractText(
  record: Record<string, unknown>,
  includeAssistant?: boolean,
  includeTools?: boolean,
): string | null {
  const type = record.type as string;
  if (type !== 'user' && !(includeAssistant && type === 'assistant')) return null;

  const message = record.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const content = message.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content as Record<string, unknown>[]) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text as string);
      } else if (includeTools && block.type === 'tool_use' && block.input) {
        parts.push(JSON.stringify(block.input));
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }

  return null;
}

function extractMessageText(record: Record<string, unknown>): string {
  const message = record.message as Record<string, unknown> | undefined;
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Record<string, unknown>[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

async function searchFile(
  filePath: string,
  sessionId: string,
  matcher: (text: string) => boolean,
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const entries: Record<string, unknown>[] = [];
  for await (const entry of readJsonlFile(filePath)) {
    entries.push(entry as Record<string, unknown>);
  }

  const results: SearchResult[] = [];
  const contextN = opts.context ? Number(opts.context) : 0;

  for (let i = 0; i < entries.length; i++) {
    const record = entries[i] as Record<string, unknown>;
    const text = extractText(record, opts.all, opts.tools);
    if (!text || !matcher(text)) continue;

    const result: SearchResult = {
      sessionId,
      messageIndex: i,
      type: record.type as string,
      timestamp: (record.timestamp as string) ?? '',
      matchingText: text.slice(0, 300),
    };

    if (contextN > 0) {
      const ctx: ContextMessage[] = [];
      const start = Math.max(0, i - contextN);
      const end = Math.min(entries.length, i + contextN + 1);
      for (let j = start; j < end; j++) {
        if (j === i) continue;
        const e = entries[j] as Record<string, unknown>;
        const t = e.type as string;
        if (t !== 'user' && t !== 'assistant') continue;
        ctx.push({
          index: j,
          type: t,
          text: extractMessageText(e).slice(0, 200),
        });
      }
      result.context = ctx;
    }

    results.push(result);
  }

  return results;
}

export async function search(query: string, opts: SearchOptions): Promise<void> {
  if (!query) {
    process.stderr.write('error: search query required\n');
    process.exit(1);
  }

  const matcher = buildMatcher(query, opts.regex);
  const results: SearchResult[] = [];
  const projectDirs = await listProjectDirs(opts.claudeDir);

  for (const dir of projectDirs) {
    if (opts.project && !dir.includes(opts.project.replaceAll('/', '-'))) continue;

    const files = await readdir(dir);
    for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
      const sessionId = file.replace('.jsonl', '');
      const matches = await searchFile(join(dir, file), sessionId, matcher, opts);
      results.push(...matches);
    }
  }

  writeJson(results);
}
