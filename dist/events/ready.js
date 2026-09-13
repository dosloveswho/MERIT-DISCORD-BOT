"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReadyEvent = registerReadyEvent;
const logger_1 = require("../utils/logger");
const submissionService_1 = require("../services/submissionService");
function registerReadyEvent(client) {
    client.once("ready", async (readyClient) => {
        logger_1.logger.info(`Logged in as ${readyClient.user.tag}`);
        try {
            await (0, submissionService_1.reconcilePendingSubmissionsOnStartup)(readyClient);
            logger_1.logger.info("Startup reconciliation of pending submissions complete.");
        }
        catch (error) {
            logger_1.logger.error("Startup reconciliation failed", error);
        }
    });
}
