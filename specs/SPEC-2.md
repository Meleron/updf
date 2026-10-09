# updf hosting and delivery specification

## Purpose

SPEC-1's app works locally. SPEC-2 puts it on the internet: the code in a public GitHub repository, the app hosted on Azure, the infrastructure written as Terraform, and a GitHub Actions pipeline that tests every change and deploys it. Spending is capped, so a fault or an attack can't run up a large bill. Success means a push to `main` (through a pull request) is tested, deployed to staging, and reaches production after one click, while the owner's hands-on work is limited to a short, written checklist.

It stays a learning and portfolio project: low cost, done properly, no enterprise extras.

## Scope

**In SPEC-2**
- A public GitHub repository with a protected `main`.
- Two Azure environments, staging and production, on Azure Container Apps.
- Terraform for all Azure resources, with remote state.
- A pipeline: checks on every pull request, then staging, then production after the owner's approval. Rollback to any earlier commit.
- Cost protection: hard limits on what can run, and a budget kill switch.
- One app change: rate limiting by the real client address behind Azure's proxy.
- A manual checklist for the owner, and deployment docs.

**Out of SPEC-2 (future)**
- A custom domain (Azure's default HTTPS addresses are used).
- Application Insights, uptime alerts, dashboards.
- Preview environments per pull request.
- Azure Front Door or a web application firewall (over budget).
- Dependency update automation (Dependabot or Renovate).

## Key decisions

| Topic | Decision |
|---|---|
| Hosting | Azure Container Apps, Consumption plan, region West Europe |
| Environments | `staging` and `prod`, one resource group each |
| Addresses | Azure's default `*.azurecontainerapps.io` HTTPS addresses |
| Container registry | GitHub Container Registry (GHCR), public packages |
| Infrastructure as code | Terraform with the `azurerm` provider, latest stable versions, pinned, lock file committed |
| Terraform state | An Azure Storage account in `rg-updf-shared`, one state file per configuration and environment, blob locking |
| GitHub to Azure sign-in | OpenID Connect (federated credentials on an Entra ID app registration). No stored passwords or secrets |
| Repository | Public on GitHub, so Actions minutes are free and unlimited |
| Changes to `main` | Pull requests only, merged when the checks pass |
| Production release | A GitHub environment `production` that waits for the owner's approval |
| Budget | $20 a month. Expected cost about $6-8 a month |
| Setup | The owner installs the tools, signs in and handles payment; Claude runs the CLI setup commands, asking before each one that creates or changes something |

## Architecture

```
GitHub (public repo, protected main)
  Actions pipeline ── OIDC ──> Azure (rg-updf-staging, rg-updf-prod)
        │
        └── pushes tested images ──> GHCR (public) <── pulled by Container Apps

Per environment (resource group rg-updf-<env>):
  Log Analytics workspace (30-day retention, daily ingestion cap)
  Container Apps environment (Consumption)
    frontend app  ── browser calls ──>  backend app
```

**Container apps.** Ingress is external and HTTPS only (HTTP redirects). Each app has liveness and readiness probes on its existing `/health/live` and `/health/ready`.

| App | Size | Staging replicas | Production replicas | Environment variables |
|---|---|---|---|---|
| Frontend | 0.25 vCPU, 0.5 GiB | 0 to 1 | 1 to 2 (always on) | `BACKEND_URL` = the backend's HTTPS address |
| Backend | 0.5 vCPU, 1 GiB | 0 to 1 | 0 to 2 | `Export__AllowedOrigin` = the frontend's HTTPS address, `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` |

- Scaling is by concurrent HTTP requests. A backend at zero replicas starts on the first request, which Container Apps holds until the replica is ready. The first Download after a quiet period takes a few seconds longer, behind the existing progress state. The editor always loads at once in production, because the frontend never scales to zero there.
- An app's address is its name plus the environment's default domain. Terraform knows it before creating the apps, so each app gets the other's address without a dependency cycle.
- Images are the existing Dockerfiles' images, identical in every environment, tagged with the commit SHA: `ghcr.io/<owner>/updf-frontend:<sha>` and `ghcr.io/<owner>/updf-backend:<sha>`.

**Shared resources** (resource group `rg-updf-shared`)
- The Storage account and `tfstate` container for Terraform state.
- The Automation account and runbook for the kill switch (see Cost protection).

**App change: the client address behind the proxy.** Container Apps' ingress is a proxy, so the backend sees every request as coming from it. The export rate limit (10 a minute per IP) would then be one limit shared by everyone. ASP.NET Core's built-in switch `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` makes the backend read the client address from `X-Forwarded-For`, using the last entry, the one the proxy added. It is set only in Azure. Locally it stays off, so a client can't fake an address to dodge the limit.

## Terraform

```
infra/
  bootstrap.sh     creates rg-updf-shared and the state Storage account (Azure CLI, safe to re-run)
  shared/          subscription-level resources, applied by Claude with the owner's sign-in
  app/             one environment, applied by the pipeline
    staging.tfvars
    prod.tfvars
```

**`bootstrap.sh`** creates only what Terraform needs before it can run: `rg-updf-shared`, and a Storage account with a `tfstate` container (no public access, TLS 1.2 or newer).

**`infra/shared`** needs owner rights, so it isn't run by the pipeline. It is applied from the owner's machine after `az login`, and its state is in the same Storage account. It holds:
- **The environment resource groups,** `rg-updf-staging` and `rg-updf-prod`.
- **The GitHub identity:** an Entra ID app registration `updf-github`, with federated credentials for the repository's `staging` and `production` GitHub environments only. It is Contributor on the two environment resource groups and can read and write the state container, and has nothing else.
- **A policy on each environment resource group:** a custom deny policy that rejects any resource type outside `Microsoft.App/*` and `Microsoft.OperationalInsights/*`, so nothing more expensive can be created there. The first apply of `infra/app` confirms these are the only types an environment needs.
- **The budget, action group, Automation account and kill-switch runbook** (see Cost protection).

**`infra/app`** describes one environment: the Log Analytics workspace, the Container Apps environment and the two apps. Its inputs are the environment name, the image tag and the replica limits. `staging.tfvars` and `prod.tfvars` hold the differences. A deployment is `terraform apply` with the new image tag, so changes to the infrastructure go through staging before production, just like code.

## Pipeline

One workflow, `.github/workflows/pipeline.yml`.

**Checks** (every pull request and every push to `main`)
1. **Backend:** `dotnet format --verify-no-changes`, build and tests.
2. **Frontend:** lint, type-check and Vitest.
3. **Infrastructure:** `terraform fmt -check` and `terraform validate` for `shared` and `app` (no Azure access needed), and a PSScriptAnalyzer lint of the runbook.
4. **End-to-end:** build both images, start the stack with Docker Compose, and run the whole Playwright suite in all four projects with `scripts/e2e.sh`, the same Playwright image used locally, so the screenshot baselines match. `CI` is set, so failing tests are retried, and the first retry keeps a trace. On failure, the HTML report and test results (traces, screenshots, videos) are uploaded as artifacts.

**Delivery** (only pushes to `main`, after every check passes)

5. **Publish:** push the images that the end-to-end job just tested to GHCR, tagged with the commit SHA. Nothing is rebuilt between testing and deploying.
6. **Staging** (GitHub environment `staging`): `terraform apply` of `infra/app` with `staging.tfvars` and the tag, then the smoke test against staging.
7. **Production** (GitHub environment `production`, which needs the owner's approval): the same, with `prod.tfvars`, then the smoke test against production.

**Smoke test.** One existing Playwright test, tagged `@smoke`, run only in Chromium against the deployed frontend: open a PDF, add text, download it, and check the PDF. It covers the real wiring: the addresses, CORS, the backend starting from zero, and forwarded headers.

**Rollback.** The workflow can also be run by hand with two inputs, an environment and an `image_tag` (an earlier commit SHA). It applies that tag, and Container Apps switches back to that revision.

**Safety**
- One deployment at a time per environment (a concurrency group per environment).
- Only the deploy jobs get `id-token: write`, the permission to sign in to Azure. Only the publish job gets `packages: write`.
- Fork pull requests run only the checks, which need no credentials.

**Repository variables** (not secrets): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and the state Storage account name.

## Cost protection

Azure updates cost data roughly 8 to 24 hours late, and budgets act on that data, so a budget alone can't stop a sudden spike. Protection has two layers.

**Hard limits** (prevent a large bill)
- **Replica caps:** at most 2 of each app in production and 1 of each in staging. With every replica busy all month, compute would come to about $180. Nothing can scale past the caps.
- **A Log Analytics daily ingestion cap** in each workspace.
- **No other usage-billed resources:** no VMs, databases or GPUs. The policy on the environment resource groups denies other resource types, and the GitHub identity can't reach anything outside those groups.
- **The existing export rate limit,** now per real client address.
- **Remaining risk: outbound traffic.** The first 100 GB a month are free and then it is billed per GB. A flood of requests for the app's files can't be capped without a web application firewall, which is over budget. It is bounded by the replica caps' throughput and by the kill switch's reaction time, about a day.

**Budget kill switch** (stops slower overspend)
- **The budget:** a subscription budget of $20 a month, with emails to the owner at $10 and $16 of actual cost.
- **The kill:** at $20 of actual cost, the budget triggers an action group, which runs an Automation runbook (PowerShell, in the repository under `infra/shared`). The runbook deletes every container app in both environment resource groups. Compute charges stop, and the logs, the Container Apps environments and the Terraform state stay.
- **The runbook's identity:** the Automation account's managed identity, Contributor on the two environment resource groups only.
- **Recovery is deliberate:** raise the budget or wait for the next month, then re-run the last deployment, which recreates the apps. A budget fires each threshold once a month, so the switch can't loop.
- **The drill:** after setup, the runbook is run by hand against staging only. Check that the apps are gone, then redeploy. The steps are in `docs/deployment.md`.

**Expected monthly cost:** about $6-8. Most of it is the always-on production frontend; the other apps scale to zero, and Log Analytics, budgets, alerts and Automation stay within free allowances. These are estimates from the Azure pricing pages, checked against Azure Cost Management after the first full week.

## Manual checklist (the owner)

1. **Azure billing:** add a payment method in the Azure portal, so the subscription is active and pay-as-you-go.
2. **Tools:** install the Azure CLI (`az`), the GitHub CLI (`gh`) and Terraform. `docs/deployment.md` lists the install commands for Ubuntu and Windows.
3. **Sign in:** run `az login` and `gh auth login` in the Claude Code terminal (with the `!` prefix).
4. **Approve** each command that creates or changes something in Azure or GitHub.
5. **Packages:** after the first publish, open the two packages under the GitHub profile's Packages tab. If either is private, change its visibility to public in the package settings (only possible on the website).
6. **Alerts:** confirm the budget alert email address (the account email by default).
7. **Releases:** approve each production deployment in GitHub Actions.

**What Claude does with the CLIs** after the owner signs in:
- Create the public repository `updf`, push the history, and set the repository variables.
- Run `bootstrap.sh` and apply `infra/shared`.
- Create the `staging` and `production` GitHub environments (the owner as production's required reviewer), and protect `main` so pull requests need the checks.
- Open the first pull request and follow it through CI, staging and the owner's first production approval.
- Run the kill-switch drill.

## Testing

- **Backend integration tests:** with forwarded headers on, the export rate limit counts each forwarded client address separately. With them off (the default), `X-Forwarded-For` is ignored.
- **Infrastructure:** `fmt` and `validate` for both Terraform configurations, and the runbook lint, all in the checks.
- **Pipeline:** the first pull request proves the checks. The first merge proves the staging deployment and the smoke test. The first approval proves production.
- **Kill switch:** the staging drill.
- **Cost:** compare Azure Cost Management with the estimate after the first full week.

## Documentation

- **`docs/deployment.md`:** the architecture, how a change is deployed, rollback, the kill switch and recovery, costs, and the owner's checklist with tool installation.
- **README and CLAUDE.md** link to it. CLAUDE.md moves the Azure services from "Not decided" to decided.
