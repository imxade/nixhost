# Harbur Integration Design

Status: design only. No Harbur integration is implemented by this document.

## 1. Harbur architecture found

Harbur is a TanStack Start TypeScript application intended for stateless hosting. Its durable
repository state is stored through one server-owned Google Drive identity, using the
`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and `GOOGLE_DRIVE_REFRESH_TOKEN`
environment variables. Browser Google sign-in requests identity scopes only; an authenticated
browser receives Harbur's own secure, HTTP-only session cookie and never receives a Drive token.

`src/lib/owncode-drive.ts` persists an `owncode.appdata.v1` document containing repository
metadata, file content, access lists, pull requests, issues, activity, Drive folder IDs, and ZIP
file IDs. It also maintains a visible Drive folder and repository ZIP/manifest objects. Public
repositories can be read anonymously. Private repositories are filtered by the authenticated
email/admin identity in `canSeeRepository`; maintainer capabilities are checked separately.

`buildRepositoryZipServer` authorizes the caller and builds a ZIP from current stored files. It
does not expose a stable archive URL or immutable revision. Repository manifests identify a
repository and its default branch (`main`) but have no commit or snapshot ID. Pull requests store
their number, state, author, changed files, diff, comments, and review metadata. Merge applies the
file changes, uploads a replacement ZIP, updates the Drive state, marks the pull request merged,
and writes activity. There is no integration token, webhook, event outbox, callback, or reusable
external repository API today. The small `StorageAdapter` is not an authorization or integration
boundary.

## 2. Nix Ship architecture found

Nix Ship is a Next.js App Router/strict TypeScript control plane backed by local SQLite. An
application currently stores a normalized GitHub HTTPS URL, optional GitHub repository and
installation IDs, branch, flake output, and deployment history. The deployment engine obtains an
exact Git revision, creates a release worktree, runs the locked flake with argument arrays, starts
the result on a private port, health-checks it, and atomically updates the production pointer.

GitHub App credentials and application secrets are encrypted at rest. Webhook delivery IDs,
observed revisions, and deployment revisions are persisted for deduplication/recovery. There is no
repository-provider abstraction: GitHub URL validation is in `app-service.ts`, Git operations and
GitHub authentication are coupled in `git.ts`, and reconciliation assumes a Git remote branch.
The narrowest useful extension is therefore a Harbur-specific snapshot source beside the existing
GitHub path, not a generic provider framework.

## 3. Current GitHub deployment flow

Public repositories use an HTTPS GitHub clone URL without a credential. Private repositories are
selected through a per-node GitHub App installation. Nix Ship creates a short-lived installation
token, supplies HTTP Basic credentials through Git's protected configuration environment, and
keeps the stored URL credential-free. `git ls-remote` resolves the branch head; clone/fetch plus a
worktree materializes the exact commit. Signed `push` webhooks and polling both queue the observed
commit SHA, and persisted delivery/revision records prevent routine duplicates. Harbur must be
added alongside this path; existing GitHub behavior remains unchanged.

## 4. Minimum capabilities needed from Harbur

The integration boundary needs: instance identification; repository discovery filtered to an
identity; public metadata and immutable snapshot download; private metadata/snapshot download with
revocable instance-level authorization; a stable repository ID; an exact immutable snapshot ID
and digest; a pull-request-merged event carrying that snapshot ID; authenticated event delivery;
event IDs and a replayable cursor; and clear unauthorized, revoked, missing, and unavailable
responses. Nix Ship does not need Drive IDs, Drive tokens, Harbur's state document, issue data, or
merge implementation details.

## 5. Direct Google Drive authorization evaluation

This is not recommended. Harbur's browser sign-in cannot be reused because it deliberately has no
Drive scope, while the durable Drive credential belongs to the Harbur service. Adding Drive OAuth
to Nix Ship would require broader permissions than “deploy these repositories,” duplicate Harbur's
repository authorization checks, and expose private storage structure to a second application.
Nix Ship would need to understand `owncode.appdata.v1`, folder naming, ZIP IDs, and migrations;
ordinary Harbur storage changes would then require coordinated Nix Ship changes. Public access
would unnecessarily require Google in many cases, and revoking repository access would be hard to
enforce correctly from Drive ACLs alone. The user flow might look familiar, but the security and
maintenance cost is materially higher.

## 6. One-time trust with a Harbur instance

One authorization per normalized Harbur instance and Harbur identity fits both architectures. Use
a browser authorization/pairing flow: Nix Ship creates high-entropy state and PKCE material, sends
the owner to the Harbur instance, Harbur authenticates with its existing session and displays the
requested deployment scope, then returns a short-lived single-use code. Nix Ship exchanges it
server-to-server for a short-lived access token and rotatable refresh credential. Manual permanent
secrets in URLs are unnecessary.

Harbur remains responsible for repository permissions on every request. Public snapshots require
no credential; private discovery/download uses the scoped token. Harbur can revoke the grant, and
Nix Ship can delete or replace its encrypted credential. An instance-wide credential is contained
by an audience bound to that instance, deployment-read/event scopes, the authorizing identity, and
Harbur's repository authorization checks; it is not a Drive credential and cannot administer
Harbur.

## 7. Simpler existing alternative

No existing endpoint satisfies immutable download, private authorization, and merge notification.
The current ZIP server function is useful implementation code but not a sufficient external
contract: it returns current state, uses browser-session authorization, and has no revision. The
simplest safe option is a small versioned Harbur integration API that reuses `canSeeRepository`,
the ZIP builder, current sign-in sessions, and the merge function. Direct Drive access, Git
emulation, and a large generic Nix Ship provider SDK are all larger or more coupled.

## 8. Approach comparison

| Approach | Simplicity / effort | Security | Coupling / maintenance | Public + private | One-time auth | Merge deploy |
| --- | --- | --- | --- | --- | --- | --- |
| Direct Drive OAuth in Nix Ship | Superficially short, but duplicates Drive/state logic | Broad Drive access and duplicated authorization | Very high; tied to internal document/folder layout | Awkward public flow; risky private flow | Possible, but over-privileged | Requires polling Drive state without an exact event contract |
| Permanent instance secret | Moderate | Containment and rotation depend on a long-lived bearer secret | Low protocol coupling | Supports both if Harbur enforces access | Yes | Requires signed/authenticated callback plus retry work |
| Harbur authorization code + scoped tokens | Moderate and reuses existing sessions | Least privilege, revocable, no Drive exposure | Low; versioned repository/snapshot API | Natural for both | Yes | Natural with authenticated outbox/event feed |
| Export repositories to GitHub | Operationally simple in Nix Ship, large product compromise | Delegates to GitHub | Adds a third-party synchronization dependency | Possible | GitHub authorization, not Harbur authorization | Merge timing/revision depends on export correctness |

The authorization-code approach has a little more initial code than a copied secret but is simpler
for users and safer over its lifetime.

## 9. Recommendation

Add a minimal versioned Harbur integration API and one-time browser authorization with PKCE-style
code exchange. Expose authorized repository discovery and immutable snapshot downloads. On merge,
persist an integration event in a Harbur outbox and deliver it to Nix Ship; also expose an ordered
event feed so Nix Ship can reconcile missed callbacks. Store and deploy the exact snapshot revision
and verify its digest before evaluating the flake.

## 10. Why this fits the codebases

Harbur already owns identity, repository visibility, file assembly, and merge state, so it is the
only place that can enforce access without duplicating rules. Nix Ship already owns encrypted
credentials, exact-revision deployment queues, webhook deduplication, polling recovery, and safe
deployment. A small HTTP boundary lets each application keep those responsibilities. It avoids
Drive coupling and changes only the seams that are currently missing.

## 11. Minimum Harbur changes

1. Introduce an immutable snapshot record on every repository write/merge: opaque revision ID,
   SHA-256 digest, creation time, repository ID, and immutable ZIP bytes or an object reference.
2. Add `/api/integrations/v1` endpoints for instance metadata, public repository discovery,
   authorized repository discovery, exact snapshot metadata/download, authorization/code exchange,
   token refresh/revocation, and an ordered event feed.
3. Reuse existing session and `canSeeRepository` checks when approving grants and servicing every
   private request. Tokens need only read-repository/read-snapshot/read-event scopes.
4. Extend merge transaction semantics to append a durable `pull_request.merged` outbox event with
   an event ID and exact snapshot ID. On Drive-backed stateless hosting, save the state and outbox
   before attempting delivery. Retry on subsequent server activity; the event feed provides the
   reliable pull fallback when no background worker is available.
5. Add grant/revocation UI and redact tokens. Do not expose Drive IDs or credentials.

## 12. Minimum Nix Ship changes

1. Add `harbur_connections` and Harbur application-source metadata with encrypted refresh tokens,
   normalized instance origin, stable remote repository ID, and last event cursor. Keep GitHub
   columns/paths intact for compatibility.
2. Add a Harbur connection page and authorization callback with expiring state, PKCE, origin
   binding, role checks, and repository discovery.
3. Add a Harbur snapshot fetcher that uses argument-array process calls only where needed, streams
   to a size-limited temporary file, verifies SHA-256, rejects traversal/symlink/device entries,
   extracts to a fresh release source directory, and never logs authorization headers.
4. Extend applications/deployments with a source kind and opaque source revision. Queue Harbur
   event IDs/revisions transactionally and uniquely, then feed the existing flake deployment
   engine after materialization.
5. Add an authenticated callback plus periodic event-feed reconciliation, structured redaction,
   revocation handling, and tests. Avoid a generic provider framework until a third source proves
   shared interfaces are useful.

## 13. Public-repository flow

The user supplies/selects a Harbur instance, Nix Ship calls public discovery, and Harbur returns
only public repository IDs and metadata. Nix Ship requests an exact public snapshot, verifies the
declared digest, safely extracts it, validates `flake.nix` and `flake.lock`, and queues that opaque
revision. No Google or Harbur credential is required. Automatic merge deployment can use public
event polling; authenticated callbacks are still preferred to prevent arbitrary parties from
consuming Nix Ship's deployment endpoint.

## 14. Private-repository flow

Nix Ship uses the instance grant to request discovery. Harbur resolves the token identity and
filters repositories with the same policy used by its UI. Every metadata and snapshot request
rechecks permission; knowing an ID is never authorization. Nix Ship stores no Drive location and
receives only the requested archive. Revocation or removed repository access produces 401/403 and
blocks future fetches without deleting historical deployment records.

## 15. One-time authorization flow

An owner/admin enters an HTTPS Harbur origin. Nix Ship normalizes it, rejects credentials,
fragments, unexpected paths, and unsafe redirects, then discovers an instance ID. It stores
expiring state/PKCE verifier bound to the user and origin and opens Harbur authorization. Harbur's
existing signed-in user approves read/deploy integration access. The single-use code is returned
to a preconfigured callback and exchanged directly with the same origin. Nix Ship encrypts the
refresh credential, stores access-token expiry, discards state/verifier, and discovers all
currently authorized repositories. Reauthorization rotates the grant; disconnect revokes it when
reachable and always erases the local secret.

## 16. Pull-request merge deployment flow

Within the successful Harbur merge operation, create the immutable merged snapshot and durable
event before returning success. The event contains schema version, instance ID, event ID,
repository ID, pull-request number, merge time, exact snapshot ID, and digest—never repository
contents or credentials. Harbur delivers it to the registered Nix Ship callback using the scoped
grant (or a separately derived webhook key), with event ID in the authenticated payload. Nix Ship
validates origin/audience and authentication, transactionally inserts the unique `(connection,
event_id)` and `(application, snapshot_id)` records, returns success for duplicates, downloads the
exact snapshot, and queues it. It never substitutes unspecified “latest” state.

## 17. Failure, retry, duplicate, downtime, and revocation handling

Harbur records delivery attempts and retains undelivered outbox events. Use bounded exponential
backoff and do not block merge success on callback availability. Nix Ship polls the ordered event
feed from its last committed cursor, so stateless Harbur deployments can recover even if no retry
worker ran. Duplicate/delayed callbacks are idempotent via unique IDs and snapshot revisions.
Snapshot failures leave an honest failed deployment tied to the requested revision and may be
retried without changing it. Cursor advancement and event insertion are transactional. A 401
triggers one refresh attempt; invalid grant/revocation marks the connection disconnected and stops
private polling/deployment until reauthorized. Public repositories may remain manually deployable.

## 18. Security risks and mitigations

- **Credential theft:** encrypt refresh credentials, use short access-token lifetimes, redact
  headers/errors, never put tokens in URLs, and scope audience/instance/actions.
- **SSRF/redirect attacks:** strict URL parsing, HTTPS by default, resolve and block loopback/link-
  local/private destinations unless an owner explicitly enables a LAN instance, revalidate DNS on
  connection, pin redirects to the authorized origin, and apply time/size limits.
- **Archive attacks:** bounded streaming, digest verification, entry-count/uncompressed-size limits,
  no absolute or parent paths, and no symlink/hardlink/device extraction.
- **Authorization bypass:** Harbur checks current repository permission for every private request;
  Nix Ship never treats discovery as continuing authorization.
- **Forged/replayed events:** authenticated audience-bound delivery, expiring tokens, unique event
  IDs and snapshot IDs, constant-time verification where a MAC is used, and durable deduplication.
- **Over-broad trust:** no Drive scope, no write/admin repository scope, explicit revocation and
  rotation, and separate connection records per instance.
- **Untrusted workload:** Harbur repositories remain trusted-workload inputs; Nix flakes still run
  as the Nix Ship OS account and are not isolated.

## 19. Staged future implementation plan

1. Harbur snapshot identity/archive contract and public read-only endpoints, with canonical ZIP
   tests and immutable digest fixtures.
2. Nix Ship Harbur public-source materialization and manual exact-revision deployment, retaining
   GitHub tests unchanged.
3. Harbur grants/code exchange/revocation and Nix Ship encrypted one-time connection/private
   discovery.
4. Harbur merge outbox/event feed and Nix Ship authenticated callback, cursor polling,
   deduplication, and exact-revision auto-deploy.
5. Security review, hostile archive/SSRF/replay tests, migration/backup tests, downtime exercises,
   physical Android flow verification, and operations documentation.
6. Only after the integration exists, add a “Learn More” or information affordance beside the
   Harbur connect action that links to the canonical Harbur GitHub repository. Do not add a dead
   connect button or link during this design-only stage.

## 20. Acceptance criteria

- Existing public/private GitHub discovery, fetch, webhooks, polling, and deployment still pass.
- Public Harbur deployment works without authorization and uses a verified immutable revision.
- One authorization exposes exactly the private repositories the Harbur identity may read; a
  separate secret per repository is never required.
- Removed permission and revoked/rotated grants stop future private reads without leaking secrets
  or corrupting prior deployment history.
- A merged pull request produces an exact snapshot and deploys that same revision once, including
  after callback duplication, reordering, Nix Ship downtime, Harbur retry, or feed reconciliation.
- Forged events, wrong instance/audience, unauthorized repository IDs, unsafe URLs, redirect
  escapes, oversized/malformed/traversal archives, digest mismatches, and expired credentials fail
  closed with redacted diagnostics.
- Harbur's Drive layout is absent from the Nix Ship contract, and Harbur never needs Nix Ship
  deployment internals.
- Credentials are encrypted at rest, absent from URLs/logs/API responses, revocable, and rotatable.
- Migrations work from an empty and existing database; backups/restores retain connection metadata
  without returning secret values.
- Event and snapshot deduplication is enforced by database uniqueness/transactions, not only memory.
- Both repositories pass their required Nix development/build/test checks, and the real Kitsy plus
  Android acceptance flow is recorded truthfully before release claims are made.
