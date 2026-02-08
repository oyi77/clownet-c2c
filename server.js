const fastify = require('fastify')({ logger: true });
const path = require('path');
const { Server } = require('socket.io');
const db = require('./database');
const { v4: uuidv4 } = require('uuid');

const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'CLAWNET_SECRET_KEY';

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/',
});

fastify.register(require('@fastify/view'), {
  engine: {
    ejs: require('ejs'),
  },
  root: path.join(__dirname, 'views'),
});

// Auth Middleware
fastify.addHook('preHandler', (request, reply, done) => {
  if (request.url.startsWith('/api') || request.url.startsWith('/dashboard')) {
    // Basic auth or key check can go here
  }
  done();
});

// Dashboard Route
fastify.get('/dashboard', async (request, reply) => {
  const agents = db.prepare('SELECT * FROM agents').all();
  const cronjobs = db.prepare('SELECT * FROM cronjobs').all();
  return reply.view('dashboard.ejs', { agents, cronjobs });
});

// API: Assign Role
fastify.post('/api/agents/:id/role', async (request, reply) => {
  const { id } = request.params;
  const { role } = request.body;
  db.prepare('UPDATE agents SET role = ? WHERE id = ?').run(role, id);
  return { success: true };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    const io = new Server(fastify.server);

    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (token === SECRET_KEY) {
        return next();
      }
      return next(new Error('unauthorized'));
    });

    io.on('connection', (socket) => {
      const agentId = socket.handshake.query.agentId;
      const hostname = socket.handshake.query.hostname;

      console.log(`Agent connected: ${agentId} (${hostname})`);

      db.prepare(`
        INSERT INTO agents (id, hostname, ip, status) 
        VALUES (?, ?, ?, 'online')
        ON CONFLICT(id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, status = 'online'
      `).run(agentId, hostname, socket.handshake.address);

      socket.on('cron_report', (data) => {
        console.log(`Cron report from ${agentId}:`, data);
        db.prepare(`
          INSERT INTO cronjobs (id, agent_id, name, last_run, last_status)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(id) DO UPDATE SET last_run = CURRENT_TIMESTAMP, last_status = EXCLUDED.last_status
        `).run(uuidv4(), agentId, data.name, data.status);
      });

      socket.on('disconnect', () => {
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agentId);
        console.log(`Agent disconnected: ${agentId}`);
      });
    });

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
