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
const logger_1 = require("./utils/logger");
const ready_1 = require("./events/ready");
const interactionCreate_1 = require("./events/interactionCreate");
const messageCreate_1 = require("./events/messageCreate");
const merits = __importStar(require("./commands/merits"));
const setmerit = __importStar(require("./commands/setmerit"));
const addmerit = __importStar(require("./commands/addmerit"));
const leaderboards = __importStar(require("./commands/leaderboards"));
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
    partials: [discord_js_1.Partials.Channel, discord_js_1.Partials.Message],
});
const commands = new discord_js_1.Collection();
commands.set(merits.data.name, merits);
commands.set(setmerit.data.name, setmerit);
commands.set(addmerit.data.name, addmerit);
commands.set(leaderboards.data.name, leaderboards);
(0, ready_1.registerReadyEvent)(client);
(0, interactionCreate_1.registerInteractionCreateEvent)(client, commands);
client.on("messageCreate", (message) => {
    (0, messageCreate_1.handleMessageCreate)(client, message);
});
process.on("unhandledRejection", (reason) => {
    logger_1.logger.error("Unhandled promise rejection", reason);
});
process.on("uncaughtException", (error) => {
    logger_1.logger.error("Uncaught exception", error);
});
client.login(config_1.config.discordToken).catch((error) => {
    logger_1.logger.error("Failed to log in to Discord", error);
    process.exit(1);
});
