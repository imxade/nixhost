# Remaining Multi-Project Requirements

Work with the following repositories:

```text

Nixhost:

/home/x/Downloads/project/nixhost-master

Nixhost Android:

/home/x/Downloads/project/nixhost-android

Harbur:

/home/x/Downloads/project/harbur

```

The Android release workflow, removal of README/JSON-based release controls, and fetching of the latest main-repository source during APK builds have already been addressed. Do not unnecessarily reimplement those changes, but ensure the remaining modifications do not break them.

Before making architectural changes, inspect the existing implementation and follow its current patterns where reasonable. Prefer the smallest maintainable changes that satisfy the requirements.

All of the project have flake.nix file, so you need to use it with nix develop for all project requirements.

keep addign the some highlighted makes to theis file, as the sections get addressed. no need to changes existing requirements just add a highlighted section for each completion.

---

# 1. Nixhost

## Repository and product rename

* Rename the GitHub repository from Nixhost to `nixship` using the `gh` CLI.

* Rename the product from **Nixhost** to **Nix Ship** throughout the repository.

* Update all relevant:

* user-facing text;

* application metadata;

* package metadata;

* documentation;

* repository links;

* workflows;

* configuration;

* deployment metadata;

* internal references that genuinely depend on the product or repository name.

* Search for all reasonable spelling and casing variants of the old name.

* Remove product-name mentions where no product-specific name is necessary rather than replacing every occurrence with another hard-coded name.

* Centralize unavoidable product-name and repository-name references where practical so future renaming is easier.

* Do not rename stable identifiers or stored values when doing so would unnecessarily break compatibility, existing data, or installations.

## Logo and icon

Replace the current logo and icon with:

```text

/home/x/Downloads/project/nixship.svg

```

Update all relevant uses of the existing branding, including application UI, repository documentation, metadata, and generated assets where applicable.

Preserve the appearance of the supplied SVG as closely as the target formats allow.

## Copy deployment links

Add a copy button next to every deployed link shown in the application.

Required behavior:

* The button copies the complete corresponding deployment URL.

* It must copy the correct URL when several deployments are displayed.

* The user must receive clear feedback after copying.

* Handle clipboard failures gracefully where relevant.

## Global active-deployment limit

Add a global setting that controls how many deployments remain active for each project.

Required behavior:

* The setting is global, but the limit is applied independently to each project.

* For every project, only the configured number of latest deployments should remain active.

* When a new deployment exceeds the configured limit, the oldest active deployment for that project must be deactivated.

* Deployment ordering must be deterministic and based on the actual deployment sequence or creation time.

* Existing projects and deployments must remain compatible.

* The setting must persist across application restarts where applicable.

* Invalid, missing, zero, negative, and unusually large values must be handled safely.

* The interface should clearly communicate what the setting controls.

Do not assume that deactivating a deployment must delete all historical information. Follow the existing deployment model and preserve useful history where possible.

## Cloudflare Quick Tunnels

Every active deployment must have its own Cloudflare Quick Tunnel.

Required behavior:

* Each deployment receives a separate temporary Cloudflare URL.

* Tunnels must not be shared between deployments in a way that prevents each deployment from remaining independently accessible.

* Tunnel state must correspond to deployment state.

* When a deployment is deactivated because it falls outside the retention limit, its tunnel must also be stopped or cleaned up appropriately.

* Creating, restarting, stopping, and cleaning up tunnels must not leave misleading deployment state.

* Tunnel failures must be surfaced clearly.

* Avoid orphaned tunnel processes and stale URLs where reasonably possible.

## Promote a deployment to production

Allow any eligible deployment to be promoted to production.

In this context, production is the domain configured for that project, when a production domain has been configured.

Required behavior:

* Any suitable deployment with its own temporary tunnel should be promotable.

* Promotion must make the selected deployment serve through the project’s configured production domain.

* Promotion should not require rebuilding or recreating the selected deployment.

* The currently promoted deployment must be clearly identifiable.

* Promoting a different deployment must update production to use the newly selected deployment.

* A project without a configured production domain must be handled gracefully.

