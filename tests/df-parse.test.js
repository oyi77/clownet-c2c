const { parseDfAvailableKb } = require('../src/client/disk-usage');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function run() {
    const sample = [
        'Filesystem 1024-blocks Used Available Capacity Mounted on',
        '/dev/disk3s5s1  487084288  11454464  2434304  83% /',
    ].join('\n');

    const kb = parseDfAvailableKb(sample);
    assert(kb === 2434304, `Expected 2434304, got ${kb}`);
    console.log('✓ df available KB parsing');
}

run();
