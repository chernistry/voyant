type Msg = { role: 'user' | 'assistant' | 'system'; content: string };
const store = new Map<string, Msg[]>();
const LIMIT = 8;

export function getThreadId(provided?: string) {
  return provided ?? Math.random().toString(36).slice(2, 10);
}

export function pushMessage(threadId: string, msg: Msg) {
  const arr = store.get(threadId) ?? [];
  arr.push(msg);
  const MAX = LIMIT * 2;
  while (arr.length > MAX) arr.shift();
  store.set(threadId, arr);
}

export function getContext(threadId: string): Msg[] {
  return store.get(threadId) ?? [];
}


