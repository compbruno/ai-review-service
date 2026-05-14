import tracer from "dd-trace";

tracer.init({
  env: process.env.DD_ENV ?? "local",
  logInjection: true,
  runtimeMetrics: true,
  service: process.env.DD_SERVICE ?? "ai-review-service",
  version: process.env.DD_VERSION ?? "1.0.0",
});

export default tracer;
