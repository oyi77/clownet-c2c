/**
 * Role Registry Module
 * Manages agent roles and role-based task assignments
 */

const state = require('../state.js');
const { v4: generateId } = require('uuid');

function register(io, socket, ctx) {
  const { tenantId } = ctx;
  const tenantState = state.getTenantState(tenantId);
  
  // Register role
  socket.on('create_role', (payload, callback) => {
    const { name, description } = payload;
    
    if (!name) {
      return callback({ success: false, error: 'Role name is required' });
    }
    
    const roleId = generateId();
    tenantState.roles[roleId] = {
      roleId,
      name,
      description: description || '',
      createdAt: Date.now()
    };
    
    socket.to(`tenant:${tenantId}`).emit('roles_updated', {});
    
    callback({
      success: true,
      roleId,
      message: 'Role created successfully'
    });
  });
  
  // List roles
  socket.on('list_roles', (callback) => {
    callback({
      success: true,
      data: Object.values(tenantState.roles)
    });
  });
  
  // Delete role
  socket.on('delete_role', (payload, callback) => {
    const { roleId } = payload;
    
    if (!tenantState.roles[roleId]) {
      return callback({ success: false, error: 'Role not found' });
    }
    
    delete tenantState.roles[roleId];
    
    // Remove role from all agents
    Object.keys(tenantState.agentRoles).forEach(agentId => {
      const index = tenantState.agentRoles[agentId].indexOf(roleId);
      if (index > -1) {
        tenantState.agentRoles[agentId].splice(index, 1);
      }
    });
    
    socket.to(`tenant:${tenantId}`).emit('roles_updated', {});
    
    callback({ success: true, message: 'Role deleted successfully' });
  });
  
  // Assign role to agent
  socket.on('assign_role_to_agent', (payload, callback) => {
    const { agentId, roleId } = payload;
    
    if (!tenantState.roles[roleId]) {
      return callback({ success: false, error: 'Role not found' });
    }
    
    if (!tenantState.agents[agentId]) {
      return callback({ success: false, error: 'Agent not found or not connected' });
    }
    
    if (!tenantState.agentRoles[agentId]) {
      tenantState.agentRoles[agentId] = [];
    }
    
    if (!tenantState.agentRoles[agentId].includes(roleId)) {
      tenantState.agentRoles[agentId].push(roleId);
    }
    
    socket.to(`tenant:${socket.tenantId}`).emit('agent_roles_updated', { agentId });
    
    callback({ success: true, message: 'Role assigned successfully' });
  });
  
  // Remove role from agent
  socket.on('remove_role_from_agent', (payload, callback) => {
    const { agentId, roleId } = payload;
    
    if (!tenantState.agentRoles[agentId]) {
      return callback({ success: true, message: 'No roles to remove' });
    }
    
    const index = tenantState.agentRoles[agentId].indexOf(roleId);
    if (index > -1) {
      tenantState.agentRoles[agentId].splice(index, 1);
    }
    
    socket.to(`tenant:${socket.tenantId}`).emit('agent_roles_updated', { agentId });
    
    callback({ success: true, message: 'Role removed successfully' });
  });
  
  // Get agent roles
  socket.on('get_agent_roles', (payload, callback) => {
    const { agentId } = payload;
    
    const roleIds = tenantState.agentRoles[agentId] || [];
    const roles = roleIds.map(roleId => tenantState.roles[roleId]).filter(r => r);
    
    callback({
      success: true,
      data: {
        agentId,
        roles,
        roleIds
      }
    });
  });
  
  // Get agents by role
  socket.on('get_agents_by_role', (payload, callback) => {
    const { roleId } = payload;
    
    const agents = state.getAgentsByRole(socket.tenantId, roleId);
    const agentDetails = agents.map(agentId => ({
      agentId,
      ...tenantState.agents[agentId]
    }));
    
    callback({
      success: true,
      data: agentDetails
    });
  });
};

module.exports = { register };
