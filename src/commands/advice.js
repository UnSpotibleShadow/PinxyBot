import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('advice')
    .setDescription('Get a random piece of advice.');

export async function execute(interaction) {
    await interaction.deferReply();

    try {
        const response = await fetch('https://api.adviceslip.com/advice');

        if (!response.ok) {
            await interaction.editReply('I could not fetch advice right now.');
            return;
        }

        const data = await response.json();
        const advice = data?.slip?.advice;

        if (!advice) {
            await interaction.editReply('The advice API returned something unexpected.');
            return;
        }

        await interaction.editReply({
            content: `💡 **Advice:** ${escapeMarkdown(advice)}`,
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        console.error('Advice command failed:', error);
        await interaction.editReply('Something went wrong while getting advice.');
    }
}

function escapeMarkdown(text) {
    return String(text).replace(/([\\*_~`>|])/g, '\\$1');
}