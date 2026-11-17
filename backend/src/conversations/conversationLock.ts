// Two messages sent at once in one conversation would both read the same history and save out of order.
// Each conversation gets a queue: a message starts only after the previous one finished (or failed).
const queues = new Map<string, Promise<unknown>>();

export async function withConversationLock<T>(conversationId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(conversationId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  const tail = current.catch(() => undefined);
  queues.set(conversationId, tail);

  try {
    return await current;
  } finally {
    // Only the last waiter cleans up, so the map does not grow with old conversations.
    if (queues.get(conversationId) === tail) queues.delete(conversationId);
  }
}
