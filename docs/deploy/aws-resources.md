# AWS resources — ai-ugc-maker production

Phase 3 of [`docs/plans/aws-production-hosting-cicd.md`](../plans/aws-production-hosting-cicd.md),
actually provisioned (not a plan) in account `043272859527`, region `us-east-1`,
on 2026-09-11. Everything below is tagged `Project=ai-ugc-maker` and lives in
its own VPC — nothing shares networking or security groups with this
account's other instances (`hermes-agent`, `dograh-instance-dev`), which
were not touched.

## Resource inventory

| Resource | ID | Notes |
|---|---|---|
| VPC | `vpc-0b123335c89905bcb` | `10.42.0.0/16`, isolated from the account's other VPCs |
| Internet Gateway | `igw-0ba5c299992fa7ff3` | |
| Public subnet | `subnet-016d61a87fce656ef` | `10.42.1.0/24`, us-east-1a |
| Route table | `rtb-033a5959060a56279` | `0.0.0.0/0` → IGW |
| Security group | `sg-052c8b2914f359124` | Inbound: 80, 443 only. **No SSH** — admin access is via SSM Session Manager |
| EC2 instance | `i-0c06ca4664b56a8ea` | `ai-ugc-maker-prod`, **t3.small** (2 vCPU/2GB + 4GB swap — see "Instance sizing" below), Ubuntu 22.04, 60GB encrypted gp3 |
| Elastic IP | `eipalloc-02becb443537031ec` | `54.235.121.125` — point a domain's A record here when you have one |
| IAM role (instance) | `ai-ugc-maker-ec2-role` / instance profile `ai-ugc-maker-ec2-profile` | SSM Session Manager, ECR pull, scoped S3 + Secrets Manager + SSM Parameter read |
| IAM role (GitHub OIDC) | `ai-ugc-maker-github-deploy` | Assumed by `.github/workflows/deploy.yml`; scoped to this repo's OIDC subject and this specific ECR repo/instance |
| ECR repository | `043272859527.dkr.ecr.us-east-1.amazonaws.com/ai-ugc-maker` | Image scanning on push |
| S3 bucket | `ai-ugc-maker-media-043272859527` | Private, encrypted, versioned — for backups/durable media (Phase 6, not wired up yet) |
| CloudWatch | namespace `ai-ugc-maker` | Memory + disk metrics via the CloudWatch agent (EC2 doesn't report these by default) |

App reachable at: `http://54.235.121.125/` (plain HTTP — no domain yet, see
"HTTPS" below). Direct access to port 8787 is not possible from the
internet; the security group only opens 80/443, and the app itself is
bound to `127.0.0.1:8787` inside the instance (Caddy proxies it).

## Instance sizing — real numbers, not a guess

Measured (`docker stats` during an actual 15-second, multi-scene local
render): **~900MB peak**. Options considered:

| Type | Cost | |
|---|---|---|
| t3.small | ~$15/mo | **chosen** — 2GB RAM + a 4GB swap file (`/swapfile`, `vm.swappiness=10`) absorbs a memory spike from a longer/heavier render instead of an OOM kill |
| t3.medium | ~$30/mo | comfortable without swap |
| t3.large | ~$61/mo | started here initially, resized down |
| Spot (any size) | ~45% off any of the above | not used — real interruption risk, even though the app's graceful-shutdown/job-recovery code (tested) handles it safely; on-demand + swap was the chosen tradeoff |

Resizing later: `aws ec2 stop-instances` → `modify-instance-attribute
--instance-type` → `start-instances`, a few minutes, no rebuild. If a real
production render (180s, many scenes/assets) turns out to need more than
2GB+4GB swap can comfortably give, that's the first thing to revisit.

## What's NOT done yet

- **HTTPS / a real domain.** Caddy is running and proxying the app over
  plain HTTP on the bare Elastic IP. Point a domain's DNS at
  `54.235.121.125`, set `DOMAIN=yourdomain.com` in the Caddy service's
  environment on the instance, restart the `caddy` container — Caddy gets
  and renews a Let's Encrypt certificate automatically, no other change
  needed. See `deploy/Caddyfile`.
- **Access control.** No Basic Auth is configured yet (the commented block
  in `deploy/Caddyfile`) and `API_AUTH_TOKEN` is unset. **The app is
  currently open to the whole internet at the IP above.** Decide on this
  before telling anyone the URL — see "Access control for a first
  deployment" in `docs/deploy/README.md`.
- **Secrets.** `server/.env.production` on the instance currently only has
  `COMPOSER=template` — no TTS/voiceover API keys. Populate it (directly,
  or via Secrets Manager/SSM Parameter Store under `ai-ugc-maker/*`, which
  the instance role can already read) before relying on voiceover-enabled
  jobs in production.
- **S3 backups.** The bucket exists; nothing writes to it yet. That's
  Phase 6 (job store → real DB, media → S3) territory, not this pass.
- **CloudWatch alarms.** The agent is collecting memory/disk metrics into
  the `ai-ugc-maker` namespace; no alarms are wired to them yet (e.g.
  disk >85%, mem >90%) — worth adding before trusting this unattended.

## Real bugs this provisioning pass caught (fixed, see git log)

Local Docker testing (Phase 2) could not have caught any of these — they
only showed up against real AWS:

1. GitHub's OIDC `sub` claim uses immutable numeric IDs
   (`repo:davidh03@221615289/ai-ugc-maker@1349069073:environment:production`),
   not the classic `repo:OWNER/REPO:ref:REF` format most examples show.
2. `vars.AWS_DEPLOY_ENABLED` set at the environment level is invisible to a
   job-level `if:` — GitHub only resolves environment-scoped vars/secrets
   after that gate. Moved to a repository-level variable.
3. The EC2 instance's own Docker daemon was never authenticated to ECR —
   `aws-actions/amazon-ecr-login@v2` only logs in the GitHub *runner*.
   Needed `aws ecr get-login-password | docker login` run on the instance
   itself, which also needed the AWS CLI installed (not on the Ubuntu AMI
   by default).
4. `aws ssm wait command-executed || true` in `deploy.yml` waited for a
   terminal state, not success — a failed remote command was reported as a
   green GitHub Actions step.

## Teardown

If this ever needs to go away entirely:
```bash
aws ec2 terminate-instances --instance-ids i-0c06ca4664b56a8ea
aws ec2 release-address --allocation-id eipalloc-02becb443537031ec
aws ecr delete-repository --repository-name ai-ugc-maker --force
aws s3 rb s3://ai-ugc-maker-media-043272859527 --force
aws iam delete-role-policy --role-name ai-ugc-maker-ec2-role --policy-name ai-ugc-maker-app-access
aws iam detach-role-policy --role-name ai-ugc-maker-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam detach-role-policy --role-name ai-ugc-maker-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam detach-role-policy --role-name ai-ugc-maker-ec2-role --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
aws iam remove-role-from-instance-profile --instance-profile-name ai-ugc-maker-ec2-profile --role-name ai-ugc-maker-ec2-role
aws iam delete-instance-profile --instance-profile-name ai-ugc-maker-ec2-profile
aws iam delete-role --role-name ai-ugc-maker-ec2-role
aws iam delete-role-policy --role-name ai-ugc-maker-github-deploy --policy-name ai-ugc-maker-deploy-permissions
aws iam delete-role --role-name ai-ugc-maker-github-deploy
# then, after the instance/ENI are gone: detach + delete IGW, delete subnet/route table/security group/VPC
```
The pre-existing GitHub OIDC provider (`token.actions.githubusercontent.com`)
was reused, not created — don't delete it, other things in this account may
depend on it.
