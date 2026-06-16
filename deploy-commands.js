import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('w')
    .setDescription('Learn and recall saved words/notes.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('learn')
        .setDescription('Learn a new factoid or add another factoid to an existing factoidiant.')
        .addStringOption((option) =>
          option
            .setName('key')
            .setDescription('The factoidiant to store this under.')
            .setRequired(true)
            .setMaxLength(64)
        )
        .addStringOption((option) =>
          option
            .setName('input')
            .setDescription('The factoid to store.')
            .setRequired(true)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('show')
        .setDescription('Show everything saved under a factoidiant.')
        .addStringOption((option) =>
          option
            .setName('key')
            .setDescription('The key to look up.')
            .setRequired(true)
            .setMaxLength(64)
        )
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log('Registering slash commands...');

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log('Slash commands registered.');
} catch (error) {
  console.error(error);
}