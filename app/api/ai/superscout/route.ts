import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type SuperScoutAiRequest = {
  eventContext?: {
    year?: string;
    regional?: string;
    regionalCode?: string;
  };
  teamSummaries?: any[];
  matchReports?: any[];
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

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing GEMINI_API_KEY in environment variables.' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as SuperScoutAiRequest;
    const eventContext = body.eventContext || {};
    const teamSummaries = Array.isArray(body.teamSummaries) ? body.teamSummaries : [];
    const matchReports = Array.isArray(body.matchReports) ? body.matchReports : [];

    if (teamSummaries.length === 0 && matchReports.length === 0) {
      return NextResponse.json(
        { error: 'No super scout data was provided for analysis.' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const instruction = [
      'You are an FRC super-scout data analyst for alliance selection.',
      `Event: ${eventContext.year || 'Unknown'} ${eventContext.regional || 'Unknown'} (${eventContext.regionalCode || 'unknown'})`,
      '',
      'Task: Organize super scouting notes into team qualities.',
      'Output as concise Markdown with these sections in order:',
      '1) Top Team Qualities Matrix (table: Team | Reliability | Defense | Coordination | Strategy IQ | Foul Risk | Notes)',
      '2) Team-by-Team Summary (bullet list, one line each)',
      '3) Picklist Risk Flags (short bullets)',
      '',
      'Rules:',
      '- Ground every claim in provided notes.',
      '- If evidence is weak, state uncertainty.',
      '- Keep language direct for drive team use.'
    ].join('\n');

    const payload = {
      eventContext,
      teamSummaries,
      matchReports
    };

    const modelChain = DEFAULT_MODELS;
    let lastError: any = null;

    for (const model of modelChain) {
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: instruction },
                  { text: JSON.stringify(payload) }
                ]
              }
            ]
          });

          const text = response.text?.trim();
          return NextResponse.json({
            text: text || 'No AI response generated.',
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
    return NextResponse.json(
      {
        error:
          status === 429 || status === 503
            ? 'AI is under high demand right now. Please retry in a few seconds.'
            : lastError?.message || 'Unexpected error generating super scout analysis.'
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  } catch (error: any) {
    console.error('Super Scout AI route error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unexpected error generating super scout analysis.' },
      { status: 500 }
    );
  }
}
