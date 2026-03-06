# n8n for Rise & Shine

## First-time setup

1. Copy the env example and set your encryption key (required for credential encryption):

   ```bash
   cd n8n
   cp .env.example .env
   ```

2. Generate a 32-byte hex key and put it in `.env`:

   ```bash
   openssl rand -hex 32
   ```

   Set in `.env`:

   ```
   N8N_ENCRYPTION_KEY=<paste-the-generated-key>
   ```

3. Do not commit `.env` or put the real key in `n8n_data/config`; both are gitignored.

## Run

From the `n8n` directory:

```bash
# Prefer Compose v2 if available
docker compose up -d

# If your machine uses Compose v1
# docker-compose up -d
```

n8n will be at http://localhost:5678.

### Compose v1 troubleshooting (Ubuntu)

If `docker-compose up -d` fails with `KeyError: 'ContainerConfig'`, remove the stale container and retry:

```bash
docker rm -f n8n_n8n_1 2>/dev/null || true
docker-compose up -d
```
