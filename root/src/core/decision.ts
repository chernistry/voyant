import type { RouterResultT } from '../schemas/router.js';

export function needWeather(r: RouterResultT) {
  const hasLoc = !!r.slots.city;
  const hasDate = !!r.slots.month || !!r.slots.dates;
  return hasLoc && hasDate && (r.intent === 'destinations' || r.intent === 'packing');
}


