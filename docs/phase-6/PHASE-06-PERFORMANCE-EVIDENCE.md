# Phase 6 Performance Evidence

## Result

**PASS for the accepted local regression targets on 2026-08-29.** This is engineering evidence for
the single-instance baseline, not an external SLA, concurrent soak test, or production capacity
claim.

## Environment and dataset

- Node.js `v24.19.0`; MySQL `8.4.11`; Windows x64.
- 11th Gen Intel Core i5-11320H, 8 logical CPUs, 15.7 GiB memory.
- Isolated `opspilot_test` database.
- 10,000 recipient-owned persistent notifications linked to one synthetic support resource.
- Three warmups and 30 measured samples unless noted; p95 uses nearest-rank ordering.
- The profiler creates only run-scoped synthetic rows and removes them in `finally`.

Run:

```text
npm run phase6:performance:profile --workspace @opspilot/api
```

## Measurements

| Operation | Samples | p50 | p95 | Maximum | Target | Result |
|---|---:|---:|---:|---:|---:|---|
| Latest notification list API, limit 100 | 30 | 12.134 ms | 19.195 ms | 19.521 ms | < 300 ms | Pass |
| Notification unread-count API | 30 | 32.445 ms | 63.766 ms | 76.913 ms | < 300 ms | Pass |
| Committed job enqueue through successful worker claim | 30 | 24.285 ms | 41.988 ms | 51.509 ms | < 1,000 ms | Pass |
| Persistent notification materialization | 30 | 6.721 ms | 10.814 ms | 15.483 ms | < 5,000 ms | Pass |
| Notification commit through connected-client hint | 20 | 33.531 ms | 36.674 ms | 36.688 ms | < 2,000 ms | Pass |

The queue operation includes the source transaction's job insert, `SKIP LOCKED` claim, attempt
insert, and completion. Materialization resolves current recipients/state and inserts a deduped
notification. The hint measurement uses a real local HTTP/Socket.IO server with a 25 ms engineering
poll interval; the accepted default is 500 ms and remains within the two-second target under this
topology.

## Additional load/recovery evidence

- Two concurrent workers claim four disjoint jobs without duplication.
- A 20-connection distinct-user reconnect storm is admitted under the configured source ceiling;
  the next handshake is rejected.
- Duplicate tabs stop at the per-user cap.
- A simulated queue/database poll outage backs off, resumes, and shuts down cleanly.
- Live isolated worker smoke remained healthy and completed scheduled work.

## Limitations

The profile does not cover wide-area latency, concurrent mixed business traffic, a large job
history, long-running handlers, horizontal API/worker scale, proxy behavior, database failover,
soak duration, or hosted monitoring overhead. Production capacity/SLOs, topology, and alerts remain
deployment decisions.
