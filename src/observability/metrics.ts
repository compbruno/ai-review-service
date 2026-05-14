import StatsD from "hot-shots";

const service = process.env.DD_SERVICE ?? "ai-review-service";
const env = process.env.DD_ENV ?? "local";
const version = process.env.DD_VERSION ?? "1.0.0";

const client = new StatsD({
  host: process.env.DD_AGENT_HOST ?? "localhost",
  port: Number(process.env.DD_DOGSTATSD_PORT) || 8125,
  prefix: "ai_review.",
  globalTags: [`service:${service}`, `env:${env}`, `version:${version}`],
  errorHandler: (error) => {
    console.error("Failed to send DogStatsD metric", error);
  },
});

export const metrics = {
  increment(name: string, tags: string[] = []) {
    client.increment(name, 1, tags);
  },

  timing(name: string, value: number, tags: string[] = []) {
    client.timing(name, value, tags);
  },

  gauge(name: string, value: number, tags: string[] = []) {
    client.gauge(name, value, tags);
  },
};
