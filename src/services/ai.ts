import OpenAI from "openai";

// Suporta dois providers: "gemini" (padrão) ou "ollama" (local)
const PROVIDER = process.env.AI_PROVIDER ?? "gemini";

const client = new OpenAI(
  PROVIDER === "ollama"
    ? {
        apiKey: "ollama",
        baseURL: `${process.env.OLLAMA_URL ?? "http://localhost:11434"}/v1`,
      }
    : {
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }
);

const MODEL =
  process.env.AI_MODEL ??
  (PROVIDER === "ollama" ? "codellama:13b" : "gemini-2.5-flash");

const SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided git diff and return a JSON array of review comments.

Each comment must follow this exact structure:
{
  "path": "relative/path/to/file.js",
  "line": 42,
  "side": "REVISION",
  "message": "Your review comment here"
}

Rules:
- Only comment on lines that have real issues (bugs, security, performance, style, best practices)
- Do NOT praise good code, only flag problems
- Be concise and actionable — say what's wrong AND how to fix it
- Return ONLY the raw JSON array, no markdown, no explanation
- If there are no issues, return an empty array: []`;

export interface ReviewComment {
  path: string;
  line: number;
  side: "REVISION" | "PARENT";
  message: string;
}

interface ReviewParams {
  diff: string;
  project?: string;
  branch?: string;
}

export async function reviewWithAI({
  diff,
  project,
  branch,
}: ReviewParams): Promise<ReviewComment[]> {
  const userPrompt = [
    project && `Project: ${project}`,
    branch && `Target branch: ${branch}`,
    `\nGit diff to review:\n\`\`\`diff\n${diff}\n\`\`\``,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  });

  const raw = response.choices[0].message.content?.trim() ?? "";

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Expected array");
    return parsed as ReviewComment[];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as ReviewComment[];
    return [];
  }
}