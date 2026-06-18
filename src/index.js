import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { loadCommands } from './lib/loadCommands.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,],
});

client.commands = new Collection();

const commands = await loadCommands();

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${client.commands.size} command(s).`);

  for (const commandName of client.commands.keys()) {
    console.log(`- /${commandName}`);
  }

  for (const command of client.commands.values()) {
    if (typeof command.init === 'function') {
      await command.init(client);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
      return;
    }

  } catch (error) {
    console.error('Interaction error:', error);
    await replyWithError(interaction);
  }
});

async function handleChatInputCommand(interaction) {
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.warn(`No command handler found for /${interaction.commandName}`);
    return;
  }

  await command.execute(interaction);
}

async function handleModalSubmit(interaction) {
  for (const command of client.commands.values()) {
    if (typeof command.handleModalSubmit !== 'function') {
      continue;
    }

    const handled = await command.handleModalSubmit(interaction);

    if (handled) {
      return;
    }
  }
}

async function handleButtonInteraction(interaction) {
  for (const command of client.commands.values()) {
    if (typeof command.handleButtonInteraction !== 'function') {
      continue;
    }

    const handled = await command.handleButtonInteraction(interaction);

    if (handled) {
      return;
    }
  }
}

async function replyWithError(interaction) {
  const message = {
    content: 'Something went wrong while handling that interaction.',
    ephemeral: true,
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(message).catch(() => null);
  } else {
    await interaction.reply(message).catch(() => null);
  }
}

async function handleSelectMenuInteraction(interaction) {
  for (const command of client.commands.values()) {
    if (typeof command.handleSelectMenuInteraction !== 'function') {
      continue;
    }

    const handled = await command.handleSelectMenuInteraction(interaction);

    if (handled) {
      return;
    }
  }
}



client.login(process.env.DISCORD_TOKEN);