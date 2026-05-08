import { FastifyInstance } from "fastify";
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

export async function reviewRoute(fastify: FastifyInstance) {
  fastify.post<{Body: ReviewBody}>("/review", { schema: reviewSchema }, async (request, reply) => {
    const { changeId, revision, project, branch, diff } = request.body;

    request.log.info({ changeId, revision }, "Starting AI review");

    // 1. Get AI review
    const aiComments = await reviewWithAI({ diff, project, branch });

    // 2. Post to Gerrit
    let gerritResult = null;
    if (process.env.GERRIT_URL) {
      gerritResult = await postCommentsToGerrit({
        changeId,
        revision,
        comments: aiComments,
      });
    }

    return reply.code(200).send({
      ok: true,
      changeId,
      revision,
      commentCount: aiComments.length,
      comments: aiComments,
      gerrit: gerritResult,
    });
  });
}