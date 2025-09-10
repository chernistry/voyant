import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getWeather } from '../../tools/weather.js';

export const weatherTool = createTool({
  id: 'get_weather',
  description: 'Get weather information for a specific city',
  inputSchema: z.object({
    city: z.string(),
    datesOrMonth: z.string().optional(),
  }),
  execute: async ({ context }) => getWeather(context),
});
