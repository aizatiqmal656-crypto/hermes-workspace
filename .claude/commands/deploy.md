# /project:deploy

Deploy hermes-workspace to VPS production environment.

## Usage

```
/project:deploy
```

## Pre-Deploy Checklist

Before running any deploy steps, verify:

- [ ] All local changes are committed (`git status` is clean)
- [ ] `pnpm build` succeeds without errors
- [ ] No TypeScript errors in `src/` files relevant to the TikTok pipeline
- [ ] `.env` values are NOT committed (check `.gitignore` includes `.env`)
- [ ] `CLAUDE.local.md` is NOT committed (check `.gitignore`)
- [ ] API keys in production `.env` on VPS are up to date

## Steps

### 1. Build Locally

```bash
pnpm build
```

Check output for:
- `✓ built in XX.XXs` — success
- No `ERROR` lines
- `dist/` folder created with `server.js` and client assets

If build fails, read the error and fix before proceeding. Never push a broken build.

### 2. Run Git Operations

```bash
# Stage all changes
git add -A

# Check what's being committed (no secrets!)
git status
git diff --staged --stat

# Commit
git commit -m "deploy: [brief description of changes]"

# Push to main
git push origin main
```

**Safety checks before push:**
- Confirm `.env` is NOT in `git status` staged files
- Confirm `CLAUDE.local.md` is NOT staged
- Confirm no API keys appear in any staged file (`git diff --staged | grep -i "api_key\|secret\|token"`)

### 3. SSH to VPS

```bash
ssh user@your-vps-ip
```

Or if using a configured SSH alias:
```bash
ssh hermes-vps
```

### 4. Pull Latest on VPS

```bash
cd /var/www/hermes-workspace

# Pull latest from main
git pull origin main

# Install any new dependencies
pnpm install --frozen-lockfile

# Rebuild on server (if SSR build needed)
pnpm build
```

### 5. Update Environment Variables (if changed)

If any new `.env` variables were added to `.env.example` or `CLAUDE.md`, update the production `.env` on VPS:

```bash
nano /var/www/hermes-workspace/.env
# Add any new variables
```

### 6. Restart pm2

```bash
# Restart the app process
pm2 restart hermes-workspace

# Check it's running
pm2 status

# Check logs for startup errors
pm2 logs hermes-workspace --lines 50
```

### 7. Verify Deployment

- Visit `https://your-domain.com/tiktok` — check the TikTok pipeline page loads
- Check browser console for any JavaScript errors
- Test one step of the pipeline (just the Script generation, not the full pipeline)
- Check `pm2 logs` for any server-side errors

### 8. Rollback (if needed)

If the deploy broke something:

```bash
# On VPS: roll back to previous commit
git log --oneline -5           # find previous good commit hash
git checkout [previous-hash]   # checkout that version
pnpm build
pm2 restart hermes-workspace
```

## GitHub Pages Deployment (Static Assets Only)

For the static pages at `https://aizatiqmal656-crypto.github.io/hermes-workspace/`:

```bash
# GitHub Actions handles this automatically on push to main
# Verify at: https://github.com/aizatiqmal656-crypto/hermes-workspace/actions
```

Check the Actions tab for any failed workflows after pushing.
