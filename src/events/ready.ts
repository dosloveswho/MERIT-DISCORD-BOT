import { Client } from "discord.js";
import { logger } from "../utils/logger";
import { reconcilePendingSubmissionsOnStartup } from "../services/submissionService";

export function registerReadyEvent(client: Client): void {
  client.once("ready", async (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}`);

    try {
      await reconcilePendingSubmissionsOnStartup(readyClient);
      logger.info("Startup reconciliation of pending submissions complete.");
    } catch (error) {
      logger.error("Startup reconciliation failed", error);
    }
  });
}
