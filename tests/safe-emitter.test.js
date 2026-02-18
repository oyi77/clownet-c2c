const { EventEmitter } = require('events');

const { wrapEmitter } = require('../src/client/safe-emitter');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function run() {
    const emitter = new EventEmitter();
    const errors = [];

    wrapEmitter(emitter, {
        onError: (payload) => errors.push(payload),
    });

    emitter.on('boom', () => {
        throw new Error('boom');
    });

    emitter.emit('boom');

    emitter.on('boom_async', async () => {
        throw new Error('boom_async');
    });
    emitter.emit('boom_async');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(errors.length === 2, 'Expected exactly two error reports');
    assert(errors[0].event === 'boom', 'Expected error report to include event name');
    assert(typeof errors[0].message === 'string' && errors[0].message.includes('boom'), 'Expected error report to include message');
    assert(errors[1].event === 'boom_async', 'Expected async error report to include event name');
    assert(typeof errors[1].message === 'string' && errors[1].message.includes('boom_async'), 'Expected async error report to include message');

    console.log('✓ safe emitter catches handler exceptions');
}

run().catch((err) => {
    console.error(`✗ safe emitter test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
