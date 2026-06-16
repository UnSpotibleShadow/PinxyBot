import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { loadCommands } from './lib/loadCommands.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

const commands = await loadCommands();

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${client.commands.size} command(s).`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.warn(`No command handler found for /${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error while executing /${interaction.commandName}:`, error);

    const message = {
      content: 'Something went wrong while handling that command.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);