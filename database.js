const Database = require('better-sqlite3');
const db = new Database('clownet.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    hostname TEXT,
    ip TEXT,
    role TEXT DEFAULT 'worker',
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'online'
  );

  CREATE TABLE IF NOT EXISTS cronjobs (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    name TEXT,
    schedule TEXT,
    command TEXT,
    last_run DATETIME,
    last_status TEXT,
    FOREIGN KEY(agent_id) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    command TEXT,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(agent_id) REFERENCES agents(id)
  );
`);

module.exports = db;
