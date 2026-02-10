-- SQL Schema for ClawNet v2.0 'Federated Intelligence'
-- Database: Supabase (PostgreSQL)

-- Agents Table
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT DEFAULT 'worker', -- worker, warden, master
    status TEXT DEFAULT 'offline',
    specs JSONB, -- cpu, ram, os, etc.
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Tasks (Operations) Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT REFERENCES agents(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending', -- pending, running, completed, failed
    payload JSONB,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages (Chat Log / Intel) Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT REFERENCES agents(id),
    target_id TEXT, -- 'all' or specific agent_id
    content TEXT,
    message_type TEXT DEFAULT 'chat', -- chat, system, command
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    raw_traffic JSONB -- For warden persistence
);

-- Cron History Table
CREATE TABLE IF NOT EXISTS cron_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT REFERENCES agents(id),
    job_name TEXT,
    status TEXT,
    output TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
