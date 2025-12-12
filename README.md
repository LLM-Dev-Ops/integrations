# integrations

## Prerequisites

- Docker and Docker Compose

## Database Setup

This repo uses [ruvnet/ruvector-postgres](https://hub.docker.com/r/ruvnet/ruvector-postgres) for vector database functionality.

### Quick Start

```bash
# Copy environment template
cp .env.example .env

# Start the database
docker compose up -d

# Verify it's running
docker compose ps
```

### Connection

Once running, connect using:

```
DATABASE_URL=postgresql://ruvector:ruvector_secret@localhost:5432/ruvector
```

### Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f ruvector-postgres

# Reset data
docker compose down -v
```

### Integration Connectivity Testing

Test that all integrations can connect to the database:

```bash
# Build and run connectivity test
cd shared/database
npm install
npm run build
npm run test:connection
```

Or from the root:

```bash
npm run db:build
npm run test:db
```

This tests each integration's ability to perform a complete connect -> query -> write -> read cycle against the RuvVector Postgres instance.

## Integrations

| Integration | Description |
|-------------|-------------|
| anthropic | Anthropic Claude API client |
| aws/s3 | AWS S3 storage client |
| aws/ses | AWS SES email client |
| cohere | Cohere AI API client |
| gemini | Google Gemini API client |
| github | GitHub API client |
| google-drive | Google Drive API client |
| groq | Groq API client |
| mistral | Mistral AI API client |
| oauth2 | OAuth2 authentication client |
| openai | OpenAI API client |
| slack | Slack API client |
| smtp | SMTP email client |