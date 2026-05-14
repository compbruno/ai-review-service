import type { FastifyInstance } from "fastify";
import tracer from "../tracer.js";
import { metrics } from "../observability/metrics.js";
import { reviewWithAI } from "../services/ai.js";
import { postCommentsToGerrit } from "../services/gerrit.js";

const reviewSchema = {
  body: {
    type: "object",
    required: ["changeId", "revision", "diff"],
    properties: {
      changeId: { type: "string" },
      revision: { type: "string" },
      project: { type: "string" },
      branch: { type: "string" },
      diff: { type: "string" },
    },
  },
};

interface ReviewBody {
  changeId: string;
  revision: string;
  project?: string;
  branch?: string;
  diff: string;
}

const elapsedSince = (startedAt: number) => Date.now() - startedAt;

export async function reviewRoute(fastify: FastifyInstance) {
  fastify.post<{Body: ReviewBody}>("/review", { schema: reviewSchema }, async (request, reply) => {
    const requestStartedAt = Date.now();
    const { changeId, revision, project, branch, diff } = request.body;
    const provider = process.env.AI_PROVIDER ?? "gemini";
    const model = process.env.AI_MODEL || (provider === "ollama" ? "codellama:13b" : "gemini-2.5-flash");
    const tags = [`provider:${provider}`, `model:${model}`];

    return tracer.trace(
      "ai_review.request",
      {
        resource: "POST /review",
        tags: {
          "gerrit.change_id": changeId,
          "gerrit.revision": revision,
          "gerrit.project": project,
          "gerrit.branch": branch,
          "ai.provider": provider,
          "ai.model": model,
        },
      },
      async () => {
        metrics.increment("review.requests", tags);
        metrics.gauge("review.diff_bytes", Buffer.byteLength(diff, "utf8"), tags);

        request.log.info({ changeId, revision, project, branch, provider, model }, "Starting AI review");

        try {
          const aiStartedAt = Date.now();
          const aiComments = await tracer.trace(
            "ai_review.ai.generate_comments",
            {
              resource: model,
              tags: {
                "ai.provider": provider,
                "ai.model": model,
                "gerrit.project": project,
                "gerrit.branch": branch,
              },
            },
            () => reviewWithAI({ diff, project, branch })
          );

          metrics.timing("review.ai.duration_ms", elapsedSince(aiStartedAt), tags);
          metrics.gauge("review.comments", aiComments.length, tags);

          let gerritResult = null;
          if (process.env.GERRIT_URL) {
            const gerritStartedAt = Date.now();
            gerritResult = await tracer.trace(
              "ai_review.gerrit.post_comments",
              {
                resource: "POST /changes/:id/revisions/:revision/review",
                tags: {
                  "gerrit.change_id": changeId,
                  "gerrit.revision": revision,
                  "gerrit.comment_count": aiComments.length,
                },
              },
              () => postCommentsToGerrit({
                changeId,
                revision,
                comments: aiComments,
              })
            );

            metrics.timing("review.gerrit.duration_ms", elapsedSince(gerritStartedAt), tags);
          }

          metrics.timing("review.duration_ms", elapsedSince(requestStartedAt), tags);
          metrics.increment("review.success", tags);

          request.log.info(
            { changeId, revision, commentCount: aiComments.length, durationMs: elapsedSince(requestStartedAt) },
            "Finished AI review"
          );

          return reply.code(200).send({
            ok: true,
            changeId,
            revision,
            commentCount: aiComments.length,
            comments: aiComments,
            gerrit: gerritResult,
          });
        } catch (error) {
          metrics.increment("review.errors", tags);
          request.log.error({ err: error, changeId, revision }, "AI review failed");
          throw error;
        }
      }
    );
  });
}
