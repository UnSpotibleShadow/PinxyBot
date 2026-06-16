import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('dictionary')
    .setDescription('Look up a normal dictionary definition.')
    .addStringOption((option) =>
        option
            .setName('word')
            .setDescription('The word to define.')
            .setRequired(true)
            .setMaxLength(100)
    );

export async function execute(interaction) {
    const word = interaction.options.getString('word', true).trim();

    await interaction.deferReply();

    try {
        const response = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
        );

        if (response.status === 404) {
            await interaction.editReply(`I could not find a dictionary definition for **${escapeMarkdown(word)}**.`);
            return;
        }

        if (!response.ok) {
            await interaction.editReply('The dictionary API is not responding properly right now.');
            return;
        }

        const data = await response.json();
        const entry = data[0];

        const phonetic =
            entry.phonetic ||
            entry.phonetics?.find((item) => item.text)?.text ||
            null;

        const definitions = [];

        for (const meaning of entry.meanings ?? []) {
            for (const definition of meaning.definitions ?? []) {
                definitions.push({
                    partOfSpeech: meaning.partOfSpeech,
                    definition: definition.definition,
                    example: definition.example,
                });

                if (definitions.length >= 3) break;
            }

            if (definitions.length >= 3) break;
        }

        if (!definitions.length) {
            await interaction.editReply(`I found **${escapeMarkdown(word)}**, but no definitions were returned.`);
            return;
        }

        const lines = [
            `**${escapeMarkdown(entry.word ?? word)}**${phonetic ? ` — ${escapeMarkdown(phonetic)}` : ''}`,
            '',
            ...definitions.flatMap((item, index) => {
                const block = [
                    `**${index + 1}.** *${escapeMarkdown(item.partOfSpeech ?? 'unknown')}* — ${escapeMarkdown(item.definition)}`,
                ];

                if (item.example) {
                    block.push(`> ${escapeMarkdown(item.example)}`);
                }

                return block;
            }),
        ];

        await interaction.editReply({
            content: trimToDiscordLimit(lines.join('\n')),
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        console.error('Dictionary command failed:', error);
        await interaction.editReply('Something went wrong while looking up that word.');
    }
}

function trimToDiscordLimit(text, maxLength = 1900) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function escapeMarkdown(text) {
    return String(text).replace(/([\\*_~`>|])/g, '\\$1');
}