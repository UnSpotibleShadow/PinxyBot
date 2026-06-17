import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const GIFTS_FILE = path.join(__dirname, '..', '..', 'assets', 'datafiles', 'gifts.json');

export const data = new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give someone something.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person to give something to.')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('something')
            .setDescription('What to give them. Leave empty for something random.')
            .setRequired(false)
            .setMaxLength(100)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);
    const specifiedThing = interaction.options.getString('something')?.trim();

    const gift = specifiedThing || await getRandomGift();

    await interaction.reply({
        content: `${interaction.client.user} gives ${target} **${gift}**!`,
        allowedMentions: {
            users: [target.id],
        },
    });
}

async function getRandomGift() {
    try {
        const raw = await fs.readFile(GIFTS_FILE, 'utf8');
        const gifts = JSON.parse(raw);

        if (!Array.isArray(gifts) || gifts.length === 0) {
            return 'a mysterious empty box';
        }

        const validGifts = gifts.filter((gift) =>
            typeof gift === 'string' && gift.trim().length > 0
        );

        if (validGifts.length === 0) {
            return 'a mysterious empty box';
        }

        return validGifts[Math.floor(Math.random() * validGifts.length)];
    } catch (error) {
        console.error('Failed to load gifts.json:', error);
        return 'a mysterious empty box';
    }
}