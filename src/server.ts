import "dotenv/config";
import Fastify from "fastify";
import { reviewRoute } from "./routes/review.js";

const fastify = Fastify({ logger: true });

fastify.register(reviewRoute);

fastify.get("/health", async () => ({ status: "ok" }));

const start = async () => {
  try {
    await fastify.listen({
      port: Number(process.env.PORT) || 3000,
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();