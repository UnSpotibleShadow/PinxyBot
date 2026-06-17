import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BLAMES_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'blames.json'
);

export const data = new SlashCommandBuilder()
    .setName('blame')
    .setDescription('Blame someone and keep count.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person to blame.')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('reason')
            .setDescription('Why are they being blamed?')
            .setRequired(false)
            .setMaxLength(200)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);
    const reason = interaction.options.getString('reason')?.trim();

    const blames = await loadBlames();

    if (!blames[target.id]) {
        blames[target.id] = 0;
    }

    blames[target.id] += 1;

    await saveBlames(blames);

    const count = blames[target.id];

    await interaction.reply({
        content: [
            `👉 ${target} has been blamed.`,
            reason ? `**Reason:** ${reason}` : null,
            '',
            `They have now been blamed **${count}** time${count === 1 ? '' : 's'}.`,
        ].filter(Boolean).join('\n'),
        allowedMentions: {
            users: [target.id],
        },
    });
}

async function loadBlames() {
    try {
        const raw = await fs.readFile(BLAMES_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return {};
        }

        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }

        console.error('Failed to load blames.json:', error);
        return {};
    }
}

async function saveBlames(blames) {
    await fs.mkdir(path.dirname(BLAMES_FILE), { recursive: true });
    await fs.writeFile(BLAMES_FILE, JSON.stringify(blames, null, 4), 'utf8');
}