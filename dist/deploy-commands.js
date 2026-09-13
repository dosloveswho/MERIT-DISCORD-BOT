"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const config_1 = require("./config/config");
const merits = __importStar(require("./commands/merits"));
const setmerit = __importStar(require("./commands/setmerit"));
const addmerit = __importStar(require("./commands/addmerit"));
const logger_1 = require("./utils/logger");
const commands = [merits.data.toJSON(), setmerit.data.toJSON(), addmerit.data.toJSON()];
const rest = new discord_js_1.REST({ version: "10" }).setToken(config_1.config.discordToken);
async function main() {
    try {
        logger_1.logger.info(`Deploying ${commands.length} slash command(s) to guild ${config_1.config.guildId}...`);
        await rest.put(discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, config_1.config.guildId), {
            body: commands,
        });
        logger_1.logger.info("Slash commands deployed successfully.");
    }
    catch (error) {
        logger_1.logger.error("Failed to deploy slash commands", error);
        process.exitCode = 1;
    }
}
main();
