# ClawNet C2C - Socket Events API

Complete reference for all Socket.IO events in ClawNet C2C v3.5 Modular.

## Table of Contents

- [Core Events](#core-events)
- [Shared Memory Events](#shared-memory-events)
- [Credentials Events](#credentials-events)
- [File Sharing Events](#file-sharing-events)
- [Skills Events](#skills-events)
- [Orchestration Events](#orchestration-events)
- [Configuration Events](#configuration-events)
- [Error Codes](#error-codes)

---

## Core Events

### agent_connect
Emitted when an agent connects to the relay.

**Emitted by**: Client (agent)

**Request Format**:
```json
{
  "agentId": "string",
  "metadata": {
    "hostname": "string",
    "platform": "string",
    "arch": "string",
    "nodeVersion": "string"
  }
}
```

**Broadcasts to**: `agent_joined`

---

### agent_disconnect
Emitted when an agent disconnects.

**Emitted by**: Client (agent)

**Request Format**: None (socket disconnect)

**Broadcasts to**: `agent_left`

---

### report
Emitted by agents to report status/logs.

**Emitted by**: Client (agent)

**Request Format**:
```json
{
  "type": "status|log|error",
  "data": "string|object"
}
```

---

## Shared Memory Events

### set_shared_memory
Store a key-value pair in shared memory.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "key": "string",
  "value": "any",
  "ttl": "number (optional, default: 3600, expiration in seconds)"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Memory set successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "string (error message)"
}
```

**Broadcasts to**: `management_data_update`

**Broadcast Payload**:
```json
{
  "type": "memory_updated",
  "data": { "key": "value", "ttl": "number" }
}
```

---

### get_shared_memory
Retrieve a value from shared memory.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "key": "string"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "key": "string",
    "value": "any",
    "createdAt": "timestamp",
    "expiresAt": "timestamp"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Key not found or expired"
}
```

---

### list_shared_memory
List all shared memory keys.

**Emitted by**: Dashboard

**Request Format**: None

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "key": "string",
      "createdAt": "timestamp",
      "expiresAt": "timestamp"
    }
  ]
}
```

---

### delete_shared_memory
Delete a key from shared memory.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "key": "string"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Memory deleted successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Key not found"
}
```

**Broadcasts to**: `management_data_update`

---

## Credentials Events

### store_credentials
Store encrypted credentials.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "name": "string",
  "value": "object|string",
  "description": "string (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "credentialId": "uuid",
  "message": "Credentials stored successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "string (error message)"
}
```

**Broadcasts to**: `management_data_update`

**Security**: Value is encrypted using AES-256-GCM with server-side encryption key.

---

### get_credentials
Retrieve stored credentials (decrypted).

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "credentialId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "credentialId": "uuid",
    "name": "string",
    "description": "string",
    "value": "object|string (decrypted)",
    "createdAt": "timestamp",
    "owner": "agentId"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or credentials not found"
}
```

**Access Control**: Only owner and agents in `sharedWith` can access.

---

### list_credentials
List all credentials for current user.

**Emitted by**: Dashboard

**Request Format**: None

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "credentialId": "uuid",
      "name": "string",
      "description": "string",
      "createdAt": "timestamp",
      "owner": "agentId"
    }
  ]
}
```

---

### share_credentials
Share credentials with another agent.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "credentialId": "uuid",
  "targetAgentId": "agentId"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Credentials shared successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or target agent not found"
}
```

**Access Control**: Only owner can share.

---

### revoke_credentials_access
Revoke access to credentials.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "credentialId": "uuid",
  "targetAgentId": "agentId"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Access revoked successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or credentials not found"
}
```

---

## File Sharing Events

### upload_file
Upload a file to the shared storage.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "name": "string (filename)",
  "data": "string (base64-encoded file data)",
  "type": "string (MIME type, optional)"
}
```

**Response**:
```json
{
  "success": true,
  "fileId": "uuid",
  "message": "File uploaded successfully",
  "size": 1024
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "string (error message)"
}
```

**Validation**: Max file size is 10MB (10,485,760 bytes).

**Broadcasts to**: `management_data_update`

---

### download_file
Download a file from shared storage.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "fileId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "name": "string",
    "data": "string (base64-encoded)",
    "type": "string",
    "size": "number",
    "createdAt": "timestamp",
    "owner": "agentId"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or file not found"
}
```

**Access Control**: Only owner and agents in `sharedWith` can download.

---

### list_files
List all accessible files.

**Emitted by**: Dashboard

**Request Format**: None

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "fileId": "uuid",
      "name": "string",
      "type": "string",
      "size": "number",
      "createdAt": "timestamp",
      "owner": "agentId"
    }
  ]
}
```

