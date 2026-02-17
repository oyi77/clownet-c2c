/**
 * Auto Orchestration Module
 * Role-based task assignment and load balancing
 */

const state = require('../state.js');
const { v4: generateId } = require('uuid');

function register(io, socket, ctx) {
  const { tenantId } = ctx;
  const tenantState = state.getTenantState(tenantId);
  
  const loadBalancers = {
    'round-robin': (agents, roleId) => {
      if (!tenantState.loadBalancers[roleId]) {
        tenantState.loadBalancers[roleId] = { index: 0 };
      }
      const balancer = tenantState.loadBalancers[roleId];
      
      if (agents.length === 0) return null;
      
      const selected = agents[balancer.index];
      balancer.index = (balancer.index + 1) % agents.length;
      return selected;
    },
    
    'least-loaded': (agents) => {
      let leastLoaded = null;
      let minTasks = Infinity;
      
      for (const agentId of agents) {
        let activeTasks = 0;
        Object.values(tenantState.autoOrchestrations).forEach(orch => {
          orch.tasks.forEach(task => {
            if (task.status === 'running' && task.assignedAgentId === agentId) {
              activeTasks++;
            }
          });
        });
        
        if (activeTasks < minTasks) {
          minTasks = activeTasks;
          leastLoaded = agentId;
        }
      }
      
      return leastLoaded;
    },
    
    'random': (agents) => {
      if (agents.length === 0) return null;
      return agents[Math.floor(Math.random() * agents.length)];
    }
  };
  
  function assignTasksToAgents(orchestrationId) {
    const orchestration = tenantState.autoOrchestrations[orchestrationId];
    
    if (!orchestration || orchestration.status !== 'pending') {
      return;
    }
    
    orchestration.status = 'running';
    orchestration.startedAt = Date.now();
    
    orchestration.tasks.forEach(task => {
      if (task.status !== 'pending') return;
      
      const requiredRoles = task.requiredRoles || ['default'];
      let availableAgents = [];
      
      for (const roleId of requiredRoles) {
        const agentsForRole = state.getAgentsByRole(tenantId, roleId);
        availableAgents = [...availableAgents, ...agentsForRole];
      }
      
      availableAgents = [...new Set(availableAgents)];
      
      if (availableAgents.length === 0) {
        task.status = 'failed';
        task.result = 'No agents available with required roles';
        task.completedAt = Date.now();
        return;
      }
      
      const agentId = loadBalancers[orchestration.loadBalanceStrategy](
        availableAgents,
        requiredRoles[0]
      );
      
      if (!agentId) {
        task.status = 'failed';
        task.result = 'Load balancer failed to select agent';
        task.completedAt = Date.now();
        return;
      }
      
      task.status = 'running';
      task.assignedAgentId = agentId;
      task.startedAt = Date.now();
      
      io.to(`tenant:${socket.tenantId}`).emit('exec_task', {
        orchestrationId,
        taskId: task.taskId,
        description: task.description,
        command: task.command,
        agentId
      });
    });
    
    socket.to(`tenant:${tenantId}`).emit('auto_orchestrations_updated', {});
  }
  
  socket.on('create_auto_orchestration', (payload, callback) => {
    const { 
      name, 
      tasks, 
      loadBalanceStrategy = 'round-robin',
      maxAgentsPerRole = null
    } = payload;
    
    if (!name || !tasks || tasks.length === 0) {
      return callback({ success: false, error: 'Name and tasks are required' });
    }
    
    const orchestrationId = generateId();
    
    tenantState.autoOrchestrations[orchestrationId] = {
      orchestrationId,
      name,
      tasks: tasks.map(task => ({
        taskId: generateId(),
        ...task,
        status: 'pending',
        assignedAgentId: null,
        result: null,
        startedAt: null,
        completedAt: null,
        retryCount: 0
      })),
      loadBalanceStrategy,
      maxAgentsPerRole,
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    };
    
    socket.to(`tenant:${tenantId}`).emit('auto_orchestrations_updated', {});
    
    callback({
      success: true,
      orchestrationId,
      message: 'Auto orchestration created successfully'
    });
  });
  
  socket.on('start_auto_orchestration', async (payload, callback) => {
    const { orchestrationId } = payload;
    
    const orchestration = tenantState.autoOrchestrations[orchestrationId];
    
    if (!orchestration) {
      return callback({ success: false, error: 'Orchestration not found' });
    }
    
    if (orchestration.status !== 'pending') {
      return callback({ success: false, error: 'Orchestration already started' });
    }
    
    assignTasksToAgents(orchestrationId);
    
    callback({
      success: true,
      message: 'Auto orchestration started successfully'
    });
  });
  
  socket.on('report_auto_task_result', async (payload, callback) => {
    const { orchestrationId, taskId, status, result } = payload;
    
    const orchestration = tenantState.autoOrchestrations[orchestrationId];
    
    if (!orchestration) {
      return callback({ success: false, error: 'Orchestration not found' });
    }
    
    const task = orchestration.tasks.find(t => t.taskId === taskId);
    
    if (!task) {
      return callback({ success: false, error: 'Task not found' });
    }
    
    task.status = status;
    task.result = result;
    task.completedAt = Date.now();
    
    const allDone = orchestration.tasks.every(t => 
      t.status === 'completed' || t.status === 'failed'
    );
    
    if (allDone) {
      orchestration.status = allDone && orchestration.tasks.every(t => t.status === 'completed') ? 'completed' : 'completed';
      orchestration.completedAt = Date.now();
    }
    
    socket.to(`tenant:${tenantId}`).emit('auto_orchestrations_updated', {});
    
    callback({ success: true, message: 'Task result recorded' });
  });
  
  socket.on('list_auto_orchestrations', (callback) => {
    callback({
      success: true,
      data: Object.values(tenantState.autoOrchestrations)
    });
  });
  
  socket.on('get_auto_orchestration', (payload, callback) => {
    const { orchestrationId } = payload;
    const orchestration = tenantState.autoOrchestrations[orchestrationId];
    
    if (!orchestration) {
      return callback({ success: false, error: 'Orchestration not found' });
    }
    
    callback({
      success: true,
      data: orchestration
    });
  });
  
  socket.on('cancel_auto_orchestration', async (payload, callback) => {
    const { orchestrationId } = payload;
    
    const orchestration = tenantState.autoOrchestrations[orchestrationId];
    
    if (!orchestration) {
      return callback({ success: false, error: 'Orchestration not found' });
    }
    
    orchestration.status = 'cancelled';
    orchestration.completedAt = Date.now();
    
    orchestration.tasks.forEach(task => {
      if (task.status === 'running' || task.status === 'pending') {
        task.status = 'failed';
        task.result = 'Orchestration cancelled';
        task.completedAt = Date.now();
      }
    });
    
    socket.to(`tenant:${tenantId}`).emit('auto_orchestrations_updated', {});
    
    callback({ success: true, message: 'Orchestration cancelled successfully' });
  });
}

module.exports = { register };
