import OpenAI from "openai";

// Suporta dois providers: "gemini" (padrao) ou "ollama" (local)
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

const SYSTEM_PROMPT = `You are an expert code reviewer. Analyze ONLY the provided git diff and return a JSON array of review comments.

Each comment must follow this exact structure:
{
  "path": "relative/path/to/file.js",
  "line": 42,
  "side": "REVISION",
  "message": "Specific review comment here"
}

Rules:
- Comment only on real defects that are directly evidenced by the diff.
- Only comment on added or changed lines from the REVISION side of the diff.
- Do not guess about code that is not visible in the diff.
- Do not invent generic security findings. For example, mention SQL injection only when the diff clearly builds SQL queries from untrusted input.
- Do not repeat the same message across unrelated lines.
- Do not make style-only comments unless the style issue can cause a bug or maintenance risk.
- Be concise and actionable: say what is wrong and how to fix it.
- If you are not sure a finding is real, do not comment.
- Return ONLY the raw JSON array, no markdown, no explanation.
- If there are no clear issues, return an empty array: []`;

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

function parseChangedRevisionLines(diff: string): Map<string, Set<number>> {
  const changedLines = new Map<string, Set<number>>();
  let currentPath: string | null = null;
  let revisionLine = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice("+++ b/".length);
      if (!changedLines.has(currentPath)) changedLines.set(currentPath, new Set());
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      revisionLine = Number(hunkMatch[1]);
      continue;
    }

    if (!currentPath || !revisionLine) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changedLines.get(currentPath)?.add(revisionLine);
      revisionLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }

    revisionLine += 1;
  }

  return changedLines;
}

function parseAiResponse(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

function isReviewComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object") return false;

  const comment = value as Partial<ReviewComment>;

  return (
    typeof comment.path === "string" &&
    comment.path.length > 0 &&
    Number.isInteger(comment.line) &&
    Number(comment.line) > 0 &&
    (comment.side === "REVISION" || comment.side === "PARENT") &&
    typeof comment.message === "string" &&
    comment.message.trim().length > 0
  );
}

function hasSqlContext(diff: string): boolean {
  return /\b(sql|query|select|insert|update|delete|from|where|join|prisma|sequelize|typeorm|knex|execute|raw|database|db\.)\b/i.test(diff);
}

function normalizeComments(rawComments: unknown[], diff: string): ReviewComment[] {
  const changedLines = parseChangedRevisionLines(diff);
  const allowSqlComments = hasSqlContext(diff);
  const seen = new Set<string>();

  return rawComments
    .filter(isReviewComment)
    .filter((comment) => comment.side === "REVISION")
    .filter((comment) => changedLines.get(comment.path)?.has(comment.line))
    .filter((comment) => allowSqlComments || !/sql\s*injection/i.test(comment.message))
    .map((comment) => ({
      ...comment,
      message: comment.message.trim(),
    }))
    .filter((comment) => {
      const key = `${comment.path}:${comment.line}:${comment.message.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    temperature: 0,
  });

  const raw = response.choices[0].message.content?.trim() ?? "";
  const parsed = parseAiResponse(raw);

  return normalizeComments(parsed, diff);
}
