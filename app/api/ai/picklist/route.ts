import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'user' | 'ai';
  content: string;
};

type AttachmentPayload = {
  mimeType: string;
  data: string;
} | null;

type PicklistAiRequest = {
  systemInstruction?: string;
  messages?: ChatMessage[];
  userMessage?: string;
  attachment?: AttachmentPayload;
};

const DEFAULT_MODELS = [
  'gemini-3.1-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash'
];

const MAX_RETRIES_PER_MODEL = 2;
const BASE_RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractStatusCode = (error: any): number | undefined => {
  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.code === 'number') return error.code;

  const message = String(error?.message || '');
  const match = message.match(/"code"\s*:\s*(\d{3})/);
  if (match) return Number(match[1]);

  return undefined;
};

const isRetryableError = (error: any) => {
  const status = extractStatusCode(error);
  return status === 429 || status === 500 || status === 503 || status === 504;
};

const getModelChain = () => {
  const fromEnv = process.env.GEMINI_PICKLIST_MODELS
    ?.split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return DEFAULT_MODELS;
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing GEMINI_API_KEY in environment variables.' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as PicklistAiRequest;
    const systemInstruction = body.systemInstruction?.trim();
    const userMessage = body.userMessage?.trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const attachment = body.attachment;

    if (!systemInstruction || !userMessage) {
      return NextResponse.json(
        { error: 'systemInstruction and userMessage are required.' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      ...messages.map((message) => ({
        role: (message.role === 'ai' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: message.content }]
      }))
    ];

    if (attachment?.mimeType && attachment?.data) {
      contents.push({
        role: 'user',
        parts: [{
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data
          }
        }]
      });
    }

    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const modelChain = getModelChain();
    let lastError: any = null;

    for (const model of modelChain) {
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents
          });

          const text = response.text?.trim();
          return NextResponse.json({
            text: text || "I'm sorry, I couldn't process that request.",
            model,
            attempts: attempt + 1
          });
        } catch (error: any) {
          lastError = error;
          const retryable = isRetryableError(error);
          const isLastAttempt = attempt === MAX_RETRIES_PER_MODEL;

          if (!retryable) {
            break;
          }

          if (!isLastAttempt) {
            const jitter = Math.floor(Math.random() * 250);
            const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + jitter;
            await sleep(delayMs);
            continue;
          }
        }
      }
    }

    const status = extractStatusCode(lastError) || 503;
    console.error('Picklist AI exhausted retries/models:', lastError);
    return NextResponse.json(
      {
        error:
          status === 429 || status === 503
            ? 'AI is under high demand right now. Please retry in a few seconds.'
            : lastError?.message || 'Unexpected error generating AI response.',
        status,
        modelsTried: modelChain
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  } catch (error: any) {
    console.error('Picklist AI route error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unexpected error generating AI response.' },
      { status: 500 }
    );
  }
}
