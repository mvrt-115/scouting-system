import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MODEL = 'gemma-3-27b-it';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY in environment variables.' }, { status: 500 });
    }

    const body = (await req.json()) as {
      eventContext?: { year?: string; regional?: string; regionalCode?: string };
      teamSummaries?: any[];
      matchReports?: any[];
    };

    const ai = new GoogleGenAI({ apiKey });
    const payload = {
      eventContext: body.eventContext || {},
      teamSummaries: Array.isArray(body.teamSummaries) ? body.teamSummaries : [],
      matchReports: Array.isArray(body.matchReports) ? body.matchReports : [],
    };

    if (payload.teamSummaries.length === 0 && payload.matchReports.length === 0) {
      return NextResponse.json({ error: 'No scouting data was provided.' }, { status: 400 });
    }

    const prompt = [
      'You are the MVRT scouting analyst for the 2026 FRC event.',
      `Event: ${payload.eventContext.year || 'Unknown'} ${payload.eventContext.regional || 'Unknown'} (${payload.eventContext.regionalCode || 'unknown'})`,
      '',
      'Use the provided team summaries and super scout notes.',
      'Return concise Markdown with these sections:',
      '1. Top Teams',
      '2. Sleepers',
      '3. Risk Flags',
      '4. Match Strategy Notes',
      '',
      'Keep each bullet short and grounded in the provided data.',
    ].join('\n');

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }, { text: JSON.stringify(payload) }] }],
    });

    return NextResponse.json({ text: response.text?.trim() || 'No AI response generated.', model: MODEL });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unexpected error generating AI summary.' }, { status: 500 });
  }
}
