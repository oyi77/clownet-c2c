const fs = require('fs');
const path = require('path');

const { createOfflineOutbox } = require('../src/client/offline-outbox');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeTempDir() {
    const dir = path.join(__dirname, '..', 'data-test-offline-outbox-retry');
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function run() {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'outbox.json');

    const outbox = createOfflineOutbox({ filePath, maxItems: 50, maxSendAttempts: 3 });
    outbox.enqueue({
        key: 'task_result:t1',
        event: 'task_result',
        payload: { id: 't1', status: 'SUCCESS', output: 'ok' },
    });

    for (let i = 0; i < 3; i++) {
        await outbox.flush(async () => {
            throw new Error('nope');
        });
    }

    assert(outbox.size() === 0, `Expected entry to be dropped after retries, got size ${outbox.size()}`);
    console.log('✓ offline outbox drops entries after maxSendAttempts');
}

run().catch((err) => {
    console.error(`✗ offline outbox retry failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
