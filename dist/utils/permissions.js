"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMeritManagerRole = hasMeritManagerRole;
const config_1 = require("../config/config");
/**
 * Checks whether a guild member has the configured Merit Manager role.
 * Deliberately does NOT fall back to Administrator permission — the
 * spec requires checking specifically for the configured role ID.
 */
function hasMeritManagerRole(member) {
    if (!member)
        return false;
    return member.roles.cache.has(config_1.config.meritManagerRoleId);
}
