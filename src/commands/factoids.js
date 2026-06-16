import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { loadMemory, saveMemory } from '../lib/memoryStore.js';

const memory = await loadMemory();

export const data = new SlashCommandBuilder()
    .setName('w')
    .setDescription('Learn and recall saved text.')
    .addSubcommand((subcommand) =>
        subcommand
            .setName('learn')
            .setDescription('Learn a new key or add text to an existing key.')
            .addStringOption((option) =>
                option
                    .setName('key')
                    .setDescription('The key to save this under.')
                    .setRequired(true)
                    .setMaxLength(64)
            )
            .addStringOption((option) =>
                option
                    .setName('input')
                    .setDescription('The text to remember.')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('show')
            .setDescription('Show everything saved under a key.')
            .addStringOption((option) =>
                option
                    .setName('key')
                    .setDescription('The key to look up.')
                    .setRequired(true)
                    .setMaxLength(64)
            )
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'learn') {
        await handleLearn(interaction);
        return;
    }

    if (subcommand === 'show') {
        await handleShow(interaction);
        return;
    }
}

async function handleLearn(interaction) {
    if (!canUseLearn(interaction)) {
        await interaction.reply({
            content: 'Only moderators can use `/w learn`.',
            ephemeral: true,
        });
        return;
    }

    const key = normalizeKey(interaction.options.getString('key', true));
    const input = interaction.options.getString('input', true).trim();

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
        content: `Learned **${key}**. It now has **${memory[key].length}** ${entryWord(memory[key].length)}.`,
        allowedMentions: { parse: [] },
    });
}

async function handleShow(interaction) {
    const key = normalizeKey(interaction.options.getString('key', true));
    const entries = memory[key];

    if (!entries || entries.length === 0) {
        await interaction.reply({
            content: `I do not know anything for **${key}** yet.`,
            allowedMentions: { parse: [] },
        });
        return;
    }

    const response = [
        `**${key}** has **${entries.length}** ${entryWord(entries.length)}:`,
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

function canUseLearn(interaction) {
    return interaction.memberPermissions?.any([
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
    ]);
}

function normalizeKey(key) {
    return key.trim().toLowerCase();
}

function entryWord(count) {
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