* Failed or partially completed promotion must not leave the project in an incorrectly reported state.

* Existing project domain configuration must not be lost.

* Temporary deployment URLs and the configured production domain must remain clearly distinguishable.

Use the existing Cloudflare and deployment architecture where possible. Do not impose a specific routing implementation before inspecting the code.

---

# 2. Nixhost Android

The independent release and source-fetching changes have already been completed. The remaining Android work is primarily repository renaming, product renaming, branding, compatibility, integration updates, and verification.

## Repository and application rename

* Rename the GitHub repository using the `gh` CLI.

* Rename Nixhost Android to **Nix Ship Android**, while using **Nix Ship** where that is the appropriate user-facing product name.

* Update all relevant:

* application labels;

* screen titles;

* UI strings;

* documentation;

* repository links;

* metadata;

* build references;

* workflow references;

* release references;

* communication or integration references to the main repository.

* Search for all reasonable spelling and casing variants of the old name.

* Remove unnecessary product-name mentions instead of replacing every old mention with another hard-coded string.

* Centralize unavoidable branding references where practical.

Do not automatically change stable Android identifiers merely because they contain the old name.

Inspect before changing items such as:

* application ID;

* package namespace;

* signing identity;

* preference keys;

* database names;

* deep-link schemes;

* stored configuration keys;

* update-related identifiers.

Preserve compatibility wherever changing an identifier is not required for the requested rename.

## Logo and icon

Replace the current Android logo and icon assets using:

```text

/home/x/Downloads/project/nixship.svg

```

Update all relevant branding assets, including where applicable:

* launcher icons;

* adaptive icons;

* round launcher icons;

* splash-screen branding;

* in-application logos;

* repository artwork;

* release artwork stored in the repository.

Do not automatically reuse the full-colour logo as a notification icon if Android requires a separate monochrome asset. Derive or retain an appropriate notification asset based on the actual project requirements.

Verify that:

* no old application icon remains in normal builds;

* the supplied design remains visually recognizable;

* adaptive-icon safe areas are respected;

* the icon works on supported Android versions;

* release and debug variants do not unintentionally use different branding.

## Integration references

Update Android references affected by the main repository rename, including where applicable:

* repository URLs;

* clone or download URLs;

* GitHub API paths;

* raw-file URLs;

* release links;

* documentation links;

* workflow references;

* runtime defaults;

* configuration examples.

Use the new canonical repository location rather than relying permanently on GitHub redirects.

Do not disturb the already completed behavior that obtains the latest main-repository source for APK builds.

---

# 3. Nixhost and Harbur Integration Design

Inspect:

```text

/home/x/Downloads/project/nixhost-master

/home/x/Downloads/project/harbur

```

For this workstream, provide an implementation recommendation and design only.

Only make modifications once you are sure about it. once harbur is integrated, add a "Learn More" or "i" section on the connect button, and redirect to the harbur github repo

## Objective

Determine the simplest secure way to support deploying repositories hosted in Harbur in addition to repositories hosted on GitHub.

The resulting design must support:

* existing GitHub repositories;

* public Harbur repositories;

* private Harbur repositories;

* deployment of Harbur repository contents;

* one-time authorization rather than one secret per repository;

* access to all Harbur repositories that the authorized user is allowed to deploy;

* automatic deployment when a Harbur pull request is merged;

* minimal changes to both applications;

* minimal long-term coupling between the two projects.

GitHub support must remain available. Harbur support should be added alongside it rather than replacing it.

## Inspect the actual architectures

Before recommending a solution, inspect the relevant implementation in both repositories.

For Harbur, determine:

* how repositories and their contents are stored;

* how Google Drive is used as durable storage;

* how public and private repositories differ;

* how repository authorization is enforced;

* how repository archives or downloadable content are produced;

* how branches and revisions are identified;

* how pull requests are represented;

* how pull requests are merged;

* what information is available after a merge;

* whether there are existing endpoints, callbacks, events, tokens, or integration mechanisms that could be reused.

For Nixhost, determine:

* how GitHub repository URLs are currently handled;

* how repository contents are downloaded;

* how public and private GitHub repositories are supported;

