import { ReviewComment } from "./ai.js";

interface GerritComment {
  line: number;
  side: string;
  message: string;
}

interface PostCommentsParams {
  changeId: string;
  revision: string;
  comments: ReviewComment[];
}

interface GerritResult {
  ok: boolean;
  gerritResponse: unknown;
}

interface SkippedResult {
  skipped: boolean;
  reason: string;
}

const gerritBase = () => process.env.GERRIT_URL?.replace(/\/$/, "");
const gerritAuth = () =>
  Buffer.from(`${process.env.GERRIT_USER}:${process.env.GERRIT_PASSWORD}`)
    .toString("base64");

export async function postCommentsToGerrit(
  { changeId, revision, comments }: PostCommentsParams
): Promise<GerritResult | SkippedResult> {
  if (!comments.length) {
    return { skipped: true, reason: "No comments to post" };
  }

  const groupedComments = comments.reduce<Record<string, GerritComment[]>>(
    (acc, { path, line, side, message }) => {
      if (!acc[path]) acc[path] = [];
      acc[path].push({ line, side, message });
      return acc;
    },
    {}
  );

  const reviewInput = {
    tag: "ai-review",
    message: `🤖 AI Review: found ${comments.length} comment(s)`,
    comments: groupedComments,
  };

  const url = `${gerritBase()}/a/changes/${encodeURIComponent(changeId)}/revisions/${revision}/review`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${gerritAuth()}`,
    },
    body: JSON.stringify(reviewInput),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gerrit API error ${response.status}: ${text}`);
  }

  const text = await response.text();
  const json = JSON.parse(text.replace(/^\)]\}'\n/, ""));

  return { ok: true, gerritResponse: json };
}