import type { GlobalOptions } from "../types.js";
import { findConversationFile, readJsonlFile } from "../reader.js";
import { writeJson, writeError } from "../output.js";

interface TokensOptions extends GlobalOptions {
  project?: string;
  daily?: boolean;
  byModel?: boolean;
}

interface TurnTokens {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model?: string;
}

export async function tokens(
  sessionId: string | undefined,
  opts: TokensOptions,
): Promise<void> {
  if (!sessionId) {
    writeError("Session ID required (project-level aggregation not yet implemented)");
    process.exit(1);
  }

  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    writeError(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const turns: TurnTokens[] = [];
  let turnIndex = 0;

  for await (const entry of readJsonlFile(file)) {
    const record = entry as Record<string, unknown>;
    const usage = record.usage as Record<string, number> | undefined;

    if (usage) {
      turns.push({
        turnIndex,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        model: record.model as string | undefined,
      });
    }
    turnIndex++;
  }

  writeJson(turns);
}
