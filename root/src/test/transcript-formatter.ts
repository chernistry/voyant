import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface FormattedTranscript {
  testCase: string;
  timestamp: string;
  agentVersion: string;
  environment: {
    nodeVersion: string;
    jestVersion: string;
  };
  conversation: Array<{
    turn: number;
    timestamp: string;
    userMessage: string;
    agentResponse: any;
    latencyMs?: number;
  }>;
}

export class TranscriptFormatter {
  static async generateDeliverables(transcripts: FormattedTranscript[]): Promise<void> {
    const outputDir = join(process.cwd(), 'deliverables');
    await mkdir(outputDir, { recursive: true });

    // Generate summary report
    const summaryPath = join(outputDir, 'transcript-summary.md');
    const summary = this.generateSummaryReport(transcripts);
    await writeFile(summaryPath, summary);

    // Generate combined transcript
    const combinedPath = join(outputDir, 'all-transcripts.md');
    const combined = this.generateCombinedTranscript(transcripts);
    await writeFile(combinedPath, combined);
  }

  private static generateSummaryReport(transcripts: FormattedTranscript[]): string {
    const lines = [
      '# Travel Assistant Test Transcript Summary',
      '',
      `Generated on: ${new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      '',
      '## Test Coverage',
      '',
      `Total test cases: ${transcripts.length}`,
      `Total conversation turns: ${transcripts.reduce((sum, t) => sum + t.conversation.length, 0)}`,
      '',
      '## Test Cases',
      '',
    ];

    for (const transcript of transcripts) {
      const avgLatency = transcript.conversation
        .filter(turn => turn.latencyMs)
        .reduce((sum, turn, _, arr) => sum + (turn.latencyMs! / arr.length), 0);

      lines.push(`### ${transcript.testCase}`);
      lines.push(`- Turns: ${transcript.conversation.length}`);
      lines.push(`- Average Response Time: ${avgLatency ? (avgLatency / 1000).toFixed(2) + 's' : 'N/A'}`);
      lines.push(`- Test Date: ${new Date(transcript.timestamp).toLocaleDateString()}`);
      lines.push('');
    }

    lines.push('## Key Features Demonstrated');
    lines.push('');
    lines.push('- Natural language understanding for travel queries');
    lines.push('- Context-aware responses with external data integration');
    lines.push('- Error handling and graceful degradation');
    lines.push('- Multi-turn conversation support');
    lines.push('- Source attribution and transparency');
    lines.push('');

    return lines.join('\n');
  }

  private static generateCombinedTranscript(transcripts: FormattedTranscript[]): string {
    const lines = [
      '# Complete Travel Assistant Test Transcripts',
      '',
      `Generated on: ${new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      '',
      'This document contains all conversation transcripts from the comprehensive test suite,',
      'demonstrating the Travel Assistant\'s capabilities across various scenarios.',
      '',
    ];

    for (const transcript of transcripts) {
      lines.push(`## ${transcript.testCase}`);
      lines.push('');
      lines.push(`**Test Date**: ${new Date(transcript.timestamp).toLocaleDateString()}`);
      lines.push(`**Agent Version**: ${transcript.agentVersion}`);
      lines.push('');

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
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}
