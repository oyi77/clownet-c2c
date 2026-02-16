# ClawNet C2C - Feature Guides

Tutorial-style guides for using ClawNet C2C's advanced features.

## Table of Contents

- [Shared Memory](#shared-memory)
- [Secure Credential Sharing](#secure-credential-sharing)
- [File Sharing](#file-sharing)
- [Skills & Experience](#skills--experience)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
- [Configuration Management](#configuration-management)
- [Management Dashboard](#management-dashboard)

---

## Shared Memory

**Purpose**: Share key-value data between agents with automatic expiration.

### Use Cases

- **Shared State**: Coordinate processing state across agents
- **Caching**: Store computed results for other agents to use
- **Coordination**: Signal completion or status between agents
- **Pub/Sub**: Simple publish-subscribe mechanism via TTL

### Quick Start

#### Setting a Value

From an agent:

```javascript
const io = require('socket.io-client');
const socket = io('wss://clownet-c2c.fly.dev', {
  query: { secret: 'your-secret-key' }
});

socket.on('connect', () => {
  socket.emit('set_shared_memory', {
    key: 'job_status',
    value: { status: 'in_progress', progress: 45 },
    ttl: 3600 // Expire in 1 hour
  }, (response) => {
    console.log(response.message);
    // "Memory set successfully"
  });
});
```

#### Getting a Value

```javascript
socket.emit('get_shared_memory', {
  key: 'job_status'
}, (response) => {
  if (response.success) {
    console.log('Value:', response.data.value);
    // { status: 'in_progress', progress: 45 }
  }
});
```

#### Deleting a Value

```javascript
socket.emit('delete_shared_memory', {
  key: 'job_status'
}, (response) => {
  console.log(response.message);
});
```

### Workflow Example: Job Coordination

**Scenario**: Two agents processing a dataset in parallel, coordinating progress.

**Agent A (Data Fetcher)**:
```javascript
// 1. Signal start
socket.emit('set_shared_memory', {
  key: 'fetch_progress',
  value: { percentage: 0, status: 'started' }
});

// 2. Update progress during processing
socket.emit('set_shared_memory', {
  key: 'fetch_progress',
  value: { percentage: 50, status: 'fetching' }
});

// 3. Mark complete
socket.emit('set_shared_memory', {
  key: 'fetch_progress',
  value: { percentage: 100, status: complete }
});
```

**Agent B (Data Processor)**:
```javascript
// Poll for fetch completion
setInterval(() => {
  socket.emit('get_shared_memory', {
    key: 'fetch_progress'
  }, (response) => {
    const { value } = response.data;
    if (value.status === 'complete') {
      console.log('Ready to process data!');
      clearInterval(interval);
      // Start processing...
    }
  });
}, 5000); // Check every 5 seconds
```

### Best Practices

1. **TTL Management**: Set appropriate TTL to prevent stale data
2. **Key Naming**: Use descriptive keys with prefixes (`agent:`, `job:`, `cache:`)
3. **Error Handling**: Always check `success` field before accessing `data`
4. **Data Size**: Keep values small (<1MB) for performance
5. **Polling**: Use reasonable intervals (1-10 seconds) when polling for changes

---

## Secure Credential Sharing

**Purpose**: Store and share encrypted credentials with fine-grained access control.

### Use Cases

- **API Keys**: Share service API keys securely between agents
- **Database Credentials**: Secure database connection strings
- **Service Tokens**: JWT tokens or OAuth credentials
- **Secrets**: Any sensitive configuration or secrets

### Quick Start

#### Storing Credentials

```javascript
// Store an API key
socket.emit('store_credentials', {
  name: 'OpenAI API Key',
  value: 'sk-...' // Your actual API key
}, (response) => {
  console.log('Credential ID:', response.credentialId);
});

// Store a database connection string
socket.emit('store_credentials', {
  name: 'Database Config',
  value: {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    username: 'user',
    password: 'secret'
  },
  description: 'Production database connection'
});
```

#### Retrieving Credentials

```javascript
socket.emit('get_credentials', {
  credentialId: 'uuid'
}, (response) => {
  if (response.success) {
    const credentials = response.data.value;

    // Use credentials
    if (typeof credentials === 'object' && credentials.host) {
      // It's a database config
      const db = new Database(
        `postgres://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`
      );
    } else {
      // It's an API key
      const api = new Api(response.data.value);
    }
  }
});
```

#### Sharing with Another Agent

```javascript
socket.emit('share_credentials', {
  credentialId: 'uuid',
  targetAgentId: 'agent-2'
}, (response) => {
  console.log('Shared with agent-2:', response.message);
});
```

### Workflow Example: API Access Distribution

**Scenario**: Main agent has an expensive API key, needs to share with worker agents.

**Main Agent (Credential Owner)**:
```javascript
// 1. Store the API key
socket.emit('store_credentials', {
  name: 'Premium API Key',
  value: 'sk-proj-xyz123',
  description: 'Shared API key for all agents'
}, (response) => {
  const credentialId = response.credentialId;

  // 2. List available agents to share with
  socket.emit('list_agents', (agentsResponse) => {
    const workerAgents = agentsResponse.data.filter(
      agent => agent.role === 'worker'
    );

    // 3. Share with all worker agents
    workerAgents.forEach(worker => {
      socket.emit('share_credentials', {
        credentialId,
        targetAgentId: worker.agentId
      });
    });
  });
});
```

**Worker Agent**:
```javascript
// Access the shared credential
socket.emit('list_credentials', (response) => {
  const sharedCreds = response.data.find(
    cred => cred.name === 'Premium API Key'
  );

  socket.emit('get_credentials', {
    credentialId: sharedCreds.credentialId
  }, (credResponse) => {
    const apiKey = credResponse.data.value;
    console.log('Can now use premium API:', apiKey);
  });
});
```

### Security Best Practices

1. **Never Log Plaintext**: Never log credential values in terminal or logs
2. **Access Control**: Only share with agents that explicitly need access
3. **Revoke After Use**: Revoke access when agent no longer needs credentials
4. **Environment Variable Alternative**: For static credentials, consider env vars instead
5. **Audit Trail**: Monitor who accesses which credentials (future feature)

---

## File Sharing

**Purpose**: Upload, download, and share files between agents with access control.

### Use Cases

- **Data Transfer**: Transfer datasets between agents
- **Model Sharing**: Share trained ML models
- **Code Exchange**: Share code snippets or scripts
- **Configuration Files**: Share configuration templates

### Quick Start

#### Uploading a File

```javascript
const fs = require('fs');

// Read file and convert to base64
const fileBuffer = fs.readFileSync('./mydata.json');
const fileBase64 = fileBuffer.toString('base64');

socket.emit('upload_file', {
  name: 'mydata.json',
  data: fileBase64,
  type: 'application/json'
}, (response) => {
  console.log('File ID:', response.fileId);
  console.log('Size:', response.size, 'bytes');
});
```

#### Downloading a File

```javascript
socket.emit('download_file', {
  fileId: 'uuid'
}, (response) => {
  if (response.success) {
    const fileData = Buffer.from(response.data.data, 'base64');

    // Save to disk
    fs.writeFileSync(response.data.name, fileData);
    console.log('Downloaded:', response.data.name);
  }
});
```

#### Sharing a File

```javascript
socket.emit('share_file', {
  fileId: 'uuid',
  targetAgentId: 'agent-2'
}, (response) => {
  console.log('File shared:', response.message);
});
```

### Workflow Example: ML Model Distribution

**Scenario**: Trainer agent produces a model, shares with inference agents.

**Trainer Agent**:
```javascript
const fs = require('fs');

// 1. Upload the trained model (e.g., model.pkl)
const modelBuffer = fs.readFileSync('./models/model.pkl');

socket.emit('upload_file', {
  name: 'model-v2.pkl',
  data: modelBuffer.toString('base64'),
  type: 'application/octet-stream'
}, (response) => {
  const fileId = response.fileId;

  // 2. Share with all inference agents
  socket.emit('list_agents', (agents) => {
    agents.data
      .filter(a => a.role === 'inference')
      .forEach(agent => {
        socket.emit('share_file', {
          fileId,
          targetAgentId: agent.agentId
        });
      });
  });
});
```

**Inference Agent**:
```javascript
// 1. List available files
socket.emit('list_files', (response) => {
  const modelFile = response.data.find(f => f.name === 'model-v2.pkl');

  // 2. Download the model
  socket.emit('download_file', {
    fileId: modelFile.fileId
  }, (fileResponse) => {
    const modelData = Buffer.from(fileResponse.data.data, 'base64');
    fs.writeFileSync('./downloaded-model.pkl', modelData);

    // 3. Load and use the model
    const model = loadModel('./downloaded-model.pkl');
    console.log('Model loaded, ready for inference!');
  });
});
```

### Best Practices

1. **File Size Limits**: Max 10MB per file, compress large files before upload
2. **Base64 Overhead**: Base64 adds ~33% overhead, account for bandwidth
3. **Access Control**: Use share/revoke to control file access
4. **Clean Up**: Delete files after use to save storage
5. **Validation**: Validate file integrity after download (checksum)

---

## Skills & Experience

**Purpose**: Register agent capabilities, track experience, and share skills across fleet.

### Use Cases

- **Capability Discovery**: Find which agents have which skills
- **Experience Tracking**: Track how much experience agents have
- **Skill Sharing**: Teach new agents existing skills
- **Resource Matching**: Route tasks to agents with relevant skills

### Quick Start

#### Registering a Skill

```javascript
socket.emit('register_skill', {
  name: 'Natural Language Processing',
  description: 'Can perform text classification and sentiment analysis'
}, (response) => {
  console.log('Skill ID:', response.skillId);
});
```

#### Incrementing Experience

```javascript
// Agent completed a successful NLP task
socket.emit('update_skill_experience', {
  skillId: 'uuid',
  increment: 1 // Default is 1
}, (response) => {
  console.log('New experience level:', response.newExperience);
});
```

#### Listing Skills

```javascript
socket.emit('list_skills', (response) => {
  response.data.forEach(skill => {
    console.log(`${skill.name}: ${skill.experience} exp`);
  });
});
```

#### Sharing a Skill

```javascript
socket.emit('share_skill', {
  skillId: 'uuid',
  targetAgentId: 'agent-2'
}, (response) => {
  console.log('Skill shared:', response.message);
});
```

### Workflow Example: Task Routing Based on Skills

**Scenario**: Incoming task, route to agent with most relevant skills.

**Task Scheduler**:
```javascript
// 1. List all agents and their skills
socket.emit('list_skills', (skills) => {
  const nlpAgents = skills.data.filter(
    s => s.name === 'Natural Language Processing'
  );

  // 2. Find agent with most experience
  const bestAgent = nlpAgents.sort((a, b) =>
    b.experience - a.experience
  )[0];

  console.log(`Routing task to ${bestAgent.owner} with ${bestAgent.experience} exp`);

  // 3. Dispatch task
  socket.emit('dispatch_task', {
    targetAgentId: bestAgent.owner,
    task: {
      type: 'nlp_classify',
      input: 'This is amazing!'
    }
  });
});
```

### Best Practices

1. **Meaningful Descriptions**: Clearly describe what the skill can do
2. **Experience Tracking**: Increment after successful task completion
3. **Skill Granularity**: Balance specificity vs generality (too specific vs too broad)
4. **Regular Updates**: Add new skills as agents learn capabilities
5. **Experience Decay**: Consider implementing experience decay for inactive skills (future)

---

## Multi-Agent Orchestration

**Purpose**: Coordinate complex workflows across multiple agents with task dependencies.

### Use Cases

- **Data Pipelines**: Multi-stage data processing workflows
- **Testing Workflows**: Run tests, lint, build stages in sequence
- **Deployment Pipelines**: Deploy to staging, run tests, deploy to production
- **Batch Processing**: Distribute batch jobs across multiple agents

### Quick Start

#### Creating an Orchestration

From the Management Dashboard UI:

1. Navigate to **MANAGEMENT** tab
2. Click **+ CREATE NEW** under **Orchestrations**
3. Fill in:
   - **Name**: Data Processing Pipeline
   - **Agents**: agent-1, agent-2, agent-3 (comma-separated)
   - **Mode**: Sequential or Parallel
4. Add tasks (click **+ Add Task**):
   - Task 1: Fetch data → /fetch-data → agent-1
   - Task 2: Process data → /process-data → agent-2
   - Task 3: Save results → /save-results → agent-3
5. Click **Create Orchestration**

#### Starting an Orchestration

```javascript
socket.emit('start_orchestration', {
  orchestrationId: 'uuid'
}, (response) => {
  if (response.success) {
    console.log('Orchestration started!');

    // Listen for updates
    socket.on('management_data_update', (update) => {
      if (update.type === 'orchestration_updated') {
        console.log('Orchestration update:', update.data);
      }
    });
  }
});
```

#### Viewing Results

```javascript
socket.emit('get_orchestration', {
  orchestrationId: 'uuid'
}, (response) => {
  const { status, tasks } = response.data;

  console.log(`Overall status: ${status}`);
  tasks.forEach((task, index) => {
    console.log(`Task ${index + 1}: ${task.status} - ${task.description}`);
    if (task.result) {
      console.log(`  Result: ${task.result}`);
    }
  });
});
```

### Workflow Example: ETL Pipeline

**Scenario**: Extract-Transform-Load pipeline with 3 agents.

**Dashboard (Create Orchestration)**:
```
Name: ETL Pipeline
Agents: extractor, transformer, loader
Mode: Sequential

Tasks:
1. Description: Extract data from source
   Command: /extract-source
   Target: extractor

2. Description: Transform and clean data
   Command: /transform-data
   Target: transformer

3. Description: Load into database
   Command: /load-database
   Target: loader
```

**Execution Flow**:

1. **Extracter Agent** receives `exec_task`:
```javascript
socket.on('exec_task', (task) => {
  console.log('Received task:', task.command);

  // Execute extraction
  const result = extractFromSource();

  // Report completion
  socket.emit('report_task_result', {
    orchestrationId: task.orchestrationId,
    taskIndex: task.taskIndex,
    status: 'completed',
    result: 'Extracted 1000 records'
  });
});
```

2. **Transformer Agent** receives next task (only after extractor completes in sequential mode)

3. **Loader Agent** receives final task

**Dashboard**:
```javascript
// Periodically check status
setInterval(() => {
  socket.emit('get_orchestration', {
    orchestrationId: 'uuid'
  }, (response) => {
    const { status, tasks } = response.data;
    console.log('Status:', status);

    if (status === 'completed') {
      console.log('Pipeline finished!');
    }
  });
}, 5000);
```

### Modes

**Sequential**: Tasks execute one after another. A task starts only after previous completes.

**Parallel**: All tasks execute simultaneously. Order depends on agent availability.

### Best Practices

1. **Task granularity**: Break complex workflows into small, testable tasks
2. **Error handling**: Agents should report task failures gracefully
3. **Timeout consideration**: Set reasonable timeouts for long-running tasks
4. **Agent availability**: Ensure target agents are connected before starting
5. **Logging**: Detailed task results help with debugging failures

---

## Configuration Management

**Purpose**: Store, version, and manage agent configurations with rollbacks.

### Use Cases

- **Profile Management**: Save different configuration profiles
- **A/B Testing**: Switch between configurations for testing
- **Backup & Restore**: Save working configurations before changes
- **Rollback**: Revert to previous versions if configuration breaks

### Quick Start

#### Saving a Configuration

From the Management Dashboard UI:

1. Navigate to **MANAGEMENT** tab
2. Click **+ CREATE NEW** under **Agent Configurations**
3. Fill in:
   - **Configuration Name**: production-config-v1
   - **JSON Data**:
     ```json
     {
       "timeout": 30000,
       "retryAttempts": 3,
       "logLevel": "info",
       "apiEndpoint": "https://api.example.com"
     }
     ```
4. The textarea shows **✓ Valid JSON** or **✗ Invalid JSON** with error details
5. Click **Save Configuration**

#### Loading a Configuration

```javascript
socket.emit('get_agent_config', {
  configId: 'uuid'
}, (response) => {
  const config = response.data.data;

  // Apply configuration
  applyConfig(config);
});
```

#### Creating a Version (Update)

```javascript
socket.emit('update_agent_config', {
  configId: 'uuid',
  data: {
    timeout: 60000, // Updated from 30000
    retryAttempts: 3,
    logLevel: 'debug', // Updated from 'info'
    apiEndpoint: 'https://api.example.com'
  }
}, (response) => {
  console.log('New version:', response.newVersion);
  // Version 2 created
});
```

#### Reverting to Previous Version

```javascript
socket.emit('revert_agent_config', {
  configId: 'uuid',
  toVersion: 1 // Revert to first version
}, (response) => {
  console.log('Reverted to version', response.currentVersion);
});
```

### Workflow Example: Configuration Drift Fix

**Scenario**: Agent has buggy configuration, need to fix and rollback.

**Initial State** (Version 1):
```json
{
  "timeout": 30000,
  "retryAttempts": 3,
  "logLevel": "info"
}
```

**Attempt Fix** (Version 2 - introduces bug):
```json
{
  "timeout": 5000, // Too short!
  "retryAttempts": 10,
  "logLevel": "debug"
}
```

**Agent fails** → Detect issue:

```javascript
// Load version 1 (working configuration)
socket.emit('revert_agent_config', {
  configId: 'uuid',
  toVersion: 1
}, (response) => {
  console.log('Reverted to working config');

  // Apply correct version again
  socket.emit('get_agent_config', {
    configId: 'uuid'
  }, (response) => {
    const config = response.data.data;
    applyConfig(config);
  });
});
```

**Correct Fix** (Version 3):
```json
{
  "timeout": 45000, // Correct value
  "retryAttempts": 5,
  "logLevel": "debug"
}
```

### Cloning a Configuration

```javascript
socket.emit('clone_agent_config', {
  configId: 'uuid',
  newName: 'staging-config-v1'
}, (response) => {
  const newConfigId = response.newConfigId;
  console.log('Cloned as:', response.message);
});
```

### Best Practices

1. **Version Comments**: Document changes in config description or external notes
2. **Testing Configs**: Create separate configs for testing/staging/production
3. **Regular Backups**: Save configurations before major changes
4. **Validation**: Validate JSON before saving (UI does this automatically)
5. **Atomic Updates**: Load configs atomically to avoid partial application

---

## Management Dashboard

**Purpose**: Unified web UI for managing all agents and shared resources.

### Accessing the Dashboard

Open: https://clownet-c2c.fly.dev/dashboard

Requires: `CLAWNET_SECRET_KEY` environment variable set on server.

### Sections

#### 1. Operations Tab
- **Fleet**: View connected agents, run commands, view logs
- **Chatroom**: Send messages to agents, view responses
- **Active Sessions**: View ongoing command sessions

#### 2. Chat Room Tab
- **Direct Messages**: Chat with individual agents
- **Group Chat**: Join/join rooms (#general, #devops, etc.)
- **Broadcast**: Send messages to all agents

#### 3. Management Tab
- **🔄 Orchestrations**: Create, start, view, cancel multi-agent workflows
- **🔌 Active Sessions**: View and manage command sessions
- **🔗 Shared Resources**:
  - Shared Memory: View/delete keys
  - Credentials: Store, share, revoke access
  - Files: Upload, download, share, delete
  - Skills: Register, view experience, share
- **🛠️ Agent Configurations**: Save, clone, revert, apply configs

### Real-Time Updates

The dashboard receives real-time updates via `management_data_update` event:

```javascript
socket.on('management_data_update', (update) => {
  console.log('Update type:', update.type);

  switch (update.type) {
    case 'memory_updated':
      updateMemoryTable(update.data);
      break;

    case 'credentials_updated':
      updateCredentialsTable(update.data);
      break;

    case 'files_updated':
      updateFilesTable(update.data);
      break;

    case 'skills_updated':
      updateSkillsTable(update.data);
      break;

    case 'orchestrations_updated':
      updateOrchestrationsTable(update.data);
      break;

    case 'configs_updated':
      updateConfigsTable(update.data);
      break;
  }
});
```

### Best Practices

1. **Refresh Periodically**: Click REFRESH to get latest data
2. **Modals**: Click MANAGE buttons to view details or perform actions
3. **Validation**: All forms include validation (JSON configs, required fields)
4. **Notifications**: Toast messages confirm actions (save, delete, start, etc.)
5. **Real-time**: Dashboard updates automatically when agents make changes

---

## Troubleshooting

### Connection Issues

**Problem**: Dashboard shows "Socket disconnected"

**Solution**:
- Verify server is running: `npm start`
- Check `CLAWNET_SECRET_KEY` is set correctly
- Check browser console for connection errors
- Verify port (default: 3000)

### Agent Not Responding

**Problem**: Agent doesn't respond to messages or commands

**Solution**:
- Verify agent is connected: Check Fleet tab
- Check agent logs for errors: Click MANAGE on agent
- Verify secret key matches server
- Restart agent if needed

### File Upload Fails

**Problem**: "Size limit exceeded" error

**Solution**:
- Compress file before upload (max 10MB)
- Split large files into chunks
- Consider using external storage for large files

### Configuration Not Applied

**Problem**: Saved config but agent not using it

**Solution**:
- Verify JSON syntax (check ✓ Valid JSON indicator)
- Check config was loaded by agent
- Restart agent to apply config
- Check agent logs for config errors

---

## See Also

- [Socket Events API](./SOCKET_EVENTS.md) - Complete API reference
- [Architecture](./ARCHITECTURE.md) - System design and internals
- [Testing Report](./TESTING_REPORT.md) - Implementation and testing checklist
