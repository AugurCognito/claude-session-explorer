import type { GlobalOptions } from "../types.js";
import { findConversationFile, readJsonlFile } from "../reader.js";
import { writeJson, writeError } from "../output.js";

interface ShowOptions extends GlobalOptions {
  messages?: boolean;
  tools?: boolean;
  files?: boolean;
  tokens?: boolean;
  raw?: boolean;
}

export async function show(sessionId: string, opts: ShowOptions): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    writeError(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const entries: unknown[] = [];
  for await (const entry of readJsonlFile(file)) {
    entries.push(entry);
  }

  if (opts.raw) {
    for (const entry of entries) {
      process.stdout.write(JSON.stringify(entry) + "\n");
    }
    return;
  }

  writeJson({ sessionId, file, entryCount: entries.length });
}
