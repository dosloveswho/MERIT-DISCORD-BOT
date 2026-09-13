import { REST, Routes } from "discord.js";
import { config } from "./config/config";
import * as merits from "./commands/merits";
import * as setmerit from "./commands/setmerit";
import * as setupMeritPanel from "./commands/setupMeritPanel";
import { logger } from "./utils/logger";

const commands = [merits.data.toJSON(), setmerit.data.toJSON(), setupMeritPanel.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(config.discordToken);

async function main() {
  try {
    logger.info(`Deploying ${commands.length} slash command(s) to guild ${config.guildId}...`);

    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commands,
    });

    logger.info("Slash commands deployed successfully.");
  } catch (error) {
    logger.error("Failed to deploy slash commands", error);
    process.exitCode = 1;
  }
}

main();
