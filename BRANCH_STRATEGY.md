# Branch Strategy

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Deployed to production. |
| `feature/*` | New features and non-urgent fixes. Branch from `main`. |
| `fix/*` | Bug fixes. Branch from `main`. |
| `hotfix/*` | Critical production fixes. Branch from `main`, merge to `main` directly. |

## Workflow

### Feature Development

```bash
# Create feature branch
git checkout main
git pull origin main
git checkout -b feature/my-feature

# Work, commit, push
git add .
git commit -m "feat: description of feature"
git push -u origin feature/my-feature

# When ready, open a Pull Request to main
```

### Pull Request Process

1. Create PR from your feature branch to `main`
2. PR title follows [Conventional Commits](https://www.conventionalcommits.org/)
3. Describe what changed and why
4. Request review from at least one team member
5. Address review feedback
6. Squash-merge to `main` after approval

### Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `style` — Formatting, missing semicolons, etc.
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `perf` — Performance improvement
- `test` — Adding or fixing tests
- `chore` — Build process, tooling, dependencies

**Examples:**
```
feat(shopify): add OAuth connection flow
fix(inventory): correct stock adjustment on returns
docs: update deployment guide for PM2
refactor(auth): extract session middleware
chore: upgrade Bun to 1.x
```

## Branch Naming

```
feature/<short-description>   # feature/shopify-oauth
fix/<short-description>        # fix/inventory-rounding
hotfix/<short-description>     # hotfix/critical-auth-bug
```

## Rules

- `main` is always deployable
- Never commit directly to `main`
- Feature branches should be short-lived (days, not weeks)
- Rebase feature branches onto `main` before merging to resolve conflicts
- Delete feature branches after merge
- Squash-merge to keep `main` history clean

## Release Process

1. Ensure all desired PRs are merged to `main`
2. Update `CHANGELOG.md` with the new version
3. Tag the release:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
4. Deploy from the tagged commit
