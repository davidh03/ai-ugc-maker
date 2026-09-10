# AWS Production Hosting + CI/CD Plan

> Implementation plan only. Do not deploy or create billable AWS resources until the infrastructure plan is reviewed.

Goal: make AI UGC Maker available at a real HTTPS website and deploy automatically whenever changes land on `main`.

## Recommendation

Use a dedicated AWS EC2 instance for the first production deployment, running the application in Docker Compose behind Caddy or an Application Load Balancer.

This is the least invasive choice for the current code because it currently relies on:

- local job persistence
- local generated media files
- long-running HyperFrames/Chromium/FFmpeg processes
- background reviewer and generation workers
- a single application process model

Fargate/ECS is a good scale-out destination, but using it immediately would require moving job state and media to durable managed services first. Do not force that refactor into the first hosting deployment.

## Target first-production architecture

```text
Domain DNS
  -> HTTPS reverse proxy (Caddy on EC2, or ALB)
  -> Docker Compose
       web/API container
       generation worker container
       persistent data volume
  -> S3 backup for generated MP4s and job data
  -> GitHub Actions via AWS OIDC or SSM
```

Suggested starting capacity: an Ubuntu EC2 instance with enough memory for Chromium, FFmpeg and one generation at a time, gp3 storage sized for temporary media and logs, and a separate S3 bucket for durable artifacts/backups. Exact instance size must be selected after measuring one real local render; do not guess from a development laptop.

## Phase 1: production-readiness audit

Files to inspect or modify:

- `server/src/config.js`
- `server/src/store.js`
- `server/src/index.js`
- `server/src/jobRunner.js`
- `server/package.json`
- `web/package.json`
- `Dockerfile` or new `deploy/Dockerfile`
- new `deploy/docker-compose.production.yml`
- new `deploy/Caddyfile`
- new `.github/workflows/ci.yml`
- new `.github/workflows/deploy.yml`

Required changes:

- Read all secrets from environment or AWS Secrets Manager; never commit them.
- Bind the service to the intended interface and add production health/readiness checks.
- Make data and media directories explicit volumes.
- Add graceful shutdown so active jobs are marked recoverable rather than silently lost.
- Add request size limits, authenticated access and safe upload validation before public exposure.
- Separate web/API and worker lifecycle so a web restart cannot kill a render unexpectedly.
- Add structured logs without API keys, tokens or uploaded prompt secrets.

## Phase 2: containerize and run locally

1. Build the production image.
2. Verify Chromium/HyperFrames/FFmpeg dependencies inside the image.
3. Run the compose stack locally with a non-production `.env`.
4. Generate a short test video.
5. Verify `/api/health`, job creation, polling, output download and cancellation.
6. Confirm the data volume survives container recreation.
7. Confirm the reviewer cannot modify the released artifact.

## Phase 3: AWS foundation

- Create a dedicated VPC/security group or use an existing reviewed VPC.
- Allow HTTP/HTTPS only through the intended entry point.
- Do not expose the Node API port directly to the internet.
- Use IAM roles instead of long-lived AWS keys on the server.
- Store provider credentials in AWS Secrets Manager or SSM Parameter Store.
- Create an encrypted gp3 EBS volume for working data.
- Create an encrypted private S3 bucket for completed media and backups.
- Enable CloudWatch logs, disk alarms, memory/process monitoring and backup retention.
- Assign a stable public address or DNS target.

## Phase 4: HTTPS website

Preferred initial path: Caddy on EC2 with DNS pointing to the instance. Caddy automatically obtains and renews a Let's Encrypt certificate and keeps the setup small.

Alternative once traffic or availability requirements justify it: Route 53 → Application Load Balancer → private ECS/EC2 service.

Acceptance:

- `https://<domain>/` loads the frontend.
- API requests use the same HTTPS origin or a controlled API hostname.
- HTTP redirects to HTTPS.
- Upload and output routes require the intended authentication.
- MP4 downloads work through the public domain.

## Phase 5: CI/CD on push to main

GitHub Actions workflow:

1. Trigger on push to `main`.
2. Checkout code.
3. Run backend tests.
4. Run frontend lint and build.
5. Run `git diff --check`.
6. Build and tag the Docker image with commit SHA.
7. Push the image to Amazon ECR.
8. Deploy the exact SHA to EC2 through AWS SSM or a tightly restricted deployment role.
9. Run a remote health check and smoke test.
10. Mark the deployment failed if the new container is unhealthy.
11. Keep the previous image available for rollback.

Use GitHub OIDC with a narrowly scoped AWS IAM role rather than storing AWS access keys in GitHub secrets. Keep deployment credentials separate from application/provider credentials.

The deploy must be atomic enough that a failed build leaves the existing version running. Include a documented rollback to the previous image SHA.

## Phase 6: durable scaling path

Move to ECS when one of these becomes true:

- multiple concurrent generations are required
- a single EC2 host is a reliability bottleneck
- worker and web scaling need to be independent
- durable multi-instance job processing is required

Before ECS:

- move job records from JSON storage to a transactional database
- move MP4/assets to S3
- use SQS for generation/reviewer work
- add idempotent job leases and worker heartbeats
- use ECS service for web/API and ECS tasks or a worker service for rendering
- put the service behind an ALB

Do not move to ECS while the application still assumes one local filesystem is the source of truth.

## Validation and rollback

- Test every deployment in a staging environment or smoke-test path first.
- Verify the deployed commit SHA from an authenticated diagnostics endpoint or container label.
- Generate one short non-paid test artifact after deployment.
- Confirm old jobs remain readable.
- Confirm an in-progress job survives a web container restart or is marked recoverable.
- Test rollback to the previous image.
- Monitor disk, memory, CPU, render duration, failed jobs and reviewer correction count.

## Main risks

- Video generation can exhaust RAM, disk and CPU.
- Public uploads and output URLs require authentication and abuse controls.
- Local JSON storage is not safe for multiple workers.
- CI/CD can deploy broken code unless tests and health checks block promotion.
- Provider credentials must never be placed in the image or GitHub logs.
- AWS costs rise quickly with always-on compute, EBS, S3 and external model calls.

Definition of ready: the app is available over HTTPS, secrets are managed outside Git, `push main` produces a tested immutable image and a verified deployment, failed deployments do not replace the working version, and the system can be migrated to ECS without changing the user-facing job contract.
