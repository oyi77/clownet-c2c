const fs = require('fs');
const path = require('path');

const { createOfflineOutbox } = require('../src/client/offline-outbox');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeTempDir() {
    const dir = path.join(__dirname, '..', 'data-test-offline-outbox');
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function run() {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'outbox.json');

    const outbox = createOfflineOutbox({ filePath, maxItems: 50 });

    outbox.enqueue({
        key: 'chat:c1',
        event: 'chat',
        payload: { to: 'all', msg: 'hello', localId: 'c1' },
    });

    outbox.enqueue({
        key: 'task_result:t1',
        event: 'task_result',
        payload: { id: 't1', status: 'SUCCESS', output: 'ok' },
    });

    outbox.enqueue({
        key: 'task_result:t1',
        event: 'task_result',
        payload: { id: 't1', status: 'SUCCESS', output: 'ok2' },
    });

    assert(outbox.size() === 2, `Expected 2 items, got ${outbox.size()}`);

    const outbox2 = createOfflineOutbox({ filePath, maxItems: 50 });
    assert(outbox2.size() === 2, `Expected 2 persisted items, got ${outbox2.size()}`);

    const sent = [];
    const result = await outbox2.flush(async (entry) => {
        sent.push({ event: entry.event, payload: entry.payload });
        return { ok: true };
    });

    assert(result.sent === 2, `Expected sent 2, got ${result.sent}`);
    assert(outbox2.size() === 0, `Expected empty outbox, got ${outbox2.size()}`);
    assert(sent.length === 2, `Expected 2 send calls, got ${sent.length}`);
    assert(sent[1].payload.output === 'ok2', 'Expected overwritten payload to be sent');

    console.log('✓ offline outbox persists, dedupes, and flushes');
}

run().catch((err) => {
    console.error(`✗ offline outbox failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