---

### share_file
Share a file with another agent.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "fileId": "uuid",
  "targetAgentId": "agentId"
}
```

**Response**:
```json
{
  "success": true,
  "message": "File shared successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or target agent not found"
}
```

---

### revoke_file_access
Revoke access to a file.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "fileId": "uuid",
  "targetAgentId": "agentId"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Access revoked successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or file not found"
}
```

---

### delete_file
Delete a file from storage.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "fileId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or file not found"
}
```

---

## Skills Events

### register_skill
Register a skill for an agent.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "name": "string",
  "description": "string"
}
```

**Response**:
```json
{
  "success": true,
  "skillId": "uuid",
  "message": "Skill registered successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "string (error message)"
}
```

---

### get_skill
Retrieve a skill by ID.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "skillId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "skillId": "uuid",
    "name": "string",
    "description": "string",
    "experience": "number",
    "createdAt": "timestamp",
    "owner": "agentId"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or skill not found"
}
```

---

### list_skills
List all accessible skills.

**Emitted by**: Dashboard

**Request Format**: None

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "skillId": "uuid",
      "name": "string",
      "description": "string",
      "experience": "number",
      "createdAt": "timestamp",
      "owner": "agentId"
    }
  ]
}
```

---

### share_skill
Share a skill with another agent.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "skillId": "uuid",
  "targetAgentId": "agentId"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Skill shared successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or target agent not found"
}
```

---

### update_skill_experience
Increment a skill's experience counter.

**Emitted by**: Agent

**Request Format**:
```json
{
  "skillId": "uuid",
  "increment": "number (optional, default: 1)"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Experience updated successfully",
  "newExperience": "number"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or skill not found"
}
```

---

### revoke_skill_access
Revoke access to a skill.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "skillId": "uuid",
  "targetAgentId": "agentId"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Access revoked successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or skill not found"
}
```

---

### delete_skill
Delete a skill.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "skillId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Skill deleted successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Access denied or skill not found"
}
```

---

## Orchestration Events

### create_orchestration
Create a new orchestration (task coordination plan).

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "name": "string",
  "agents": ["agent1", "agent2"],
  "tasks": [
    {
      "description": "string",
      "command": "string",
      "targetAgentId": "agentId"
    }
  ],
  "mode": "sequential|parallel"
}
```

**Response**:
```json
{
  "success": true,
  "orchestrationId": "uuid",
  "message": "Orchestration created successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "string (error message)"
}
```

---

### start_orchestration
Execute an orchestration.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "orchestrationId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Orchestration started successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Orchestration not found or already running"
}
```

**Task Distribution**: Tasks are sent to target agents via `exec_task` event.

---

### get_orchestration
Get orchestration details and status.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "orchestrationId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "orchestrationId": "uuid",
    "name": "string",
    "agents": ["agent1", "agent2"],
    "tasks": [
      {
        "description": "string",
        "command": "string",
        "targetAgentId": "agentId",
        "status": "pending|running|completed|failed",
        "result": "string (optional)",
        "startedAt": "timestamp (optional)",
        "completedAt": "timestamp (optional)"
      }
    ],
    "mode": "sequential|parallel",
    "status": "pending|running|completed|cancelled",
    "createdAt": "timestamp",
    "startedAt": "timestamp (optional)"
  }
}
```

---

### list_orchestrations
List all orchestrations.

**Emitted by**: Dashboard

**Request Format**: None

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "orchestrationId": "uuid",
      "name": "string",
      "status": "pending|running|completed|cancelled",
      "taskCount": "number",
      "completedCount": "number",
      "createdAt": "timestamp"
    }
  ]
}
```

---

### cancel_orchestration
Cancel a running orchestration.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "orchestrationId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Orchestration cancelled successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Orchestration not found or not running"
}
```

---

### report_task_result
Report task execution result (emitted by agent).

**Emitted by**: Agent

**Request Format**:
```json
{
  "orchestrationId": "uuid",
  "taskIndex": "number",
  "status": "completed|failed",
  "result": "string (output or error message)"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Task result recorded"
}
```

---

## Configuration Events

### save_agent_config
Save a new agent configuration.

**Emitted by**: Agent or Dashboard

**Request Format**:
```json
{
  "name": "string",
  "data": "object (JSON configuration)"
}
```

**Response**:
```json
{
  "success": true,
  "configId": "uuid",
  "message": "Configuration saved successfully",
  "version": 1
}
```

**Broadcasts to**: `management_data_update`

---

