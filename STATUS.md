# ClawNet C2C v3.5 Status

## Current: v3.5.0 — Modular Architecture

### Completed
- ✅ Monolith restructured into 15+ modular files under `src/`
- ✅ Rooms (join/leave/scoped chat)
- ✅ Warden traffic events
- ✅ Delivery guarantees (ACK/offline queue/flush)
- ✅ Safety controls (denylist/riskylist/approval gating)
- ✅ Audit/metrics API with SHA-256 hash chain
- ✅ Multi-tenant isolation
- ✅ Direct messaging
- ✅ All 9 test files passing

### Next
- [ ] Dashboard UI redesign (rooms, DMs, presence indicators)
- [ ] `client.js` protocol v2 features
- [ ] Chat-first architecture (per `.sisyphus/plans/clownet-perfect.md`)
- [ ] CLI tool for fleet management
- [ ] OpenClaw integration
