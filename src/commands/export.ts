import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJson } from '../output.js';
import { findConversationFile, readJsonlFile } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface ExportOptions extends GlobalOptions {
  format: string;
  all?: boolean;
  project?: string;
}

type Entry = Record<string, unknown>;

function extractText(message: Entry): string {
  const content = message.content;
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

function extractToolCalls(message: Entry): string[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  return (content as Entry[]).filter((b) => b.type === 'tool_use').map((b) => `\`${b.name}\``);
}

async function writeOutput(content: string, outDir: string, filename: string, stdout?: boolean) {
  if (stdout) {
    process.stdout.write(content);
  } else {
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, filename);
    await writeFile(outPath, content);
    process.stderr.write(`exported to ${outPath}\n`);
  }
}

function exportAsJson(entries: unknown[], sessionId: string, opts: ExportOptions) {
  if (opts.stdout) {
    writeJson(entries);
  } else {
    return writeOutput(JSON.stringify(entries, null, 2), opts.outDir, `${sessionId}.json`);
  }
}

function buildMarkdown(entries: unknown[]): string {
  let title = '';
  const sections: string[] = [];

  for (const raw of entries) {
    const entry = raw as Entry;

    if (entry.type === 'ai-title') {
      title = entry.aiTitle as string;
      continue;
    }

    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    const message = entry.message as Entry | undefined;
    if (!message) continue;

    const role = entry.type === 'user' ? 'User' : 'Assistant';
    const text = extractText(message);
    const tools = extractToolCalls(message);
    const timestamp = (entry.timestamp as string) ?? '';

    if (!text && tools.length === 0) continue;

    let section = `## ${role}`;
    if (timestamp) section += ` <sub>${timestamp}</sub>`;
    section += '\n\n';
    if (text) section += text;
    if (tools.length > 0) {
      if (text) section += '\n\n';
      section += `*Tools: ${tools.join(', ')}*`;
    }
    sections.push(section);
  }

  return `# ${title || 'Session'}\n\n${sections.join('\n\n---\n\n')}`;
}

function buildCsv(entries: unknown[]): string {
  const rows: string[] = ['index,type,timestamp,content_length'];
  let index = 0;

  for (const raw of entries) {
    const entry = raw as Entry;
    if (entry.type !== 'user' && entry.type !== 'assistant') {
      index++;
      continue;
    }
    const message = entry.message as Entry | undefined;
    if (!message) {
      index++;
      continue;
    }

    const text = extractText(message);
    const ts = (entry.timestamp as string) ?? '';
    rows.push(`${index},${entry.type},${ts},${text.length}`);
    index++;
  }

  return rows.join('\n');
}

export async function exportSession(
  sessionId: string | undefined,
  opts: ExportOptions,
): Promise<void> {
  if (!sessionId) {
    process.stderr.write('error: session ID required\n');
    process.exit(1);
  }

  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    process.stderr.write(`error: session not found: ${sessionId}\n`);
    process.exit(1);
  }

  const entries: unknown[] = [];
  for await (const entry of readJsonlFile(file)) {
    entries.push(entry);
  }

  if (opts.format === 'json') {
    await exportAsJson(entries, sessionId, opts);
    return;
  }

  if (opts.format === 'md') {
    await writeOutput(buildMarkdown(entries), opts.outDir, `${sessionId}.md`, opts.stdout);
    return;
  }

  if (opts.format === 'csv') {
    await writeOutput(buildCsv(entries), opts.outDir, `${sessionId}.csv`, opts.stdout);
    return;
  }

  process.stderr.write(`error: unknown format: ${opts.format}\n`);
  process.exit(1);
}
