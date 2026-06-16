import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AttachmentBuilder,
    EmbedBuilder,
    SlashCommandBuilder,
} from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'coin');

export const data = new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin.');

export async function execute(interaction) {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';

    const imageFileName = result === 'heads' ? 'heads.png' : 'tails.png';
    const imagePath = path.join(ASSETS_DIR, imageFileName);

    const embed = new EmbedBuilder()
        .setTitle('🪙 Coin Flip')
        .setDescription(`It landed on **${result.toUpperCase()}**!`)
        .setTimestamp();

    if (fs.existsSync(imagePath)) {
        const attachment = new AttachmentBuilder(imagePath, {
            name: imageFileName,
        });

        embed.setImage(`attachment://${imageFileName}`);

        await interaction.reply({
            embeds: [embed],
            files: [attachment],
        });

        return;
    }

    await interaction.reply({
        content: `🪙 The coin landed on **${result.toUpperCase()}**!`,
        allowedMentions: { parse: [] },
    });
}