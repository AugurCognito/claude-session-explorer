import type { GlobalOptions } from "../types.js";
import { findConversationFile, readJsonlFile } from "../reader.js";
import { writeJson, writeError } from "../output.js";

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
  timestamp: number;
  content: string;
}

export async function messages(
  sessionId: string,
  opts: MessagesOptions,
): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    writeError(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  let results: MessageOutput[] = [];
  let index = 0;

  for await (const entry of readJsonlFile(file)) {
    const record = entry as Record<string, unknown>;
    const type = record.type as string;

    if (type !== "user" && type !== "assistant") {
      index++;
      continue;
    }
    if (opts.user && type !== "user") { index++; continue; }
    if (opts.assistant && type !== "assistant") { index++; continue; }

    const content = extractTextContent(record, opts.raw);

    results.push({
      index,
      type,
      timestamp: (record.timestamp as number) ?? 0,
      content,
    });
    index++;
  }

  if (opts.slice) {
    const [start, end] = opts.slice.split(":").map(Number);
    results = results.slice(start, end);
  } else if (opts.first) {
    results = results.slice(0, opts.first);
  } else if (opts.last) {
    results = results.slice(-opts.last);
  }

  writeJson(results);
}

function extractTextContent(
  record: Record<string, unknown>,
  raw?: boolean,
): string {
  const content = record.content;
  if (typeof content === "string") return content;
  if (raw) return JSON.stringify(content);

  if (Array.isArray(content)) {
    return (content as Record<string, unknown>[])
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("\n");
  }

  return "";
}
