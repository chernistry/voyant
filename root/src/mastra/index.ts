import { Mastra } from '@mastra/core';
import { travelAgent } from './agents/travel.agent.js';
import { tools } from './tools/index.js';
import { workflows } from './workflows/index.js';

export const mastra = new Mastra({
  agents: { travelAgent },
  workflows,
});

export { travelAgent } from './agents/travel.agent.js';
export { tools } from './tools/index.js';
export { workflows } from './workflows/index.js';
