# Guarded automatic repair workflow

SmugVTT uses `.github/workflows/ci.yml` as the authoritative five-job verification suite. Do not disable, skip, or weaken CI to make repair PRs merge.

## Process

1. `CI failure intake` observes failed **push** runs on `main` and maintains a single open issue with the latest run URL and commit. It never checks out or executes untrusted code.
2. A maintainer or connected coding agent (for example the existing SmugVTT Continuous QA automation) examines the issue, diagnoses failures, and proposes an **internal draft PR** using a branch named `automation/repair-<topic>`. GitHub Actions does not include an AI repair agent or any model/API key. This workflow alone cannot write fixes.
3. Run the entire CI suite and inspect the diff for privacy, permission/security, regression and licensing risks. Fix failures and mark the PR ready for review only after verification.
4. A maintainer who has reviewed the diff must add **both** `privacy-reviewed` and `safe-to-automerge` labels. They must not be issued merely because CI passed. The merge workflow never grants these labels itself.
5. `Guarded repair merge` polls hourly at :41 and can squash-merge only eligible same-repository PRs authored by `Huemaster` or `github-actions[bot]`, with matching branch prefix, non-draft state, all five CI jobs passing, and no other failing/pending checks. It uses `--match-head-commit` to prevent racing a new push. GitHub's branch protections still apply.

### Conservative restrictions

- At most six changed files, 250 added lines and 250 deleted lines.
- Allowed changed paths: `frontend/src/**`, `frontend/tests/**`, `frontend/e2e/**`, `backend/src/**`, `backend/tests/**`, `docs/**`.
- Disallowed: workflows, scripts, Docker/build infrastructure, deployment, database migrations, Prisma, authentication/security/permissions, secrets/session handling, licenses/policies, and all paths outside the allowlist.
- Security-sensitive issues, unclear privacy findings, schema changes, third-party PRs, and major changes require manual merge.
- CI runs on the repo's ephemeral infrastructure. No production database, local private assets or Cloudflare tunnel are used.
- Do **not** use `pull_request_target` to execute untrusted PR code, `--admin`, or bypass branch protection.
- The approval labels represent a human review. The script cannot prove code is safe from CI results alone.

### Repository setup after this PR merges

- Configure a `main` branch ruleset to require all five named CI jobs (Frontend; Backend; Docs; Dependency advisories; Production images, nginx and smoke tests). Keep deletion and force-push restrictions. Consider required maintainer approval for changes to `.github/workflows/**`.
- Create the `privacy-reviewed` and `safe-to-automerge` labels, if absent.
- Ensure Actions has permission to create PR/issue comments and merge PRs as appropriate. The default `GITHUB_TOKEN` is scoped to each workflow. If repository rules disallow GitHub Actions merges, this gate fails closed rather than bypassing protection.
- Connect an authorized code-writing agent separately to turn failure issues into draft repair PRs. The existing ChatGPT hourly QA task may serve as this agent when its GitHub access works, but this cannot be assumed or triggered by GitHub without its own integration.
- Keep this PR as draft until its own CI passes. It is infrastructure only; does not repair failing frontend/backend tests by itself.
