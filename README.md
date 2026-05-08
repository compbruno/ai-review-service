# ai-review-service

Servico de code review automatizado com IA para fluxos baseados em Gerrit e Jenkins.

O projeto expoe uma API HTTP que recebe um diff, envia o conteudo para um provider de IA e publica comentarios de revisao diretamente no Gerrit.

## Como Funciona

1. Um patchset e criado no Gerrit.
2. O Jenkins executa um pipeline acionado pelo evento do Gerrit.
3. O pipeline coleta o diff e envia para o endpoint `POST /review`.
4. O `ai-review-service` analisa o diff usando Gemini ou Ollama.
5. Os comentarios retornados pela IA sao publicados no patchset do Gerrit.

## Stack

- Node.js com TypeScript
- Fastify
- Docker Compose
- Gerrit
- Jenkins
- Gemini API ou Ollama local

## Setup

Para configurar o ambiente local completo com Jenkins, Gerrit e AI Review, siga o guia:

[Setup.md](Setup.md)

## Servicos do Docker Compose

O ambiente local sobe os seguintes servicos:

| Servico | Porta | Descricao |
| --- | --- | --- |
| `gerrit` | `8081`, `29418` | Code review e repositorio Git |
| `jenkins` | `8080`, `50000` | Pipeline acionado por eventos do Gerrit |
| `ollama` | `11434` | Provider local de IA |
| `ai-review` | `3000` | API do servico de revisao |

## Configuracao

Copie o arquivo de exemplo e ajuste as variaveis:

```bash
cp .env.example .env
```

Principais variaveis:

| Variavel | Descricao |
| --- | --- |
| `AI_PROVIDER` | Provider usado na revisao. Aceita `gemini` ou `ollama`. |
| `AI_MODEL` | Modelo usado pelo provider. Se vazio, usa o padrao do projeto. |
| `GEMINI_API_KEY` | Chave da API do Gemini, quando `AI_PROVIDER=gemini`. |
| `OLLAMA_URL` | URL do Ollama, quando `AI_PROVIDER=ollama`. |
| `GERRIT_URL` | URL do Gerrit. |
| `GERRIT_USER` | Usuario usado para publicar comentarios no Gerrit. |
| `GERRIT_PASSWORD` | HTTP password do usuario do Gerrit. |
| `PORT` | Porta HTTP do servico. Padrao: `3000`. |

## API

### Health check

```http
GET /health
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

### Revisar diff

```http
POST /review
```

Payload:

```json
{
  "changeId": "Iabc123",
  "revision": "1",
  "project": "meu-projeto",
  "branch": "main",
  "diff": "diff --git ..."
}
```

Resposta:

```json
{
  "ok": true,
  "changeId": "Iabc123",
  "revision": "1",
  "commentCount": 1,
  "comments": [],
  "gerrit": {}
}
```

## Desenvolvimento

Instale as dependencias:

```bash
npm install
```

Rode em modo desenvolvimento:

```bash
npm run dev
```

Compile o projeto:

```bash
npm run build
```

Rode o servidor:

```bash
npm start
```

## Comandos Docker

Subir o ambiente:

```bash
docker-compose up -d
```

Ver logs:

```bash
docker-compose logs -f
```

Rebuild apenas do servico de review:

```bash
docker-compose up -d --build ai-review
```

Parar tudo:

```bash
docker-compose down
```

Reset completo, incluindo volumes:

```bash
docker-compose down -v
```

## Estrutura Principal

```text
src/
  server.ts
  routes/
    review.ts
  services/
    ai.ts
    gerrit.ts
```

## Licenca

Adicione as informacoes de licenca antes de distribuir ou publicar o projeto.
