export const MAX_CONTEXT_MESSAGES = 20;

interface ChatHistoryMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/**
 * Truncate chat history to fit within context window limits.
 * Keeps the most recent MAX_CONTEXT_MESSAGES and prepends a summary
 * of the earlier conversation to preserve context.
 */
export function truncateHistory(history: ChatHistoryMessage[]): ChatHistoryMessage[] {
  if (history.length <= MAX_CONTEXT_MESSAGES) {
    return history;
  }

  const cutoff = history.length - MAX_CONTEXT_MESSAGES;
  const olderMessages = history.slice(0, cutoff);
  const recentMessages = history.slice(cutoff);

  const topicSummary = olderMessages
    .filter(m => m.role === 'user')
    .map(m => m.parts[0]?.text?.slice(0, 100))
    .filter(Boolean)
    .join('; ');

  // Use 'model' role for summary if first recent message is 'user' to maintain
  // strict alternating user/model roles required by the Gemini API
  const summaryRole = recentMessages[0]?.role === 'user' ? 'model' : 'user';

  const summaryMessage: ChatHistoryMessage = {
    role: summaryRole,
    parts: [{
      text: `[Earlier conversation summary — ${olderMessages.length} messages about: ${topicSummary || 'general discussion'}. Continue from the recent context below.]`
    }]
  };

  return [summaryMessage, ...recentMessages];
}
