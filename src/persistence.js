const fs = require('fs');
const config = require('./config');
const state = require('./state');

function loadState() {
    try {
        if (fs.existsSync(config.DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(config.DB_PATH, 'utf8'));
            if (data.tenants && data.tenants.default) {
                state.setTenantState('default', {
                    tasks: data.tenants.default.tasks || [],
                    messages: data.tenants.default.messages || [],
                });
            } else {
                state.setTenantState('default', {
                    tasks: data.tasks || [],
                    messages: data.messages || [],
                });
            }
        }
        if (fs.existsSync(config.SETTINGS_PATH)) {
            state.setSettings(JSON.parse(fs.readFileSync(config.SETTINGS_PATH, 'utf8')));
        }
    } catch (e) {
        console.error('Persistence Load Error', e);
    }
}

function saveState(tenantId) {
    try {
        const s = state.getTenantState(tenantId);
        fs.writeFileSync(config.DB_PATH, JSON.stringify({
            tasks: s.tasks,
            messages: s.messages,
        }, null, 2));
    } catch (e) {
        console.error('DB Save Error', e);
    }
}

function saveSettings() {
    try {
        fs.writeFileSync(config.SETTINGS_PATH, JSON.stringify(state.getSettings()));
    } catch (e) {
        console.error('Settings Save Error', e);
    }
}

module.exports = { loadState, saveState, saveSettings };
