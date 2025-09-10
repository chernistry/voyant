# Mastra Integration Implementation Ticket

## Overview

This ticket describes the complete integration of Mastra into the Voyant travel assistant. Mastra is a TypeScript framework for building AI agents with typed tools, durable workflows, and RAG pipelines. This integration will replace the existing node-based architecture with Mastra agents while preserving all existing functionality.

## Current Architecture Analysis

### Core Components

1. **Graph-based Flow Engine** (`/src/core/graph.ts`)
   - Main orchestrator routing user messages to specialized nodes
   - Contains nodes for weather, attractions, packing, destinations, policy, and web search
   - Implements consent mechanisms for web search and complex queries
   - Uses thread slots for stateful context management

2. **Intent Classification** (`/src/core/router.ts`, `/src/core/transformers-classifier.ts`)
   - Uses Transformers.js with `Xenova/nli-deberta-v3-base` for zero-shot classification
   - Implements cascade fallback: Transformers.js → LLM → Rule-based heuristics
   - Handles multilingual input with language detection

3. **Fact Blending** (`/src/core/blend.ts`)
   - Combines external data with LLM responses
   - Implements citation validation and source attribution
   - Includes verification mechanisms to prevent hallucinations

4. **External Tools** (`/src/tools/`)
   - Weather: Open-Meteo API with Brave Search fallback
   - Attractions: OpenTripMap API with Brave Search fallback
   - Country information: REST Countries API with Brave Search fallback
   - Web search: Brave Search API with Crawlee for deep research
   - Policy RAG: Vectara integration for airline/hotel/visa policies

5. **Resilience Features**
   - Circuit breaker pattern (`opossum`)
   - Rate limiting (`bottleneck`)
   - Retry mechanisms with exponential backoff

## Integration Plan

### Phase 1: Setup and Configuration

#### 1.1 Install Mastra Dependencies
```bash
cd root
npm install @mastra/core @mastra/cli --save
```

#### 1.2 Create Mastra Entry Point
Create `src/mastra/index.ts` to export configured Mastra instance:

```ts
// src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { travelAgent } from './agents/travel.agent.js';
import { tools } from './tools/index.js';
import { workflows } from './workflows/index.js';

export const mastra = new Mastra({
  agents: [travelAgent],
  tools,
  workflows,
});

export { travelAgent } from './agents/travel.agent.js';
export { tools } from './tools/index.js';
export { workflows } from './workflows/index.js';
```

#### 1.3 Expose Mastra Instance
Update `src/index.ts`:

```ts
// src/index.ts
export * from './mastra/index.js';
```

#### 1.4 Update Build Configuration
Modify `tsconfig.json` and `tsconfig.build.json` to include the new mastra directory in compilation.

### Phase 2: Agent Creation

#### 2.1 Create Travel Agent
Create `src/mastra/agents/travel.agent.ts`:

```ts
import { createAgent } from '@mastra/core';
import { tools } from '../tools/index.js';
import { z } from 'zod';

export const travelAgent = createAgent({
  name: 'voyant',
  model: 'gpt-4o-mini', // Match existing LLM configuration
  tools,
  instructions: `You are Voyant, an AI travel assistant that helps users with weather, attractions, packing recommendations, and destination suggestions.
  
  Key principles:
  - Always ground responses in factual data from tools
  - Provide clear citations for all information
  - Handle multilingual input gracefully
  - Maintain conversation context through thread slots
  - Request user consent before performing web searches
  - Avoid hallucinations by verifying information through tools`,
});
```

### Phase 3: Tool Conversion

#### 3.1 Weather Tool
Convert `src/tools/weather.ts` to Mastra tool format in `src/mastra/tools/weather.tool.ts`:

```ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { getWeather } from '../../tools/weather.js';

export const weatherTool = createTool({
  name: 'get_weather',
  description: 'Get weather information for a specific city',
  schema: z.object({
    city: z.string().describe('The city to get weather for'),
    datesOrMonth: z.string().optional().describe('Specific dates or month for weather forecast')
  }),
  executor: async ({ city, datesOrMonth }) => {
    try {
      const result = await getWeather({ city, datesOrMonth });
      return result;
    } catch (error) {
      throw new Error(`Failed to get weather: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});
```

#### 3.2 Attractions Tool
Convert `src/tools/attractions.ts` to Mastra tool format in `src/mastra/tools/attractions.tool.ts`:

```ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { getAttractions } from '../../tools/attractions.js';

