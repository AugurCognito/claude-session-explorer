import { writeJson } from '../output.js';
import { findConversationFile, readJsonlFile } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface MessagesOptions extends GlobalOptions {
  user?: boolean;
  assistant?: boolean;
  first?: number;
  last?: number;
  slice?: string;
  raw?: boolean;
}

interface MessageOutput {
  index: number;
  type: string;
  timestamp: string;
  content: string;
}

function extractText(content: unknown, raw?: boolean): string {
  if (typeof content === 'string') return content;
  if (raw) return JSON.stringify(content);

  if (Array.isArray(content)) {
    return (content as Record<string, unknown>[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

export async function messages(sessionId: string, opts: MessagesOptions): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    process.stderr.write(`error: session not found: ${sessionId}\n`);
    process.exit(1);
  }

  let results: MessageOutput[] = [];
  let index = 0;

  for await (const entry of readJsonlFile(file)) {
    const record = entry as Record<string, unknown>;
    const type = record.type as string;

    if (type !== 'user' && type !== 'assistant') {
      index++;
      continue;
    }
    if (opts.user && type !== 'user') {
      index++;
      continue;
    }
    if (opts.assistant && type !== 'assistant') {
      index++;
      continue;
    }

    const message = record.message as Record<string, unknown> | undefined;
    if (!message) {
      index++;
      continue;
    }

    const content = extractText(message.content, opts.raw);
    const timestamp = (record.timestamp as string) ?? '';

    results.push({ index, type, timestamp, content });
    index++;
  }

  if (opts.slice) {
    const [start, end] = opts.slice.split(':').map(Number);
    results = results.slice(start, end);
  } else if (opts.first) {
    results = results.slice(0, opts.first);
  } else if (opts.last) {
    results = results.slice(-opts.last);
  }

  writeJson(results);
}
