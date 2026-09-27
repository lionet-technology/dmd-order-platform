# Deployment

## Runtime

- Next.js app in Docker.
- SQLite database at `/app/data/dmd-finance-ops.db`.
- Host persistence: `./data:/app/data`.
- Default host port: `3419`.
- Health endpoint: `/api/health`.

The `data/` directory is intentionally ignored by Git. `git reset`, Jenkins sync, image rebuilds and container replacement therefore do not delete the SQLite database.

## Jenkins

The repository follows the same fixed-directory pattern used by the other Lionet projects:

1. Jenkins receives a GitHub push.
2. Sync `main` to `/home/lionet/workspace/thuantv/dmd-finance-platform`.
3. Preserve/create `.env` and `data/`.
4. Run `docker compose up -d --build --remove-orphans`.
5. Poll `/api/health`.

The Jenkins agent needs:

- permission to `sudo -u lionet`;
- GitHub SSH access for `git@github.com:thuan2172001/dmd-finance-platform.git`;
- Docker access for user `lionet`.

## SQLite backup

A safe file backup can be made with SQLite's backup command while the app is running:

```bash
docker compose exec -T app node - <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('/app/data/dmd-finance-ops.db');
db.backup('/app/data/dmd-finance-ops.backup.db')
  .then(() => console.log('backup complete'))
  .catch((error) => { console.error(error); process.exit(1); });
NODE
```

For this MVP, deploy a single app container. SQLite is not intended for horizontally scaled app replicas writing the same database file.

## Jenkins job registration

GitHub webhook is configured to:

`https://deployment.lionet.vn/github-webhook/`

The Jenkins job should be named `dmd-finance-platform` and use the same SCM credential as the existing `blog` job:

- Repository: `https://github.com/thuan2172001/dmd-finance-platform`
- Credential: `github-thuan2172001`
- Branch: `*/main`
- Script path: `Jenkinsfile`
- Lightweight checkout: enabled
- GitHub push trigger: enabled

An exact Jenkins job XML matching the current `blog` job style is committed at `jenkins/job-config.xml`.

- Webhook smoke check: a normal GitHub push should automatically schedule this Jenkins job.
