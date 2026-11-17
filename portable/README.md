# SmugVTT Windows portable — first review gate

**Status: architecture/preflight proof of concept only. Not a runnable portable distribution.**

The supported Docker deployment remains unchanged. This first independent slice supplies a fail-closed PowerShell inspection of a prospective Windows bundle, without starting processes, downloading binaries, creating a database, changing the Prisma schema, or touching user data.

## Why this architecture

The current production stack uses PostgreSQL 15, Prisma migrations, Node.js >=26, Express/Socket.IO, a Vite-built SPA and Nginx routing. Keep PostgreSQL rather than translating the schema. A future launcher should ship appropriately licensed, verified Windows builds of PostgreSQL and Node and the compiled backend/frontend, and use a small local HTTP reverse proxy to send `/api/*` and `/socket.io/*` to Express and everything else to the SPA. Never expose PostgreSQL. Do not use Vite's development server as a production substitute.

Proposed directory layout (not built yet):

```text
SmugVTT-Portable/
  Start-SmugVTT.cmd
  app/backend/             # compiled backend, production dependencies, Prisma engine
  app/frontend/            # production SPA assets
  runtime/node/node.exe
  runtime/postgres/bin/{initdb,pg_ctl,postgres,pg_isready,psql,pg_dump}.exe
  runtime/proxy/           # vetted local HTTP/WebSocket proxy
  data/                    # persistent, excluded from distribution
    postgres/
    uploads/
    backups/
    logs/
    secrets/
```

**Lifecycle design (future PRs):** validate signed/checksummed runtime payloads and required files; refuse if data belongs to an incompatible PostgreSQL major version; create data directories with restricted Windows ACLs; generate and persist independent cryptographically random database/session/setup secrets; initialize PostgreSQL on first run with SCRAM authentication and localhost-only binding on an available nonpublic port; start it under the current user without a service; wait for readiness; run the *existing* `prisma migrate deploy` only after a verified restorable backup on upgrades; start the backend and reverse proxy; open `http://127.0.0.1:<port>` after health succeeds. Stop children gracefully, allow backend backups to finish, and stop only the PostgreSQL instance owned by this launcher. Never reuse or delete a foreign cluster. Protect against concurrent launch and unexpected process termination. Provide actionable logs and leave data untouched after failures.

**Network policy:** loopback only by default. LAN must be a deliberate opt-in, with a fixed allowed origin, explicit Windows Firewall guidance and authentication. Cloudflare Tunnel is separately installed/configured and is **not** bundled or auto-enabled. Public exposure requires HTTPS/proxy trust and CORS review. Offline local play must not depend on a cloud service; optional online imports/email are separate.

**Backups:** both PostgreSQL logical dumps and uploaded assets are essential. Do not claim a portable folder copy is a consistent live backup. Record schema/app/runtime versions; test restore on a disposable instance. Never automatically migrate an existing Docker database or overwrite its volume.

**Licensing:** retain SmugVTT/CozyVTT attribution and AGPL-3.0-only notices/source availability. Review PostgreSQL, Node and proxy binary redistributable licenses and notices before packaging. No user campaigns, uploads, credentials, tokens, database dumps, or local paths in release artifacts.

## Run the non-mutating preflight

From the repository root on Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\portable\Test-PortableLayout.ps1 -BundleRoot C:\path\to\SmugVTT-Portable
```

It reports missing components and refuses symlink/reparse-point roots. It does **not** certify authenticity of binaries, runtime compatibility, security, migration safety, or actual Windows functionality. Never execute an untrusted bundle just because this preflight passes.

## Review / test gates

1. Confirm this PR changes only `portable/` and does not overlap draft PRs #13–#17 or modify the production Docker stack, schema, migration history, or permissions.
2. Run the preflight on an empty temporary folder: it must fail and list missing files. Run it on a fixture with dummy files: it must only report *layout* success, never attempt to execute them. Test a nonexistent path and a reparse-point root: both fail.
3. Run repository frontend typecheck/lint/tests/build, backend lint/build/tests against disposable PostgreSQL, docs checks, dependency audit, and Docker/browser smoke in normal CI. These are not substitutes for native Windows tests.
4. Next implementation PR: verified runtime acquisition/build manifest and pinned hashes; test clean Windows 11 x64 VM, including offline startup, fresh setup, restart persistence, graceful shutdown, crash recovery, Windows Defender/Firewall, spaces/Unicode paths, simultaneous launch, LAN permissions, upload/backup/restore, WebSocket and all campaign features.
5. Only after native verification consider a signed distributable; keep this PR draft.

**Known blocker:** no bundled runtime/proxy, launcher, binary integrity manifest, migrations integration or end-to-end Windows tests exist in this slice. No end-user portable download should be advertised.
