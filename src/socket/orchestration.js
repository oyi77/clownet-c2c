const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('create_orchestration', (payload) => {
        if (!payload || !payload.name || !payload.agents || !payload.tasks) return;
        
        const orchId = `orch-${Date.now()}-${payload.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        
        const entry = {
            id: orchId,
            name: payload.name,
            agents: Array.isArray(payload.agents) ? payload.agents : [payload.agents],
            tasks: payload.tasks,
            status: 'created',
            owner: agent_id,
            timestamp: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            results: {}
        };
        
        s.orchestrations[orchId] = entry;
        logEvent(`Orchestration created: ${payload.name} by ${agent_id}`);
        
        entry.agents.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('orchestration_created', {
                    orchId: orchId,
                    name: payload.name,
                    owner: agent_id,
                    timestamp: entry.timestamp
                });
            }
        });
    });

    socket.on('start_orchestration', (payload) => {
        if (!payload || !payload.orchId) return;
        
        const entry = s.orchestrations[payload.orchId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        entry.status = 'running';
        entry.startedAt = new Date().toISOString();
        entry.results = {};
        
        logEvent(`Orchestration started: ${entry.name} by ${agent_id}`);
        
        entry.agents.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('orchestration_started', {
                    orchId: payload.orchId,
                    name: entry.name,
                    tasks: entry.tasks,
                    timestamp: entry.startedAt
                });
            }
        });
        
        executeOrchestrationTasks(io, s, entry, 0);
    });

    socket.on('get_orchestration', (payload, callback) => {
        if (!payload || !payload.orchId) {
            if (callback) callback({ error: 'Orchestration ID required' });
            return;
        }
        
        const entry = s.orchestrations[payload.orchId];
        if (!entry) {
            if (callback) callback({ error: 'Orchestration not found' });
            return;
        }
        
        if (entry.owner !== agent_id && !entry.agents.includes(agent_id) && agent_id !== 'master-ui') {
            if (callback) callback({ error: 'Access denied' });
            return;
        }
        
        if (callback) {
            callback({
                orchId: payload.orchId,
                name: entry.name,
                agents: entry.agents,
                tasks: entry.tasks,
                status: entry.status,
                owner: entry.owner,
                timestamp: entry.timestamp,
                startedAt: entry.startedAt,
                completedAt: entry.completedAt,
                results: entry.results
            });
        }
    });

    socket.on('list_orchestrations', (payload, callback) => {
        const available = Object.keys(s.orchestrations)
            .filter(orchId => {
                const entry = s.orchestrations[orchId];
                return entry.owner === agent_id || 
                       entry.agents.includes(agent_id) || 
                       agent_id === 'master-ui';
            })
            .map(orchId => {
                const entry = s.orchestrations[orchId];
                return {
                    orchId: orchId,
                    name: entry.name,
                    agents: entry.agents,
                    status: entry.status,
                    owner: entry.owner,
                    timestamp: entry.timestamp,
                    startedAt: entry.startedAt,
                    completedAt: entry.completedAt
                };
            });
        
        if (callback) {
            callback({ orchestrations: available });
        }
    });

    socket.on('cancel_orchestration', (payload) => {
        if (!payload || !payload.orchId) return;
        
        const entry = s.orchestrations[payload.orchId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        entry.status = 'cancelled';
        entry.completedAt = new Date().toISOString();
        
        logEvent(`Orchestration cancelled: ${entry.name} by ${agent_id}`);
        
        entry.agents.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('orchestration_cancelled', {
                    orchId: payload.orchId,
                    name: entry.name,
                    cancelledBy: agent_id,
                    timestamp: entry.completedAt
                });
            }
        });
    });

    socket.on('report_task_result', (payload) => {
        if (!payload || !payload.orchId || payload.taskIndex === undefined || payload.taskIndex === null || payload.result === undefined) return;
        
        const entry = s.orchestrations[payload.orchId];
        if (!entry) return;
        
        if (!entry.agents.includes(agent_id)) return;
        
        if (!entry.results[payload.taskIndex]) {
            entry.results[payload.taskIndex] = [];
        }
        entry.results[payload.taskIndex].push({
            agentId: agent_id,
            result: payload.result,
            timestamp: new Date().toISOString()
        });
        
        logEvent(`Task result reported: orchestration ${entry.name} task ${payload.taskIndex} by ${agent_id}`);
        
        if (entry.status === 'running') {
            checkAndExecuteNextTask(io, s, entry, payload.taskIndex);
        }
    });
}

function executeOrchestrationTasks(io, s, orchestration, taskIndex) {
    if (taskIndex >= orchestration.tasks.length) {
        orchestration.status = 'completed';
        orchestration.completedAt = new Date().toISOString();
        
        orchestration.agents.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('orchestration_completed', {
                    orchId: orchestration.id,
                    name: orchestration.name,
                    results: orchestration.results,
                    timestamp: orchestration.completedAt
                });
            }
        });
        
        logEvent(`Orchestration completed: ${orchestration.name}`);
        return;
    }
    
    const task = orchestration.tasks[taskIndex];
    
    if (task.target) {
        const agent = s.agents[task.target];
        if (agent && agent.sid) {
            io.to(agent.sid).emit('orchestration_task', {
                orchId: orchestration.id,
                taskIndex: taskIndex,
                task: task,
                timestamp: new Date().toISOString()
            });
        }
    } else {
        orchestration.agents.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('orchestration_task', {
                    orchId: orchestration.id,
                    taskIndex: taskIndex,
                    task: task,
                    timestamp: new Date().toISOString()
                });
            }
        });
    }
}

function checkAndExecuteNextTask(io, s, orchestration, completedTaskIndex) {
    const task = orchestration.tasks[completedTaskIndex];
    const resultsForTask = orchestration.results[completedTaskIndex] || [];
    const requiredResults = task.parallel ? orchestration.agents.length : 1;
    
    if (resultsForTask.length >= requiredResults) {
        executeOrchestrationTasks(io, s, orchestration, completedTaskIndex + 1);
    }
}

module.exports = { register };
