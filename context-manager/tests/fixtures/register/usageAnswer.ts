import type { SessionUsage } from 'claude-code'

/**
 * What `$.session.usage` answers: a 200k window 12% full, auto-compaction at 180k, and a
 * summary breakdown whose memory files, MCP schemas and agent briefs are the session's overhead.
 *
 * @param over the context figures to replace
 */
export const usageAnswer = (over: { tokens?: number; percent?: number } = {}): SessionUsage => ({
  startedAt: 0,
  context: {
    window: 200_000,
    tokens: over.tokens ?? 24_000,
    percent: over.percent ?? 12,
    breakdown: {
      // /context's rows: the prefix every request re-reads, the conversation, and what is left.
      categories: [
        { name: 'System prompt', tokens: 3_100, color: 'promptBorder', isDeferred: false, kind: 'used' },
        { name: 'System tools', tokens: 12_400, color: 'inactive', isDeferred: false, kind: 'used' },
        { name: 'MCP tools', tokens: 3_400, color: 'cyan', isDeferred: false, kind: 'used' },
        { name: 'MCP tools (deferred)', tokens: 1_100_000, color: 'cyan', isDeferred: true, kind: 'deferred' },
        { name: 'Messages', tokens: 4_000, color: 'purple', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 150_000, color: 'inactive', isDeferred: false, kind: 'free' },
      ],
      totalTokens: over.tokens ?? 24_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'model-default',
      percentage: over.percent ?? 12,
      gridRows: [],
      model: 'claude-opus-4-6',
      memoryFiles: [{ path: '/work/CLAUDE.md', type: 'project', tokens: 1_200 }],
      mcpTools: [{ name: 'search', serverName: 'docs', tokens: 3_000, isLoaded: true }, { name: 'fetch', serverName: 'docs', tokens: 400, isLoaded: true },
        // Behind ToolSearch: listed with its schema's size, but not in the window until searched for.
        { name: 'crawl', serverName: 'web', tokens: 1_100_000, isLoaded: false }],
      agents: [{ agentType: 'explorer', source: 'project', tokens: 800 }],
      autoCompactThreshold: 180_000,
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
  rateLimits: [],
})
