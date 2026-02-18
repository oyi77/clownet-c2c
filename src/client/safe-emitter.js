function wrapEmitter(emitter, { onError } = {}) {
    if (!emitter || typeof emitter.on !== 'function') {
        throw new Error('wrapEmitter requires an EventEmitter-like object');
    }

    const report = typeof onError === 'function'
        ? onError
        : () => {};

    const originalOn = emitter.on.bind(emitter);
    const originalOnce = typeof emitter.once === 'function' ? emitter.once.bind(emitter) : null;

    function wrapHandler(event, handler) {
        return (...args) => {
            try {
                const res = handler(...args);
                if (res && typeof res.then === 'function') {
                    res.catch((err) => {
                        report({ event, message: err && err.message ? err.message : String(err || 'Unknown error') });
                    });
                }
            } catch (err) {
                report({ event, message: err && err.message ? err.message : String(err || 'Unknown error') });
            }
        };
    }

    emitter.on = (event, handler) => {
        return originalOn(event, wrapHandler(event, handler));
    };

    if (originalOnce) {
        emitter.once = (event, handler) => {
            return originalOnce(event, wrapHandler(event, handler));
        };
    }

    return emitter;
}

module.exports = { wrapEmitter };
