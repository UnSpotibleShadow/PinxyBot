import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKWISHES_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'skwishes.json'
);

export const data = new SlashCommandBuilder()
    .setName('skwish')
    .setDescription('Skwish someone and keep count.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person to skwish.')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('reason')
            .setDescription('Why are they being skwished?')
            .setRequired(false)
            .setMaxLength(200)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);
    const reason = interaction.options.getString('reason')?.trim();

    if (interaction.user.id === target.id) {
        await interaction.reply({
            content: `🫓 ${interaction.user} tried to skwish themselves... impressive, but no.`,
            allowedMentions: {
                users: [interaction.user.id],
            },
        });

        return;
    }

    const skwishes = await loadSkwishes();

    skwishes[target.id] = (skwishes[target.id] ?? 0) + 1;

    await saveSkwishes(skwishes);

    const count = skwishes[target.id];

    const content = [
        `🫓 ${interaction.user} skwishes ${target}!`,
        reason ? `**Reason:** ${reason}` : null,
        '',
        `${target} has now been skwished **${count}** time${count === 1 ? '' : 's'}.`,
    ].filter(Boolean).join('\n');

    await interaction.reply({
        content,
        allowedMentions: {
            users: [interaction.user.id, target.id],
        },
    });
}

async function loadSkwishes() {
    try {
        const raw = await fs.readFile(SKWISHES_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return {};
        }

        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }

        console.error('Failed to load skwishes.json:', error);
        return {};
    }
}

async function saveSkwishes(skwishes) {
    await fs.mkdir(path.dirname(SKWISHES_FILE), { recursive: true });
    await fs.writeFile(SKWISHES_FILE, JSON.stringify(skwishes, null, 4), 'utf8');
}