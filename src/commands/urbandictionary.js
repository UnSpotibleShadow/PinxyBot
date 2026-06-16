import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('urbandictionary')
    .setDescription('Look up a term on Urban Dictionary.')
    .addStringOption((option) =>
        option
            .setName('term')
            .setDescription('The term to look up.')
            .setRequired(true)
            .setMaxLength(100)
    );

export async function execute(interaction) {
    const term = interaction.options.getString('term', true).trim();

    await interaction.deferReply();

    try {
        const response = await fetch(
            `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`
        );

        if (!response.ok) {
            await interaction.editReply('Urban Dictionary is not responding properly right now.');
            return;
        }

        const data = await response.json();
        const entries = Array.isArray(data.list) ? data.list : [];

        if (!entries.length) {
            await interaction.editReply(`I could not find an Urban Dictionary definition for **${escapeMarkdown(term)}**.`);
            return;
        }

        const topEntry = entries.sort((a, b) => {
            const scoreA = (a.thumbs_up ?? 0) - (a.thumbs_down ?? 0);
            const scoreB = (b.thumbs_up ?? 0) - (b.thumbs_down ?? 0);
            return scoreB - scoreA;
        })[0];

        const definition = cleanUrbanText(topEntry.definition);
        const example = cleanUrbanText(topEntry.example);

        const lines = [
            `**Urban Dictionary: ${escapeMarkdown(topEntry.word ?? term)}**`,
            '',
            `**Definition:** ${escapeMarkdown(definition)}`,
        ];

        if (example) {
            lines.push('', `**Example:** ${escapeMarkdown(example)}`);
        }

        await interaction.editReply({
            content: trimToDiscordLimit(lines.join('\n')),
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        console.error('Urban command failed:', error);
        await interaction.editReply('Something went wrong while looking that up.');
    }
}

function cleanUrbanText(text) {
    return String(text ?? '')
        .replace(/\[([^\]]+)\]/g, '$1')
        .replace(/\r?\n/g, '\n')
        .trim();
}

function trimToDiscordLimit(text, maxLength = 1900) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function escapeMarkdown(text) {
    return String(text).replace(/([\\*_~`>|])/g, '\\$1');
}