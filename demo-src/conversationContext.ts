export type ConversationMessage = { role: "user" | "assistant"; content: string };

/** A model status sentence is not a delivered answer and should not teach the next turn. */
export function isProgressOnlyReply(content: string): boolean {
  const text = content.trim().replace(/[.!…]+$/, "");
  return text.length < 100
    && !text.includes("\n")
    && /^(?:(?:i'm|i am|we're|we are)\s+)?(?:testing|checking|loading|processing|preparing|working on|analyzing)\b/i.test(text)
    && !/\b(?:can|means|requires|because|when)\b/i.test(text);
}

/** Keep the most recent completed turns within the tiny local model's budget. */
export function selectRecentHistory(messages: readonly ConversationMessage[], maxCharacters = 3000): ConversationMessage[] {
  const selected: ConversationMessage[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) {
    if (!message.content.trim() || message.content === "Thinking on this device…" || message.content.startsWith("I couldn't answer yet:") || (message.role === "assistant" && isProgressOnlyReply(message.content))) continue;
    if (selected.length >= 16 || used + message.content.length > maxCharacters) break;
    selected.push({ role: message.role, content: message.content });
    used += message.content.length;
  }
  return selected.reverse();
}
