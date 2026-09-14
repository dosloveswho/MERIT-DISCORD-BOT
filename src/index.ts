import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config/config";
import { logger } from "./utils/logger";
import { registerReadyEvent } from "./events/ready";
import { registerInteractionCreateEvent, SlashCommand } from "./events/interactionCreate";
import { handleMessageCreate } from "./events/messageCreate";
import { handleMessageReactionAdd, registerReactionChannels } from "./events/messageReactionAdd";

import * as merits from "./commands/merits";
import * as setmerit from "./commands/setmerit";
import * as addmerit from "./commands/addmerit";
import * as leaderboards from "./commands/leaderboards";


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const commands = new Collection<string, SlashCommand>();
commands.set(merits.data.name, merits);
commands.set(setmerit.data.name, setmerit);
commands.set(addmerit.data.name, addmerit);
commands.set(leaderboards.data.name, leaderboards);

registerReadyEvent(client);
registerInteractionCreateEvent(client, commands);
registerReactionChannels();

client.on("messageCreate", (message) => {
  handleMessageCreate(client, message);
});

client.on("messageReactionAdd", (reaction, user) => {
  handleMessageReactionAdd(client, reaction, user);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
});

client.login(config.discordToken).catch((error) => {
  logger.error("Failed to log in to Discord", error);
  process.exit(1);
});