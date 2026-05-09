import type { GlobalOptions } from "../types.js";
import { listProjectDirs, readJsonlFile } from "../reader.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { writeJson, writeError } from "../output.js";

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

export async function search(
  query: string,
  opts: SearchOptions,
): Promise<void> {
  if (!query) {
    writeError("Search query required");
    process.exit(1);
  }

  const matcher = opts.regex
    ? (text: string) => new RegExp(query).test(text)
    : (text: string) => text.includes(query);

  const results: SearchResult[] = [];
  const projectDirs = await listProjectDirs(opts.claudeDir);

  for (const dir of projectDirs) {
    if (opts.project && !dir.includes(opts.project)) continue;

    const files = await readdir(dir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const file of jsonlFiles) {
      const sessionId = file.replace(".jsonl", "");
      let messageIndex = 0;

      for await (const entry of readJsonlFile(join(dir, file))) {
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
    }
  }

  writeJson(results);
}

function extractText(
  record: Record<string, unknown>,
  includeAssistant?: boolean,
  includeTools?: boolean,
): string | null {
  const type = record.type as string;

  if (type === "user" || (includeAssistant && type === "assistant")) {
    const content = record.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter(
          (b: Record<string, unknown>) =>
            b.type === "text" || (includeTools && b.type === "tool_use"),
        )
        .map((b: Record<string, unknown>) =>
          b.type === "text" ? b.text : JSON.stringify(b.input),
        )
        .join("\n");
    }
  }

  return null;
}
