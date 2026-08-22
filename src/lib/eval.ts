import OpenAI from "openai";
import { llmAvailable, openaiModel } from "./llm";
import type { LlmsDocument } from "./types";

export interface EvalQuestion {
  question: string;
  /** URL the question was written from. */
  expectedUrl: string;
  /** URL the model picked when it could only see the llms.txt index. */
  chosenUrl: string | null;
  correct: boolean;
}

export interface EvalReport {
  accuracy: number;
  questions: EvalQuestion[];
  /** Links that were picked when a different page was the right answer. */
  ambiguous: { url: string; title: string; reason: string }[];
}

const QUESTION_COUNT = 8;

const WRITER_PROMPT = `You write realistic questions a person would ask an AI assistant about a company or product.
You receive a list of that site's pages (id, title, description). Return JSON only:
{"questions": [{"id": number, "question": string}]}
Rules:
- One question per entry, each derived from a different page id.
- Write the question the way a user would ask it, never quoting the page title verbatim.
- The question must be answerable only by that page, not by a general web search.
- Max 20 words each.`;

const READER_PROMPT = `You are an AI agent choosing which page to fetch, using only an llms.txt index.
You receive the index (id, title, description) and a list of questions. Return JSON only:
{"answers": [{"question": number, "id": number}]}
Pick exactly one index entry per question — the single page you would fetch to answer it. Never invent ids.`;

/**
 * Measures whether the generated index is actually usable for retrieval: an LLM
 * writes questions from the crawled pages, then a second call has to find the
 * right page using nothing but the llms.txt link titles and notes. A low score
 * means the descriptions do not disambiguate the pages.
 */
export async function evaluateRetrieval(document: LlmsDocument): Promise<EvalReport> {
  if (!llmAvailable()) throw new Error("OPENAI_API_KEY is not set");

  const links = document.sections.flatMap((section) => section.links);
  if (links.length < 3) throw new Error("Need at least 3 links to run a retrieval eval");

  const index = links.map((link, id) => ({
    id,
    title: link.title,
    description: link.notes ?? "",
  }));

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const written = await complete(client, WRITER_PROMPT, {
    site: document.title,
    pages: index.slice(0, 40),
    count: QUESTION_COUNT,
  });

  const asked = readQuestions(written, links.length).slice(0, QUESTION_COUNT);
  if (asked.length === 0) throw new Error("The model did not return usable questions");

  const answered = await complete(client, READER_PROMPT, {
    index,
    questions: asked.map((item, position) => ({ question: position, text: item.question })),
  });
  const picks = readAnswers(answered, links.length);

  const questions: EvalQuestion[] = asked.map((item, position) => {
    const chosen = picks.get(position);
    return {
      question: item.question,
      expectedUrl: links[item.id].url,
      chosenUrl: chosen === undefined ? null : links[chosen].url,
      correct: chosen === item.id,
    };
  });

  const ambiguous = questions
    .filter((entry) => !entry.correct && entry.chosenUrl)
    .map((entry) => {
      const link = links.find((candidate) => candidate.url === entry.chosenUrl);
      return {
        url: entry.chosenUrl as string,
        title: link?.title ?? entry.chosenUrl ?? "",
        reason: `Picked over ${entry.expectedUrl} for "${entry.question}"`,
      };
    });

  const correct = questions.filter((entry) => entry.correct).length;
  return {
    accuracy: Math.round((correct / questions.length) * 100),
    questions,
    ambiguous,
  };
}

async function complete(client: OpenAI, system: string, payload: unknown): Promise<unknown> {
  const completion = await client.chat.completions.create({
    model: openaiModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("The model returned an empty response");
  return JSON.parse(raw);
}

function readQuestions(raw: unknown, linkCount: number): { id: number; question: string }[] {
  const list = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(list)) return [];
  const seen = new Set<number>();
  const questions: { id: number; question: string }[] = [];

  for (const entry of list) {
    const item = entry as { id?: unknown; question?: unknown };
    const id = Number(item.id);
    const question = typeof item.question === "string" ? item.question.trim() : "";
    if (!Number.isInteger(id) || id < 0 || id >= linkCount || seen.has(id) || !question) continue;
    seen.add(id);
    questions.push({ id, question });
  }
  return questions;
}

function readAnswers(raw: unknown, linkCount: number): Map<number, number> {
  const list = (raw as { answers?: unknown }).answers;
  const picks = new Map<number, number>();
  if (!Array.isArray(list)) return picks;

  for (const entry of list) {
    const item = entry as { question?: unknown; id?: unknown };
    const question = Number(item.question);
    const id = Number(item.id);
    if (!Number.isInteger(question) || !Number.isInteger(id) || id < 0 || id >= linkCount) continue;
    picks.set(question, id);
  }
  return picks;
}
