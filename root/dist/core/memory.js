const store = new Map();
const LIMIT = 8;
export function getThreadId(provided) {
    const id = (provided || '').trim();
    if (id) {
        // Enforce max length to satisfy schema and avoid runtime errors
        return id.length > 64 ? id.slice(0, 64) : id;
    }
    return Math.random().toString(36).slice(2, 10);
}
export function pushMessage(threadId, msg) {
    const arr = store.get(threadId) ?? [];
    arr.push(msg);
    const MAX = LIMIT * 2;
    while (arr.length > MAX)
        arr.shift();
    store.set(threadId, arr);
}
export function getContext(threadId) {
    return store.get(threadId) ?? [];
}
