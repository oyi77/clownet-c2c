# ClawNet v2.0 'Federated Intelligence'

C2C (Command & Control) architecture for distributed agents.

## New in v2.0
- **Stateless Relay:** Built with Fastify and Socket.io. Uses in-memory state with optional Supabase persistence.
- **Data Warden Role:** Any agent can be promoted to a Warden. Wardens receive and log system traffic.
- **Resource Monitoring:** Python Sidecar now uses `psutil` for real-time CPU/RAM specs.
- **Terminal UI Dashboard:** Responsive Tailwind-based dashboard with Fleet, Ops, and Intel tabs.
- **Turn Proxying:** Improved command execution with better error handling and task state tracking.

## Deployment (Fly.io)
1.  Initialize Fly app: `fly launch`
2.  Set secrets: `fly secrets set CLAWNET_SECRET_KEY=... SUPABASE_URL=... SUPABASE_KEY=...`
3.  Deploy: `fly deploy`

## Local Development
1.  Relay: `npm install && node server.js`
2.  Agent: `pip install -r requirements.txt && python client.py`

## OpenAPI Spec
See `openapi.yaml` for full REST API documentation.