### get_agent_config
Retrieve an agent configuration.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "configId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "configId": "uuid",
    "name": "string",
    "data": "object (JSON configuration)",
    "currentVersion": "number",
    "createdAt": "timestamp",
    "owner": "agentId"
  }
}
```

---

### list_agent_configs
List all agent configurations.

**Emitted by**: Dashboard

**Request Format**: None

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "configId": "uuid",
      "name": "string",
      "currentVersion": "number",
      "versionCount": "number",
      "createdAt": "timestamp",
      "owner": "agentId"
    }
  ]
}
```

---

### update_agent_config
Update an existing configuration (creates new version).

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "configId": "uuid",
  "data": "object (JSON configuration)"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration updated successfully",
  "newVersion": "number"
}
```

---

### clone_agent_config
Clone a configuration.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "configId": "uuid",
  "newName": "string"
}
```

**Response**:
```json
{
  "success": true,
  "newConfigId": "uuid",
  "message": "Configuration cloned successfully"
}
```

---

### revert_agent_config
Revert to a previous version.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "configId": "uuid",
  "toVersion": "number"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Reverted successfully",
  "currentVersion": "number"
}
```

---

### delete_agent_config
Delete a configuration.

**Emitted by**: Dashboard

**Request Format**:
```json
{
  "configId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration deleted successfully"
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| `NOT_FOUND` | Resource not found | The requested object does not exist |
| `ACCESS_DENIED` | Access denied | User lacks permission to access this resource |
| `INVALID_INPUT` | Invalid input | Request format is incorrect or missing required fields |
| `ALREADY_EXISTS` | Resource already exists | Trying to create a duplicate resource |
| `EXPIRED` | Resource expired | TTL has passed for time-based resources |
| `SIZE_LIMIT` | Size limit exceeded | File or data exceeds maximum allowed size |
| `INTERNAL_ERROR` | Internal server error | Unexpected server error |

---

## Connection & Authentication

### Authentication
All socket connections require authentication via `CLAWNET_SECRET_KEY`.

**Connection URL**:
```
wss://<server>?secret=<CLAWNET_SECRET_KEY>
```

**Example**:
```javascript
const io = require('socket.io-client');
const socket = io('wss://clownet-c2c.fly.dev', {
  query: { secret: 'your-secret-key' },
  transports: ['websocket']
});
```

---

## Event Flow Examples

### Sharing a File Between Agents

1. **Agent A** uploads file:
```javascript
socket.emit('upload_file', {
  name: 'data.json',
  data: base64EncodedFile,
  type: 'application/json'
}, (response) => {
  console.log('File ID:', response.fileId);
});
```

2. **Dashboard** shares with Agent B:
```javascript
socket.emit('share_file', {
  fileId: 'uuid',
  targetAgentId: 'agent-b'
}, (response) => {
  console.log(response.message);
});
```

3. **Agent B** downloads file:
```javascript
socket.emit('download_file', {
  fileId: 'uuid'
}, (response) => {
  const fileData = Buffer.from(response.data.data, 'base64');
  console.log('Downloaded:', response.data.name);
});
```

---

### Creating an Orchestration

1. **Dashboard** creates orchestration:
```javascript
socket.emit('create_orchestration', {
  name: 'Data Processing Pipeline',
  agents: ['agent-1', 'agent-2'],
  tasks: [
    {
      description: 'Fetch data from API',
      command: '/fetch-data',
      targetAgentId: 'agent-1'
    },
    {
      description: 'Process data',
      command: '/process-data',
      targetAgentId: 'agent-2'
    }
  ],
  mode: 'sequential'
}, (response) => {
  const orchestrationId = response.orchestrationId;
});
```

2. **Start execution**:
```javascript
socket.emit('start_orchestration', {
  orchestrationId: 'uuid'
}, (response) => {
  console.log('Orchestration started!');
});
```

---

## Best Practices

1. **Error Handling**: Always check `success` field in responses
2. **Access Control**: Implement client-side checks before server calls
3. **Event Listeners**: Listen to `management_data_update` for real-time UI updates
4. **Memory Management**: Implement TTL cleanup for shared memory keys
5. **File Handling**: Always validate file size before upload
6. **Security**: Never log or transmit credential values in plaintext

---

## Version History

- **v3.5.0** (2025-02-16): Added 6 new resource sharing modules
- **v3.4.0**: Base Socket.IO events for fleet and dispatch

---

## See Also

- [Feature Guides](./FEATURE_GUIDES.md) - How-to guides for each feature
- [Architecture](./ARCHITECTURE.md) - System design and module interactions
- [OpenAPI Spec](./openapi.yaml) - REST API endpoints
