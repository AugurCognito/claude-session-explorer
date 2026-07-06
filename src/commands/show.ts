import { formatDuration, formatTimestamp, writeJson } from '../output.js';
import { findConversationFile, readJsonlFile } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface ShowOptions extends GlobalOptions {
  messages?: boolean;
  tools?: boolean;
  files?: boolean;
  tokens?: boolean;
  raw?: boolean;
}

type Entry = Record<string, unknown>;

const FILE_TOOLS = new Set(['Read', 'Write', 'Edit']);

function extractMessageText(msg: Record<string, unknown>): string {
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Entry[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function showMessages(entries: Entry[]): void {
  const msgs = entries
    .filter((e) => e.type === 'user' || e.type === 'assistant')
    .map((e, i) => {
      const msg = e.message as Entry | undefined;
      const text = msg ? extractMessageText(msg) : '';
      return {
        index: i,
        type: e.type,
        timestamp: e.timestamp,
        contentLength: text.length,
        preview: text.slice(0, 150),
      };
    });
  writeJson(msgs);
}

function showTools(entries: Entry[]): void {
  const toolCalls: Entry[] = [];
  for (const entry of entries) {
    if (entry.type !== 'assistant') continue;
    const msg = entry.message as Entry | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content as Entry[]) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as Entry | undefined;
      toolCalls.push({
        name: block.name,
        id: block.id,
        timestamp: entry.timestamp,
        inputKeys: input ? Object.keys(input) : [],
        inputPreview: input ? JSON.stringify(input).slice(0, 200) : '',
      });
    }
  }
  writeJson(toolCalls);
}

function showFiles(entries: Entry[]): void {
  const fileOps: Entry[] = [];
  for (const entry of entries) {
    if (entry.type !== 'assistant') continue;
    const msg = entry.message as Entry | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content as Entry[]) {
      if (block.type !== 'tool_use') continue;
      if (!FILE_TOOLS.has(block.name as string)) continue;
      const input = block.input as Entry;
      fileOps.push({
        tool: block.name,
        filePath: input.file_path ?? input.path ?? '',
        timestamp: entry.timestamp,
      });
    }
  }
  writeJson(fileOps);
}

function showTokens(entries: Entry[]): void {
  const seen = new Map<string, Entry>();
  for (const entry of entries) {
    const msg = entry.message as Entry | undefined;
    const usage = msg?.usage as Record<string, number> | undefined;
    if (!usage) continue;

    const id = (msg?.id as string | undefined) ?? (msg?.requestId as string | undefined) ?? '';
    if (seen.has(id)) continue;

    seen.set(id, {
      timestamp: entry.timestamp,
      model: msg?.model ?? 'unknown',
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    });
  }
  writeJson([...seen.values()]);
}

function showSummary(sessionId: string, file: string, entries: Entry[]): void {
  let title = '';
  let firstTimestamp = 0;
  let lastTimestamp = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let model = '';
  const seenIds = new Set<string>();

  for (const entry of entries) {
    if (entry.type === 'ai-title') title = entry.aiTitle as string;
    if (entry.type === 'user') userMessages++;
    if (entry.type === 'assistant') assistantMessages++;

    const ts = entry.timestamp as string | undefined;
    if (ts) {
      const ms = new Date(ts).getTime();
      if (!firstTimestamp || ms < firstTimestamp) firstTimestamp = ms;
      if (ms > lastTimestamp) lastTimestamp = ms;
    }

    const msg = entry.message as Entry | undefined;
    if (msg?.usage) {
      const msgId = (msg.id as string | undefined) ?? (msg.requestId as string | undefined) ?? '';
      if (!seenIds.has(msgId)) {
        seenIds.add(msgId);
        const usage = msg.usage as Record<string, number>;
        totalInput +=
          (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
        totalOutput += usage.output_tokens ?? 0;
        if (!model && msg.model) model = msg.model as string;
      }
    }
  }

  writeJson({
    sessionId,
    title,
    model,
    file,
    startedAt: firstTimestamp ? formatTimestamp(firstTimestamp) : null,
    duration:
      firstTimestamp && lastTimestamp ? formatDuration(lastTimestamp - firstTimestamp) : null,
    entryCount: entries.length,
    userMessages,
    assistantMessages,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
  });
}

export async function show(sessionId: string, opts: ShowOptions): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    process.stderr.write(`error: session not found: ${sessionId}\n`);
    process.exit(1);
  }

  const entries: Entry[] = [];
  for await (const entry of readJsonlFile(file)) {
    entries.push(entry as Entry);
  }

  if (opts.raw) {
    for (const entry of entries) {
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }
    return;
  }

  if (opts.messages) return showMessages(entries);
  if (opts.tools) return showTools(entries);
  if (opts.files) return showFiles(entries);
  if (opts.tokens) return showTokens(entries);
  showSummary(sessionId, file, entries);
}