* how authentication information is stored;

* how deployments are associated with repository revisions;

* how automatic deployments are triggered;

* whether the current implementation already has a suitable extension point for another repository source.

Do not assume either codebase has a provider abstraction, webhook system, API, or authentication mechanism until it has been inspected.

## Evaluate the Google Drive authorization idea

One possible approach is to authenticate the user with Google in Nixhost and allow Nixhost to access the repository data stored by Harbur in Google Drive.

Evaluate this approach based on the actual code, including:

* how much implementation work it requires;

* whether existing Google authentication can be reused;

* what Drive permissions would be required;

* whether permissions would be broader than necessary;

* whether it supports private repositories safely;

* whether public repositories need authentication;

* whether Nixhost would need to understand Harbur’s internal Drive layout;

* whether changes to Harbur’s storage format would require matching Nixhost changes;

* whether the two applications would become too tightly coupled;

* whether it remains simple for the user.

Do not select this approach merely because Google Drive is Harbur’s durable storage.

## Evaluate one-time trust with a Harbur instance

Another possible approach is to establish trust between Nixhost and a Harbur instance using the instance URL and a one-time secret, token, pairing process, authorization process, or another lightweight mechanism.

Evaluate:

* whether this fits the current architecture;

* how difficult it would be to implement;

* whether authorization can be completed once per Harbur instance or account;

* how it can allow access to all repositories the user is authorized to use;

* how public and private repositories would be handled;

* how access would be revoked or replaced;

* how repository contents would be downloaded;

* how pull-request merges would trigger deployments;

* how unauthorized repository access would be prevented;

* how much either application would need to know about the other’s internals;

* how a compromised credential could be contained.

The requirement is not necessarily to use a manually copied permanent secret. Determine what is simplest and reasonably secure for the actual applications.

## Look for a simpler existing integration point

Inspect whether either repository already provides a simpler way to satisfy the requirements.

Prefer an existing capability when it can securely provide:

* repository discovery;

* repository access;

* private repository authorization;

* immutable repository or revision downloads;

* pull-request merge notifications;

* one-time account- or instance-level authorization.

Do not add a large generic provider framework, new storage layer, or complex authentication system unless the existing architecture genuinely requires it.

## One-time authorization requirement

The user must not need to configure a separate secret for every Harbur repository.

The selected approach should allow the user to authorize a Harbur account or instance once. After authorization:

* repositories accessible to that identity should be available for deployment;

* private repositories must still enforce their permissions;

* repositories outside the identity’s permissions must remain inaccessible;

* access should be revocable;

* a revoked authorization must stop future private-repository access;

* secrets or credentials must not appear in logs, repository URLs, deployment output, or public configuration.

## Pull-request merge deployment

Merging a pull request in Harbur must be able to trigger a deployment.

The design must account for:

* identifying the correct Harbur instance;

* identifying the correct repository;

* identifying the exact merged result or revision;

* authenticating the trigger;

* preventing unauthorized deployment requests;

* preventing the same merge from creating duplicate deployments;

* retries after failed delivery;

* temporary unavailability of Nixhost;

* duplicated or delayed events;

* failures while obtaining the merged repository contents.

Do not rely only on deploying an unspecified latest repository state if Harbur can provide an exact merged revision.

The solution should require the smallest reasonable change to Harbur’s existing merge flow.

## Security requirements

The recommendation must address:

* authentication;

* repository-level authorization;

* private repository confidentiality;

* one-time setup;

* credential storage;

* credential revocation;

* credential replacement or rotation where applicable;

* least-privilege access;

* unauthorized deployment prevention;

* duplicate and replayed trigger handling;

* safe instance and repository URL handling;

* temporary failures;

* expired or removed authorization.

Do not prescribe a specific protocol, token structure, or cryptographic implementation until the codebases have been inspected.

## Coupling requirements

Prefer the design with the lowest reasonable long-term coupling.

In particular:

* Nixhost should not unnecessarily depend on Harbur’s internal Google Drive layout.

* Harbur should not unnecessarily depend on Nixhost’s internal deployment implementation.

* Ordinary changes to Harbur repository storage should not routinely require Nixhost changes.

