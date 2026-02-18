const http = require('http');

function createHealthServer({ port, host = '127.0.0.1', getSnapshot } = {}) {
    if (!Number.isFinite(port)) throw new Error('port is required');
    if (typeof getSnapshot !== 'function') throw new Error('getSnapshot is required');

    let server = null;

    function handler(req, res) {
        if (req.url === '/health') {
            const snapshot = getSnapshot();
            const body = JSON.stringify(snapshot);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            });
            res.end(body);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }

    async function start() {
        if (server) return;
        server = http.createServer(handler);
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, host, resolve);
        });
    }

    async function stop() {
        if (!server) return;
        const s = server;
        server = null;
        await new Promise((resolve) => s.close(resolve));
    }

    function address() {
        if (!server) return null;
        return server.address();
    }

    return { start, stop, address };
}

module.exports = { createHealthServer };
