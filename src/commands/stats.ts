import { formatTimestamp, writeJson } from '../output.js';
import { aggregateUsage, discoverSessions, readSessionInfo } from '../reader.js';
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

export async function stats(opts: StatsOptions): Promise<void> {
  const discovered = await discoverSessions(opts.claudeDir);

  if (opts.daily || opts.weekly) {
    const buckets = new Map<string, DayStats>();

    for (const s of discovered) {
      const info = await readSessionInfo(s.filePath);
      if (opts.project && !info.cwd.startsWith(opts.project)) continue;

      const date = formatTimestamp(info.startedAt).split(' ')[0] ?? '';
      const key = opts.weekly ? weekKey(info.startedAt) : date;

      const existing = buckets.get(key) ?? { sessions: 0, inputTokens: 0, outputTokens: 0 };
      existing.sessions++;

      const usages = await aggregateUsage(s.filePath);
      for (const u of usages) {
        existing.inputTokens += u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
        existing.outputTokens += u.outputTokens;
      }

      buckets.set(key, existing);
    }

    const result = [...buckets.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => ({
        date,
        sessions: d.sessions,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        totalTokens: d.inputTokens + d.outputTokens,
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

  for (const s of discovered) {
    const info = await readSessionInfo(s.filePath);
    if (opts.project && !info.cwd.startsWith(opts.project)) continue;

    sessionCount++;
    projectCounts.set(info.cwd, (projectCounts.get(info.cwd) ?? 0) + 1);
    const hour = new Date(info.startedAt).getHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;

    const usages = await aggregateUsage(s.filePath);
    for (const u of usages) {
      totalInput += u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
      totalOutput += u.outputTokens;
      for (const tool of u.toolNames) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
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
