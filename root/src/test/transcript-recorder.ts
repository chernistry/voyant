import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

const TranscriptTurnSchema = z.object({
  testCase: z.string(),
  userMessage: z.string(),
  agentResponse: z.any(),
  latencyMs: z.number().optional(),
  timestamp: z.string().optional(),
});

const TranscriptSchema = z.object({
  testCase: z.string(),
  timestamp: z.string(),
  agentVersion: z.string(),
  environment: z.object({
    nodeVersion: z.string(),
    jestVersion: z.string(),
  }),
  conversation: z.array(z.object({
    turn: z.number(),
    timestamp: z.string(),
    userMessage: z.string(),
    agentResponse: z.any(),
    latencyMs: z.number().optional(),
  })),
});

type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
type Transcript = z.infer<typeof TranscriptSchema>;

export class TranscriptRecorder {
  private transcripts: Map<string, Transcript> = new Map();
  private turnCounters: Map<string, number> = new Map();
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.RECORD_TRANSCRIPTS === 'true';
  }

  async recordTurn(turn: TranscriptTurn): Promise<void> {
    if (!this.enabled) return;

    const { testCase, userMessage, agentResponse, latencyMs } = turn;
    
    if (!this.transcripts.has(testCase)) {
      this.transcripts.set(testCase, {
        testCase,
        timestamp: new Date().toISOString(),
        agentVersion: '1.0.0',
        environment: {
          nodeVersion: process.version,
          jestVersion: '29.7.0',
        },
        conversation: [],
      });
      this.turnCounters.set(testCase, 0);
    }

    const transcript = this.transcripts.get(testCase)!;
    const turnNumber = this.turnCounters.get(testCase)! + 1;
    this.turnCounters.set(testCase, turnNumber);

    transcript.conversation.push({
      turn: turnNumber,
      timestamp: new Date().toISOString(),
      userMessage,
      agentResponse,
      latencyMs,
    });
  }

  async saveTranscripts(): Promise<void> {
    if (!this.enabled || this.transcripts.size === 0) return;

    const outputDir = join(process.cwd(), 'deliverables', 'transcripts');
    await mkdir(outputDir, { recursive: true });

    for (const [testCase, transcript] of this.transcripts) {
      // Save JSON format
      const jsonPath = join(outputDir, `${testCase}.json`);
      await writeFile(jsonPath, JSON.stringify(transcript, null, 2));

      // Save Markdown format
      const markdownPath = join(outputDir, `${testCase}.md`);
      const markdown = this.formatAsMarkdown(transcript);
      await writeFile(markdownPath, markdown);
    }
  }

  private formatAsMarkdown(transcript: Transcript): string {
    const lines = [
      '# Travel Assistant Conversation Transcript',
      '',
      `**Test Case**: ${transcript.testCase}`,
      `**Date**: ${new Date(transcript.timestamp).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}`,
      `**Agent Version**: ${transcript.agentVersion}`,
      '',
      '## Conversation Flow',
      '',
    ];

    for (const turn of transcript.conversation) {
      lines.push(`**User**: ${turn.userMessage}`);
      lines.push('');
      
      const response = turn.agentResponse;
      let replyText = '';
      let sources = '';
      let threadId = '';
      
      if (typeof response === 'object' && response !== null) {
        replyText = response.reply || JSON.stringify(response);
        if (response.sources && Array.isArray(response.sources)) {
          sources = response.sources.join(', ');
        }
        threadId = response.threadId || '';
      } else {
        replyText = String(response);
      }

      lines.push(`**Assistant**: ${replyText}`);
      lines.push('');
      
      if (sources) {
        lines.push(`*Sources: ${sources}*`);
      }
      if (threadId) {
        lines.push(`*Thread ID: ${threadId}*`);
      }
      if (turn.latencyMs) {
        lines.push(`*Response Time: ${(turn.latencyMs / 1000).toFixed(2)}s*`);
      }
      
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  getTranscriptCount(): number {
    return this.transcripts.size;
  }

  clear(): void {
    this.transcripts.clear();
    this.turnCounters.clear();
  }
}
