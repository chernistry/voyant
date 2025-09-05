import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
export async function getAttractionFacts(city) {
    try {
        const q = encodeURIComponent(`${city} attractions`);
        const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${q}&limit=7`;
        const searchResult = await fetchJSON(searchUrl, { timeoutMs: 4000, retries: 1, target: 'wikipedia:search' });
        const titles = (searchResult?.pages ?? []).map(p => p.title).slice(0, 5);
        const facts = [];
        for (const title of titles) {
            try {
                const sumUrl = `https://en.wikipedia.org/w/rest.php/v1/page/summary/${encodeURIComponent(title)}`;
                const summary = await fetchJSON(sumUrl, { timeoutMs: 3000, retries: 1, target: 'wikipedia:summary' });
                if (summary?.title) {
                    facts.push({
                        source: 'Wikipedia',
                        key: 'poi',
                        value: {
                            title: summary.title,
                            description: summary.description ?? '',
                            page: summary?.content_urls?.desktop?.page
                        },
                        url: summary?.content_urls?.desktop?.page
                    });
                }
            }
            catch (e) {
                // Skip individual failures, continue with other titles
                continue;
            }
        }
        return facts;
    }
    catch (e) {
        if (e instanceof ExternalFetchError) {
            throw e;
        }
        throw new ExternalFetchError('network', `Wikipedia API error: ${e}`);
    }
}
