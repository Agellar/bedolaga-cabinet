# Updating from upstream without losing fork changes

> Your changes live in this **fork**, branch `custom`. Upstream updates come from remote `upstream`.
> Merge upstream into `custom`, resolve, build, push, then redeploy. The DB-backed settings
> (palette, bot menu, branding) survive code updates on their own.

## Model
```
origin   = Agellar/bedolaga-cabinet      (fork; branch `custom` = your changes)
upstream = BEDOLAGA-DEV/bedolaga-cabinet  (original author)
prod     = pulls from origin/custom
```
Fork changes are isolated (new `src/styles/aurora.css` + targeted edits + `glassTheme.ts`/`theme.ts`),
so merges rarely conflict. See [`CUSTOM-FORK.md`](./CUSTOM-FORK.md).

## 1) Update the cabinet (local)
```bash
cd <repo>
git fetch upstream
git checkout custom
git merge upstream/main        # safer than rebase (no force-push). Resolve conflicts if any.
# conflicts: keep BOTH the author's logic and our design classes/blocks, then:
#   git add <file> && git merge --continue
npm install
npm run build                  # tsc + vite — must pass
npx eslint src                 # 0 errors
git push origin custom
```
Conflicts usually only appear in files both sides changed heavily (e.g. `Dashboard.tsx`).
Abort a bad merge with `git merge --abort`.

## 2) Deploy to prod
Cabinet is a Dockerized nginx container built from source; prod keeps a locally-modified
`docker-compose.yml` + `.env` that must be preserved.
```bash
cd /opt/bedolaga-cabinet
TS=$(date +%F_%H%M)
git rev-parse HEAD > ~/cabinet_OLD_$TS.txt          # rollback point
cp .env ~/cabinet_env_$TS.bak; cp docker-compose.yml ~/cabinet_compose_$TS.bak

cp docker-compose.yml /tmp/cc; cp .env /tmp/ce        # preserve prod config
git checkout -- docker-compose.yml
git fetch origin && git pull origin custom
cp /tmp/cc docker-compose.yml; cp /tmp/ce .env        # restore prod config

docker compose up -d --build
docker compose ps                                     # wait for healthy
curl -sI http://127.0.0.1:<CABINET_PORT>/ | grep -i cache-control   # index.html = no-cache
```
After deploy, clear the Telegram cache once on already-cached devices (Settings → Data and Storage →
Storage Usage → Clear Cache), then reopen the mini app. Future deploys propagate automatically.

### Rollback (instant; DB untouched)
```bash
cd /opt/bedolaga-cabinet
git checkout $(cat ~/cabinet_OLD_<TS>.txt)
docker compose up -d --build
```

## 3) Bot
The bot runs upstream unchanged. To just update it: `cd /opt/bedolaga-bot && git pull && docker compose up -d --build`
(**dump the DB first**: `docker compose exec -T postgres pg_dump -U <user> <db> > ~/db_$(date +%F).sql`).
Only fork the bot if you actually customize its code — and sync the bot fork to upstream first, or you'll
revert it.

## 4) Settings that DON'T live in code
`system_settings` (DB) keeps: theme colors (`CABINET_THEME_COLORS`), bot menu
(`CABINET_MENU_LAYOUT` + `CABINET_BUTTON_STYLES`), branding. Configure these via the admin UI — they
survive every code update.
