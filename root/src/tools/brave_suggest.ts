import { fetchJSON } from '../util/fetch.js';

export async function braveSuggest(
  q: string,
  opts: { count?: number; country?: string } = {},
): Promise<string[]> {
  const params = new URLSearchParams({ q });
  if (opts.country) params.set('country', opts.country);
  if (opts.count) params.set('count', String(opts.count));

  const url = `https://api.search.brave.com/res/v1/suggest/search?${params.toString()}`;
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const res = await fetchJSON<any>(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    target: 'brave-suggest',
  });
  const items: string[] = (res?.suggestions ?? res?.results ?? [])
    .map((s: any) => (typeof s === 'string' ? s : s?.query || s?.text))
    .filter(Boolean);
  return Array.from(new Set(items));
}

