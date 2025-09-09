import { pipeline } from '@xenova/transformers';

let consentPipeline: any = null;

export async function classifyConsent(message: string): Promise<'yes' | 'no' | 'unclear'> {
  try {
    if (!consentPipeline) {
      consentPipeline = await pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-base');
    }

    const labels = ['positive consent', 'negative consent', 'unclear response'];
    const result = await consentPipeline(message, labels);
    
    const topLabel = result.labels[0];
    const confidence = result.scores[0];
    
    // Require high confidence for AI classification
    if (confidence > 0.7) {
      if (topLabel === 'positive consent') return 'yes';
      if (topLabel === 'negative consent') return 'no';
    }
    
    return 'unclear';
  } catch (error) {
    console.log('🔍 CONSENT: Transformers classification failed', error);
    return 'unclear';
  }
}
