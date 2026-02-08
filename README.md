# ClawNet C2C

Command & Control system for managing agents and monitoring cron jobs.

## Components

- **Server**: Node.js + Fastify + Socket.io + SQLite
- **Dashboard**: Simple EJS UI at `/dashboard`
- **Client**: Python sidecar script

## Setup

1. `npm install`
2. `export CLAWNET_SECRET_KEY=your_key`
3. `node server.js`

## Client

1. `pip install "python-socketio[client]"`
2. `export CLAWNET_SERVER=http://your-server:3000`
3. `export CLAWNET_SECRET_KEY=your_key`
4. `python client.py`