* Ordinary Nixhost deployment changes should not routinely require Harbur changes.

* Any communication boundary should expose only the minimum stable information required.

* Repository access logic should remain owned by the application that can enforce it most safely.

* Users should not need to configure every repository independently.

## Required design output

Provide a design report containing:

1. The relevant architecture found in Harbur.

2. The relevant architecture found in Nixhost.

3. How GitHub repository deployment currently works.

4. The minimum capabilities required for Harbur deployment.

5. Evaluation of direct Google Drive authorization.

6. Evaluation of one-time trust or authorization with a Harbur instance.

7. Evaluation of any simpler alternative found in the codebases.

8. A comparison of the viable approaches based on:

* simplicity;

* security;

* implementation effort;

* coupling;

* maintenance;

* public repository support;

* private repository support;

* one-time authorization;

* pull-request merge deployment.

9. The recommended approach.

10. Why the recommendation best fits the actual codebases.

11. The minimum expected changes required in Harbur.

12. The minimum expected changes required in Nixhost.

13. The public-repository flow.

14. The private-repository flow.

15. The one-time authorization flow.

16. The pull-request merge deployment flow.

17. Failure, retry, duplicate-event, downtime, and revocation handling.

18. Security risks and mitigations.

19. A staged future implementation plan.

20. Acceptance criteria for the eventual implementation.

Do not implement this integration during the design work.

---

# Testing and Completion

## Repository placeholder

Where tests, fixtures, documentation examples, or generic repository fields require a placeholder repository URL, use the HitSea repository as the placeholder.

Do not add logic that special-cases HitSea.

## Actual deployment test

Use the following repository for real deployment testing:

```text

https://github.com/imxade/kitsy

```

Test deployment through the main application and the relevant Android flow.

The exact Android flow should follow the application’s existing capabilities rather than inventing unrelated functionality.

Verify the relevant end-to-end behavior, including:

* repository acceptance;

* repository retrieval;

* project preparation;

* deployment creation;

* Cloudflare Quick Tunnel creation;

* deployment URL visibility;

* Android interaction with the deployment system;

* correct handling of successful and failed deployment states.

## Local verification

Run the existing relevant tests and add or update tests for modified behavior.

Verify, where applicable:

* repository and product references;

* logo and icon assets;

* deployment-link copying;

* deployment retention;

* independent tunnel lifecycle;

* production promotion;

* Android compatibility;

* existing completed release behavior;

* existing completed latest-source behavior;

* existing GitHub repository support.

Do not disable or weaken valid checks merely to make the changes pass.

## CI monitoring

Push the implementation changes for Nixhost and Nixhost Android.

Use the `gh` CLI to:

* monitor workflow runs;

* inspect failed jobs;

* inspect failure logs;

* rerun appropriate jobs after fixes.

Continue fixing genuine implementation, build, test, packaging, workflow, or integration failures until all required CI checks succeed.

Do not make changes to Harbur as part of the design-only integration workstream.

# cleanup redundant code

> [!IMPORTANT]
> **Completion — Nix Ship main repository (2026-08-08).** The GitHub repository
> was renamed to `imxade/nixship`; product branding and the supplied logo were
> applied while stable identifiers remain compatible. Per-project active
> deployment retention, independent Quick Tunnels, no-rebuild production
> promotion, and copy controls for every displayed access URL are implemented
> with migrations, validation, lifecycle cleanup, and tests. The requested live
> Kitsy deployment resolved commit `b99bb7b4880e76011591da1820387048bb947e14`,
> activated successfully, received a dedicated Quick Tunnel, and returned HTTP
> 200 through the public tunnel.

> [!IMPORTANT]
> **Completion — Harbur integration design (2026-08-08).** Both architectures
> were inspected and the required 20-part design report was added at
> `docs/HARBUR_INTEGRATION_DESIGN.md`. It recommends a small versioned Harbur API,
> immutable snapshots, one-time scoped instance/account authorization, and a
> durable authenticated merge-event flow. Direct Google Drive access was
> rejected as broader and more tightly coupled. No Harbur source was modified.
