import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'w-data.json');

async function loadMemory() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {};
    }

    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    console.error('Failed to load memory file:', error);
    return {};
  }
}

async function saveMemory(memory) {
  await fs.writeFile(DATA_FILE, JSON.stringify(memory, null, 2), 'utf8');
}

function normalizeKey(key) {
  return key.trim().toLowerCase();
}

function pluralizeEntry(count) {
  return count === 1 ? 'entry' : 'entries';
}

function chunkText(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);

    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

const memory = await loadMemory();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

function canUseLearn(interaction) {
  return interaction.memberPermissions?.any([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ModerateMembers,
  ]);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply('Pong!');
      return;
    }

    if (interaction.commandName !== 'w') return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'learn') {
      if (!canUseLearn(interaction)) {
        await interaction.reply({
          content: 'Only moderators can use `/w learn`.',
          ephemeral: true,
        });
        return;
      }

      const rawKey = interaction.options.getString('key', true);
      const input = interaction.options.getString('input', true).trim();
      const key = normalizeKey(rawKey);

      if (!key || !input) {
        await interaction.reply({
          content: 'Please provide both a key and input.',
          ephemeral: true,
        });
        return;
      }

      if (!memory[key]) {
        memory[key] = [];
      }

      memory[key].push(input);
      await saveMemory(memory);

      await interaction.reply({
        content: `Learned **${key}**. It now has **${memory[key].length}** ${pluralizeEntry(memory[key].length)}.`,
        allowedMentions: { parse: [] },
      });

      return;
    }

    if (subcommand === 'show') {
      const rawKey = interaction.options.getString('key', true);
      const key = normalizeKey(rawKey);

      const entries = memory[key];

      if (!entries || entries.length === 0) {
        await interaction.reply({
          content: `I do not know anything for **${key}** yet.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      const response = [
        `**${key}** has **${entries.length}** ${pluralizeEntry(entries.length)}:`,
        '',
        ...entries.map((entry, index) => `${index + 1}. ${entry}`),
      ].join('\n');

      const chunks = chunkText(response);

      await interaction.reply({
        content: chunks[0],
        allowedMentions: { parse: [] },
      });

      for (const chunk of chunks.slice(1)) {
        await interaction.followUp({
          content: chunk,
          allowedMentions: { parse: [] },
        });
      }
    }
  } catch (error) {
    console.error(error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Something went wrong while handling that command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'Something went wrong while handling that command.',
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);