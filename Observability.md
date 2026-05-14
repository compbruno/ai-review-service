# Observability with Datadog

This guide explains how observability is wired in this project and what to look for while learning.

## Mental model

Observability answers three questions:

- Logs: what happened?
- Metrics: how often and how much?
- Traces: where was time spent inside one request?

For `ai-review-service`, the most useful workflow is a trace that starts at `POST /review`, then shows time spent generating AI comments and time spent publishing comments back to Gerrit.

## What was instrumented

### Datadog Agent

The `datadog` service in `docker-compose.yml` runs the Datadog Agent. It receives telemetry from the other containers and forwards it to Datadog.

It enables:

- APM traces on port `8126`
- DogStatsD metrics on port `8125`
- Docker log collection

### Node.js tracer

`src/tracer.ts` initializes `dd-trace`. It is imported before Fastify in `src/server.ts` so Datadog can patch supported libraries early.

The service uses these tags:

- `DD_SERVICE=ai-review-service`
- `DD_ENV=local`
- `DD_VERSION=1.0.0`

These tags help Datadog group traces, logs and metrics for the same service.

### Custom spans

`src/routes/review.ts` creates custom spans for the review workflow:

| Span | Meaning |
| --- | --- |
| `ai_review.request` | Full `/review` request lifecycle |
| `ai_review.ai.generate_comments` | Time spent calling the AI provider |
| `ai_review.gerrit.post_comments` | Time spent posting comments to Gerrit |

These spans are intentionally domain-specific. Automatic instrumentation can show HTTP calls, but custom spans explain the business operation in words that match the project.

### Custom metrics

`src/observability/metrics.ts` sends DogStatsD metrics:

| Metric | Type | Meaning |
| --- | --- | --- |
| `ai_review.review.requests` | count | Number of review requests received |
| `ai_review.review.success` | count | Number of successful reviews |
| `ai_review.review.errors` | count | Number of failed reviews |
| `ai_review.review.duration_ms` | timing | Total review duration |
| `ai_review.review.ai.duration_ms` | timing | AI provider duration |
| `ai_review.review.gerrit.duration_ms` | timing | Gerrit publish duration |
| `ai_review.review.comments` | gauge | Number of AI comments returned |
| `ai_review.review.diff_bytes` | gauge | Diff size in bytes |

## Setup

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Fill your Datadog API key:

```env
DD_API_KEY=your_api_key_here
DD_SITE=datadoghq.com
DD_ENV=local
```

Use the correct `DD_SITE` for your Datadog account. For example, EU accounts usually use `datadoghq.eu`.

3. Rebuild and start the stack:

```bash
docker-compose up -d --build
```

4. Check the Datadog Agent logs:

```bash
docker-compose logs -f datadog
```

5. Trigger a Gerrit review flow. After Jenkins calls `POST /review`, check Datadog APM for the `ai-review-service` service.

## What to inspect in Datadog

### APM

Open APM and search for:

```text
service:ai-review-service env:local
```

Start with a trace for `POST /review` and inspect:

- total request duration
- AI generation span duration
- Gerrit publish span duration
- error details when a review fails
- tags such as `ai.provider`, `ai.model`, `gerrit.project` and `gerrit.branch`

### Metrics

Search for metrics starting with:

```text
ai_review.review
```

Useful questions:

- Are reviews getting slower when the diff is bigger?
- Is Ollama slower than Gemini?
- How many comments are generated per review?
- Are failures happening in AI generation or Gerrit publishing?

### Logs

Search logs with:

```text
service:ai-review-service env:local
```

The app uses Fastify structured logs. With Datadog log injection enabled, logs can be correlated with traces.

## Troubleshooting

### No traces appear

Check whether the app can reach the Agent:

```bash
docker-compose exec ai-review sh -c "nc -vz dd-agent 8126"
```

Check the app environment:

```bash
docker-compose exec ai-review env | grep DD_
```

### No logs appear

Check whether the Agent is collecting Docker logs:

```bash
docker-compose logs datadog
```

The Agent must have `DD_LOGS_ENABLED=true` and access to `/var/run/docker.sock`.

### No custom metrics appear

DogStatsD must accept traffic from other containers:

```env
DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true
```

The app sends metrics to:

```env
DD_AGENT_HOST=dd-agent
DD_DOGSTATSD_PORT=8125
```

## Why this design

The project has one important user-facing operation: review a patchset. That is why the instrumentation focuses on the review lifecycle instead of adding random metrics everywhere.

The first dashboard should answer:

- How many reviews are running?
- How long do they take?
- Where is the time spent?
- How often do they fail?
- Which provider/model is being used?

That is enough to learn observability without drowning in noise.
