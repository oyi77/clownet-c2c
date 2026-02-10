const config = require('../config');

// Check command against denylist and riskylist.
// Returns: { allowed: true } | { rejected: true, reason } | { needsApproval: true, reason }
function checkCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') {
        return { rejected: true, reason: 'Empty or invalid command' };
    }

    // Denylist: immediately reject commands containing blocked tokens
    for (const token of config.COMMAND_DENYLIST) {
        if (cmd.includes(token)) {
            return { rejected: true, reason: `Command blocked by denylist (contains "${token}")` };
        }
    }

    // Riskylist: require approval for commands containing risky tokens
    for (const token of config.COMMAND_RISKYLIST) {
        if (cmd.includes(token)) {
            return { needsApproval: true, reason: `Command requires approval (contains "${token}")` };
        }
    }

    return { allowed: true };
}

module.exports = { checkCommand };
