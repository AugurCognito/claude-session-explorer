export interface Session {
  id: string;
  cwd: string;
  startedAt: number;
  updatedAt: number;
  version: string;
  kind: string;
  entrypoint: string;
  status: string;
  title: string;
  messages: Message[];
}

export interface Message {
  type: 'user' | 'assistant' | 'attachment' | 'file-history-snapshot';
  timestamp: number;
  content: string | ContentBlock[];
  usage?: TokenUsage;
}

export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  model?: string;
}

export interface SessionMeta {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  version: string;
  status: string;
  kind: string;
  entrypoint: string;
}

export interface HistoryEntry {
  timestamp: number;
  project: string;
  display: string;
  sessionId?: string;
}

export interface FileOperation {
  filePath: string;
  operation: 'read' | 'write' | 'edit';
  timestamp: number;
  messageIndex: number;
}

export interface ProjectInfo {
  path: string;
  slug: string;
  sessionCount: number;
  totalTokens: number;
  firstSession: number;
  lastSession: number;
}

export interface GlobalOptions {
  claudeDir: string;
  outDir: string;
  stdout: boolean;
  json: boolean;
  pretty: boolean;
  noColor: boolean;
  verbose: boolean;
}
