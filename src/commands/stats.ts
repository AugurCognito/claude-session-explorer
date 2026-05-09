import { formatTimestamp, writeJson } from '../output.js';
import {
  findConversationFile,
  listSessionFiles,
  readJsonlFile,
  readSessionMeta,
} from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface StatsOptions extends GlobalOptions {
  project?: string;
  daily?: boolean;
  weekly?: boolean;
}

interface DayStats {
  sessions: number;
  inputTokens: number;
  outputTokens: number;
}

async function scanConversationTokens(
  filePath: string,
): Promise<{ input: number; output: number; tools: Map<string, number> }> {
  let input = 0;
  let output = 0;
  const tools = new Map<string, number>();

  for await (const entry of readJsonlFile(filePath)) {
    const record = entry as Record<string, unknown>;
    if (record.type !== 'assistant') continue;

    const message = record.message as Record<string, unknown> | undefined;
    if (!message) continue;

    const usage = message.usage as Record<string, number> | undefined;
    if (usage) {
      input +=
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      output += usage.output_tokens ?? 0;
    }

    const content = message.content;
    if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === 'tool_use') {
          const name = block.name as string;
          tools.set(name, (tools.get(name) ?? 0) + 1);
        }
      }
    }
  }

  return { input, output, tools };
}

export async function stats(opts: StatsOptions): Promise<void> {
  const metaFiles = await listSessionFiles(opts.claudeDir);

  if (opts.daily || opts.weekly) {
    const buckets = new Map<string, DayStats>();

    for (const metaFile of metaFiles) {
      const meta = await readSessionMeta(metaFile);
      if (!meta) continue;
      if (opts.project && !meta.cwd.startsWith(opts.project)) continue;

      const date = formatTimestamp(meta.startedAt).split(' ')[0] ?? '';
      const key = opts.weekly ? weekKey(meta.startedAt) : date;

      const existing = buckets.get(key) ?? { sessions: 0, inputTokens: 0, outputTokens: 0 };
      existing.sessions++;

      const file = await findConversationFile(opts.claudeDir, meta.sessionId);
      if (file) {
        const scan = await scanConversationTokens(file);
        existing.inputTokens += scan.input;
        existing.outputTokens += scan.output;
      }

      buckets.set(key, existing);
    }

    const result = [...buckets.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, s]) => ({
        date,
        sessions: s.sessions,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        totalTokens: s.inputTokens + s.outputTokens,
      }));

    writeJson(result);
    return;
  }

  let sessionCount = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const projectCounts = new Map<string, number>();
  const hourCounts = new Array<number>(24).fill(0);
  const toolCounts = new Map<string, number>();

  for (const metaFile of metaFiles) {
    const meta = await readSessionMeta(metaFile);
    if (!meta) continue;
    if (opts.project && !meta.cwd.startsWith(opts.project)) continue;

    sessionCount++;
    projectCounts.set(meta.cwd, (projectCounts.get(meta.cwd) ?? 0) + 1);
    const hour = new Date(meta.startedAt).getHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;

    const file = await findConversationFile(opts.claudeDir, meta.sessionId);
    if (file) {
      const scan = await scanConversationTokens(file);
      totalInput += scan.input;
      totalOutput += scan.output;
      for (const [tool, count] of scan.tools) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + count);
      }
    }
  }

  writeJson({
    sessionCount,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    projectBreakdown: [...projectCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([path, count]) => ({ path, sessionCount: count })),
    toolBreakdown: [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, callCount]) => ({ name, callCount })),
    hourBreakdown: hourCounts.map((count, hour) => ({ hour, sessionCount: count })),
  });
}

function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return formatTimestamp(monday.getTime()).split(' ')[0] ?? '';
}
