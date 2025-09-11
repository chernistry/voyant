export function composeWeatherReply(city?: string, when?: string, summary?: string, source = 'Open-Meteo'): string {
  const ctx = [city, when].filter(Boolean).join(' — ');
  return ctx ? `Weather for ${ctx}: ${summary} (${source})` : `Weather: ${summary} (${source})`;
}

export function composePackingReply(city?: string, when?: string, summary?: string, items: string[] = [], source?: string): string {
  const head = [city, when].filter(Boolean).join(' in ');
  const wxLine = summary ? `Weather: ${summary}${source ? ` (${source})` : ''}` : '';
  const list = items.length ? `\nPack: ${items.join(', ')}` : '';
  return `${head ? head + ': ' : ''}${wxLine}${list}`.trim();
}

export function composeAttractionsReply(city: string, attractions: string[], source = 'OpenTripMap'): string {
  const bullets = attractions.map(item => `• ${item}`).join('\n');
  return `${bullets} (${source})`;
}