export const attractionsTool = createTool({
  name: 'get_attractions',
  description: 'Get attractions and points of interest for a specific city',
  schema: z.object({
    city: z.string().describe('The city to get attractions for'),
    limit: z.number().optional().default(7).describe('Maximum number of attractions to return'),
    profile: z.enum(['default', 'kid_friendly']).optional().default('default').describe('Attraction profile type')
  }),
  executor: async ({ city, limit, profile }) => {
    try {
      const result = await getAttractions({ city, limit, profile });
      return result;
    } catch (error) {
      throw new Error(`Failed to get attractions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});
```

#### 3.3 Policy RAG Tool
Convert policy functionality to Mastra tool format in `src/mastra/tools/policy.tool.ts`:

```ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { PolicyAgent } from '../../core/policy_agent.js';

export const policyTool = createTool({
  name: 'get_policy_info',
  description: 'Get policy information for airlines, hotels, or visa requirements',
  schema: z.object({
    question: z.string().describe('The policy question to answer'),
    corpusHint: z.enum(['airlines', 'hotels', 'visas']).optional().describe('Hint for which policy corpus to use')
  }),
  executor: async ({ question, corpusHint }) => {
    try {
      const agent = new PolicyAgent();
      const result = await agent.answer(question, corpusHint);
      return result;
    } catch (error) {
      throw new Error(`Failed to get policy info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});
```

#### 3.4 Web Search Tool
Convert `src/tools/brave_search.ts` to Mastra tool format in `src/mastra/tools/websearch.tool.ts`:

```ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { searchTravelInfo } from '../../tools/brave_search.js';

export const webSearchTool = createTool({
  name: 'web_search',
  description: 'Search the web for travel information',
  schema: z.object({
    query: z.string().describe('The search query'),
    deepResearch: z.boolean().optional().default(false).describe('Whether to perform deep research')
  }),
  executor: async ({ query, deepResearch }) => {
    try {
      const result = await searchTravelInfo(query, undefined, deepResearch);
      return result;
    } catch (error) {
      throw new Error(`Failed to perform web search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});
```

#### 3.5 Tool Index
Create `src/mastra/tools/index.ts` to export all tools:

```ts
import { weatherTool } from './weather.tool.js';
import { attractionsTool } from './attractions.tool.js';
import { policyTool } from './policy.tool.js';
import { webSearchTool } from './websearch.tool.js';

export const tools = {
  weatherTool,
  attractionsTool,
  policyTool,
  webSearchTool
};

export { weatherTool, attractionsTool, policyTool, webSearchTool };
```

### Phase 4: Workflow Creation

#### 4.1 Complex Query Workflow
Create `src/mastra/workflows/complex-query.workflow.ts`:

```ts
import { createWorkflow } from '@mastra/core';
import { z } from 'zod';

export const complexQueryWorkflow = createWorkflow({
  name: 'complex_query_handler',
  inputSchema: z.object({
    query: z.string(),
    threadId: z.string()
  })
});

complexQueryWorkflow
  .step('analyze_query', {
    execute: async ({ query }) => {
      // Analyze the complexity of the query
      // This would integrate with existing complexity detection logic
      return { isComplex: query.length > 100 };
    }
  })
  .step('request_consent', {
    execute: async () => {
      // Request user consent for complex operations
      return { consent: 'pending' };
    }
  })
  .step('execute_search', {
    execute: async ({ query }) => {
      // Execute web search for complex queries
      return { results: [] };
    }
  });
```

#### 4.2 Workflow Index
Create `src/mastra/workflows/index.ts`:

```ts
import { complexQueryWorkflow } from './complex-query.workflow.js';

export const workflows = {
  complexQueryWorkflow
};

export { complexQueryWorkflow };
```

### Phase 5: RAG Integration

#### 5.1 Vectara Vector Store Adapter
Create `src/mastra/vector/vectara.adapter.ts`:

```ts
import { VectorStore } from '@mastra/core';
import { VectaraClient } from '../../tools/vectara.js';

export class VectaraVectorStore extends VectorStore {
  private client: VectaraClient;

  constructor() {
    super();
    this.client = new VectaraClient();
  }

  async search(query: string, options?: { corpus?: string; maxResults?: number }) {
    try {
      const result = await this.client.query(query, options);
      return result;
    } catch (error) {
      throw new Error(`Vectara search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async upsert(documents: Array<{ id: string; content: string; metadata?: Record<string, any> }>) {
    // Implementation for adding documents to Vectara
    throw new Error('Upsert not implemented for Vectara adapter');
  }
}
```

### Phase 6: Memory Integration

#### 6.1 Slot Memory Adapter
Create `src/mastra/memory/slot-memory.adapter.ts`:

```ts
import { Memory } from '@mastra/core';
import { getThreadSlots, updateThreadSlots } from '../../core/slot_memory.js';

export class SlotMemory extends Memory {
  async get(threadId: string): Promise<Record<string, any>> {
    return getThreadSlots(threadId);
  }

  async set(threadId: string, data: Record<string, any>): Promise<void> {
    updateThreadSlots(threadId, data, []);
  }

  async update(threadId: string, data: Record<string, any>): Promise<void> {
    const existing = await this.get(threadId);
    const updated = { ...existing, ...data };
    await this.set(threadId, updated);
  }
}
```

### Phase 7: Agent Integration into Graph

#### 7.1 Update Graph Node Functions
Modify `src/core/graph.ts` to use Mastra agents instead of direct tool calls:

```ts
// In src/core/graph.ts, replace existing node functions

import { travelAgent } from '../mastra/agents/travel.agent.js';

async function weatherNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  try {
    const result = await travelAgent.exec('get_weather', {
      city: slots?.city,
      datesOrMonth: slots?.dates || slots?.month
    });
    
    const reply = result.summary ? `${result.summary} (${result.source})` : 'Unable to get weather information';
    const finalReply = disclaimer ? disclaimer + reply : reply;
    
    return { done: true, reply: finalReply, citations: result.source ? [result.source] : undefined };
  } catch (error) {
    // Fallback to existing blendWithFacts logic
    return await fallbackWeatherNode(ctx, slots, logger, disclaimer);
  }
}

async function attractionsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  try {
    const result = await travelAgent.exec('get_attractions', {
      city: slots?.city,
      limit: 7,
      profile: /kid/i.test(ctx.msg) ? 'kid_friendly' : 'default'
    });
    
    if (result.ok) {
      const sourceName = result.source === 'opentripmap' ? 'OpenTripMap' : 'Brave Search';
      const baseReply = `Here are some attractions in ${slots?.city}:

${result.summary}

Source: ${sourceName}`;
      const finalReply = disclaimer ? disclaimer + baseReply : baseReply;
      const citations = result.source ? [sourceName] : [];
      
      return { done: true, reply: finalReply, citations };
    } else {
      // Fallback to web search
      return webSearchNode(ctx, { ...slots, search_query: `${slots?.city} attractions things to do` }, logger);
    }
  } catch (error) {
    // Fallback to existing implementation
    return await fallbackAttractionsNode(ctx, slots, logger, disclaimer);
  }
}

async function policyNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger }
): Promise<NodeOut> {
  try {
    const result = await travelAgent.exec('get_policy_info', {
      question: ctx.msg
    });
    
    const formattedAnswer = formatPolicyAnswer(result.answer, result.citations);
    const citationTitles = result.citations.map(c => c.title || c.url || 'Internal Knowledge Base');
    
    return { 
      done: true, 
      reply: formattedAnswer, 
      citations: citationTitles 
    };
  } catch (error) {
    // Fallback to web search
    return webSearchNode(ctx, slots, logger);
  }
}
```

### Phase 8: Observability Integration

#### 8.1 OpenTelemetry Configuration
Create `src/mastra/otel.ts`:

```ts
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { LangfuseExporter } from 'langfuse-opentelemetry-exporter';

// Initialize OpenTelemetry
const provider = new NodeTracerProvider();
const exporter = new LangfuseExporter({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

export const tracer = trace.getTracer('voyant-mastra');
```

### Phase 9: Testing Strategy

#### 9.1 Unit Tests
Create unit tests for each Mastra tool in `tests/mastra/tools/`:

```ts
// tests/mastra/tools/weather.tool.test.ts
import { weatherTool } from '../../../src/mastra/tools/weather.tool.js';

describe('Weather Tool', () => {
  it('should get weather information for a city', async () => {
    const result = await weatherTool.executor({ city: 'London' });
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('summary');
  });

  it('should handle errors gracefully', async () => {
    await expect(weatherTool.executor({ city: 'InvalidCityName' }))
      .rejects.toThrow();
  });
});
```

#### 9.2 Integration Tests
Create integration tests in `tests/mastra/integration/`:

```ts
// tests/mastra/integration/agent.test.ts
import { travelAgent } from '../../../src/mastra/agents/travel.agent.js';

describe('Travel Agent Integration', () => {
  it('should handle weather queries', async () => {
    const result = await travelAgent.generate('What is the weather in Paris?');
    expect(result).toContain('weather');
  });

  it('should handle attractions queries', async () => {
    const result = await travelAgent.generate('What are the top attractions in Tokyo?');
    expect(result).toContain('attractions');
  });
});
```

#### 9.3 Workflow Tests
Create workflow tests in `tests/mastra/workflows/`:

```ts
// tests/mastra/workflows/complex-query.workflow.test.ts
import { complexQueryWorkflow } from '../../../src/mastra/workflows/complex-query.workflow.js';

describe('Complex Query Workflow', () => {
  it('should analyze and handle complex queries', async () => {
    const result = await complexQueryWorkflow.execute({
      query: 'Plan a family trip from New York to Paris with a budget of $5000',
      threadId: 'test-thread'
    });
    
    expect(result).toHaveProperty('isComplex', true);
  });
});
```

### Phase 10: Deployment Configuration

#### 10.1 Environment Variables
Update `.env.example` with Mastra-specific variables:

```env
# Mastra Configuration
MASTRA_MODEL=gpt-4o-mini
MASTRA_LOG_LEVEL=info

# Observability
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

#### 10.2 Lambda Deployment
Ensure the bundled project works with AWS Lambda:

1. Update `package.json` build scripts to include Mastra files
2. Verify Node 18+ runtime compatibility
3. Include Playwright binaries in Lambda layers when needed

## Implementation Steps

### Step 1: Setup and Installation (Day 1)
- Install Mastra dependencies
- Create directory structure
- Set up basic configuration

### Step 2: Tool Conversion (Days 2-3)
- Convert weather tool
- Convert attractions tool
- Convert policy tool
- Convert web search tool
- Create tool index

### Step 3: Agent Creation (Day 4)
- Create travel agent
- Define agent instructions
- Test basic agent functionality

### Step 4: Workflow Development (Day 5)
- Create complex query workflow
- Create workflow index
- Test workflow execution

### Step 5: RAG and Memory Integration (Day 6)
- Create Vectara adapter
- Create slot memory adapter
- Integrate with Mastra instance

### Step 6: Graph Integration (Days 7-8)
- Update weather node to use Mastra agent
- Update attractions node to use Mastra agent
- Update policy node to use Mastra agent
- Test node integrations

### Step 7: Observability (Day 9)
- Set up OpenTelemetry
- Configure Langfuse exporter
- Test tracing

### Step 8: Testing (Days 10-12)
- Write unit tests for tools
- Write integration tests for agents
- Write workflow tests
- Run existing E2E tests

### Step 9: Deployment Preparation (Day 13)
- Update environment variables
- Verify Lambda compatibility
- Test deployment bundle

## Success Criteria

1. **Functional Parity**
   - All existing functionality preserved
   - Same user experience maintained
   - Golden transcripts continue to pass

2. **Performance**
   - Response times maintained or improved
   - Error rates consistent or reduced
   - Resource usage within acceptable limits

3. **Type Safety**
   - Full TypeScript type coverage
   - Proper Zod schema validation
   - No runtime type errors

4. **Reliability**
   - Existing circuit breaker patterns preserved
   - Rate limiting maintained
   - Error handling improved

5. **Observability**
   - Traces exported to Langfuse
   - Metrics available in Prometheus
   - PII properly redacted

6. **Testing**
   - All existing tests pass
   - New unit tests achieve 80%+ coverage
   - Integration tests validate end-to-end flows

## Rollback Plan

If issues arise during integration:

1. **Immediate Rollback**
   - Revert graph.ts changes to restore original node functions
   - Remove Mastra dependencies from package.json
   - Restore original build configuration

2. **Partial Rollback**
   - Disable specific Mastra agents while keeping others
   - Fall back to original tool implementations
   - Maintain hybrid approach until issues resolved

3. **Monitoring**
   - Monitor error rates and response times
   - Track user feedback and complaints
   - Watch for deployment-specific issues

## Dependencies

- Existing Transformers.js integration must be preserved
- Brave Search, Open-Meteo, OpenTripMap, and Vectara integrations must continue working
- Circuit breaker and rate limiting patterns must be maintained
- All existing environment variables must continue to work

## Risks and Mitigations

### Risk 1: Performance Degradation
**Mitigation**: 
- Profile Mastra agent calls
- Optimize tool execution
- Maintain existing caching mechanisms

### Risk 2: Type Conflicts
**Mitigation**:
- Use explicit type conversions
- Maintain Zod schema compatibility
- Test with existing data structures

### Risk 3: Context Loss
**Mitigation**:
- Preserve thread slot integration
- Test multi-turn conversations
- Validate context persistence

### Risk 4: Deployment Issues
**Mitigation**:
- Test Lambda deployment early
- Verify dependency compatibility
- Prepare rollback procedures

## Acceptance Criteria

- [ ] All existing E2E tests pass
- [ ] New unit tests achieve 80%+ coverage
- [ ] Performance metrics maintained
- [ ] No breaking changes to CLI or API
- [ ] Documentation updated
- [ ] Deployment successful
- [ ] Observability working
- [ ] Golden transcripts validated