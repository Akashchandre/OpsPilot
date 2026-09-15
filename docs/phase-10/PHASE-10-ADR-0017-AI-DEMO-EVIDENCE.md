# ADR 0017 Production-Demo AI Verification Evidence

## Result

**PASS for repository release readiness and the authorized ADR 0017 live personal-demo deployment
on 2026-09-15.**

The complete AI-enabled `compose.demo.yaml` profile was built and started as the isolated project
`opspilot-ai-demo-verify` with generated synthetic secrets, fictional configuration, the locally
configured Groq credential, and no persistent production data. The disposable stack and all of its
volumes were removed after verification.

Exact release commit `117f645e3ed981cae0dcf03e070159093398dc21` was then pushed and deployed
with the ADR 0014 data-preserving script to the existing single-EC2 demo. The remote checkout was
clean at that commit, and the existing MySQL container and `opspilot_mysql-data` volume were
preserved.

This evidence applies only to ADR 0017's time-bounded single-EC2 fictional-data demo exception. It
does not satisfy ADR 0013's general-production release gate or authorize real data, Razorpay Live
Mode, multiple application instances, HA, or backup claims.

## Build and startup evidence

- Docker Compose rendered the `mysql`, `migrate`, `api`, `ai`, `worker`, and `web` services plus
  private document, vector, and checkpoint volumes.
- The AI image downloaded the exact approved
  `qdrant/all-MiniLM-L6-v2-onnx` revision
  `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` during the image build. All five accepted artifact
  hashes in `docker/ai-model.sha256` passed before the image was emitted.
- The AI runtime image manifest list was
  `sha256:6e8a06603d9c0a5550a821ef73ee93a63662d28766651fe08396c2531669ee01`.
- The migration container exited `0`; MySQL, API, AI, and web became healthy; the worker started
  only after API and AI health were satisfied.
- The first disposable attempt correctly failed closed because the earlier image had no offline
  embedding artifact. The fix moved the reviewed model download and hash validation to build time,
  and the successful runtime performed no model download.

## Runtime security and health evidence

The public API health contract returned only coarse states:

```json
{
  "status": "ok",
  "database": "reachable",
  "ai": "ready",
  "aiWorkflows": "ready",
  "documents": {
    "storage": "ready",
    "embedding": "ready",
    "vectorIndex": "ready"
  }
}
```

- AI startup completed the live Groq model-list preflight with the fixed model active and the ZDR
  confirmation policy enabled. No metered generation/evaluation was run in this change.
- FastAPI published no host port and remained in the API container's network namespace.
- Only the AI container received the `GROQ_API_KEY` variable; API and worker did not.
- AI ran as UID/GID `10002:10002`; API ran with its existing non-root UID/GID `1000:1000`.
- Model, Qdrant, checkpoint, and document roots were mode `0700`. The appropriate non-root service
  could write its Qdrant/checkpoint or document volume.
- At idle after startup, observed memory was approximately 472 MiB MySQL, 145 MiB API, 240 MiB AI,
  116 MiB worker, and 8 MiB web. This is local evidence only, not an EC2 capacity/SLO guarantee.

## Live deployment evidence

- The ignored production `demo.env` remained owned by `ubuntu:ubuntu` at mode `0600`, contained
  no placeholder values, and passed Compose validation. Groq ZDR confirmation was enabled without
  recording the credential value in evidence or command output.
- The data-preserving deployment built the Node, AI, migration, and web images; migration exited
  successfully; MySQL remained the existing three-day-old container; and API, AI, MySQL, and web
  reported healthy after stabilization. The worker started after its dependencies and continued
  completing reservation-expiry and AI-workflow-retention jobs successfully.
- The deployed AI image manifest list was
  `sha256:950f47345130e2852a83ca19dc00d14bbfdacb1646ed968ca65d9428f22ea45c`.
- The loopback API health response reported the database, AI provider, AI workflows, document
  storage, embedding model, and vector index ready. FastAPI published no host port and ran as
  UID/GID `10002:10002`.
- Only the AI container exposed the Groq configuration variable names. API and worker each had
  zero `GROQ_API_KEY` variables. No secret values were printed.
- Checkpoint, local-Qdrant, and encrypted-document roots were mode `0700`. Docker reported distinct
  `opspilot_demo-ai-checkpoint-data`, `opspilot_demo-ai-vector-data`,
  `opspilot_demo-document-data`, and preserved `opspilot_mysql-data` volumes.
- Observed live memory after startup was approximately 157 MiB MySQL, 125 MiB API, 250 MiB AI,
  127 MiB worker, and 4 MiB web. This is a point-in-time observation, not an SLO or capacity claim.
- `docker/demo-smoke.sh https://de1blqypqxue4.cloudfront.net` passed the public SPA, API, AI,
  document, workflow, and Socket.IO checks. CloudFront invalidation
  `I54J2JXQURIQTRPTKYI9WDO5UC` then completed so clients receive the new navigation bundle.
- The AI startup log recorded `provider_preflight_completed` with state `ready`. The expected
  accepted warning that payload indexes have no effect in embedded/local Qdrant remains consistent
  with ADR 0017's single-instance limitation.

## Automated checks

- API: 41 files / 226 tests passed.
- Web: 12 files / 63 tests passed.
- Python AI: 166 passed, 3 explicitly skipped; two existing local-library warnings remained.
- Coverage gates passed: API `82.45%` statements / `73.59%` branches, web `80.99%` statements /
  `71.81%` branches, and Python AI `85%` total coverage.
- ESLint passed.
- Prettier check and Prisma validation passed.
- Ruff lint and format checks passed.
- Web production build passed.
- Compose production-demo render passed.
- The changed demo smoke script and deployment script passed Git Bash syntax validation.
- AI and Node runtime image builds passed; required private-path ownership/modes passed.
- A fresh Docker Scout scan could not run because the local Scout client now requires Docker Hub
  authentication. The image's OS/Python package set is unchanged from the recorded `3C/11H`
  baseline; only the reviewed model artifact was added. Treat `3C/11H` as carried-forward risk
  acceptance, not as a fresh digest-specific scan result.

## Remaining external acceptance and operating checks

1. Exercise the customer and owner assistants, document RAG, business brief, and support-draft
   workflow in a signed-in browser using fictional content only. Deployment verification did not
   submit metered AI prompts or process support content on the owner's behalf.
2. Disable all AI flags and investigate if any dependency is not `ready`, the EC2 host swaps
   excessively, or the fictional-data boundary cannot be enforced.
3. Obtain a fresh digest-specific Docker Scout result when authenticated Scout access is available;
   until then the explicitly accepted carried-forward `3C/11H` AI-image finding count applies.
