import { isAwardTitle } from './classify.mjs';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const SYSTEM = `You are Executive Signal Watch, a research analyst for the Faraday data-center intelligence engine.
You verify a single executive's current employment and detect any outstanding professional signal.

Use the web_search tool. Run these searches:
  1. "{Full Name}" {Employer}
  2. "{Full Name}" data center OR AI infrastructure

Rules:
- Ground every field in what you actually find. Never invent a signal. If you find nothing notable, signal_detected = false.
- A "signal" is a role/job change, a media mention or quote, a conference/panel speaking appearance, or notable public/social activity in roughly the last 12 months.
- If the provided current title looks like an award or recognition (e.g. "iM100 Award Winner") rather than a real job title, treat the given title as UNKNOWN. Determine the person's real current job title from search. Set title_confirmed = true only if you can confirm a real current job title; otherwise false.
- employer_confirmed = true only if search confirms the person is currently at the given employer (a parent/subsidiary of the same company counts).
- signal_type is the human category; source_type is the storage bucket.

Return ONLY a single JSON object, no prose, no code fences:
{
  "title_confirmed": boolean,
  "employer_confirmed": boolean,
  "signal_detected": boolean,
  "signal_type": "Job Change" | "Media Mention" | "Speaking Engagement" | "Social Activity" | "None",
  "source_type": "job_posting" | "social" | "web_news" | "none",
  "signal_summary": "one sentence, or empty string",
  "source_url": "url or empty string",
  "published_date": "YYYY-MM-DD or empty string"
}`;

function userPrompt(person) {
  const titleNote = isAwardTitle(person.currentTitle)
    ? `\nNOTE: the stored title "${person.currentTitle || '(blank)'}" is an award/placeholder, not a job title — find the real current title.`
    : '';
  return `Full Name: ${person.fullName}
Current Title (stored): ${person.currentTitle || '(none)'}
Employer (stored): ${person.employer || '(none)'}
Geography: ${person.geography || '(unknown)'}
LinkedIn: ${person.linkedin || '(none)'}${titleNote}`;
}

// Pull the JSON object out of the model's final answer, tolerating fences and
// any web_search commentary that leaked in.
export function extractJson(text) {
  if (!text) throw new Error('empty model response');
  let s = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object in model response');
  }
  return JSON.parse(s.slice(start, end + 1));
}

export async function classifyPerson(person, { signal } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: userPrompt(person) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return extractJson(text);
}
