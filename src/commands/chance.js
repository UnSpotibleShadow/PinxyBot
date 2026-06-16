import { SlashCommandBuilder } from 'discord.js';

const comments = [
    { max: 0, text: 'Absolutely no chance.' },
    { max: 10, text: 'Extremely unlikely.' },
    { max: 25, text: 'Not looking great.' },
    { max: 40, text: 'Possible, but I would not bet on it.' },
    { max: 60, text: 'Could go either way.' },
    { max: 75, text: 'Pretty likely.' },
    { max: 90, text: 'Very likely.' },
    { max: 99, text: 'Almost guaranteed.' },
    { max: 100, text: 'It is basically destiny.' },
];

export const data = new SlashCommandBuilder()
    .setName('chance')
    .setDescription('Calculate the chance of something happening.')
    .addStringOption((option) =>
        option
            .setName('thing')
            .setDescription('What do you want to know the chance of?')
            .setRequired(true)
            .setMaxLength(300)
    );

export async function execute(interaction) {
    const thing = interaction.options.getString('thing', true).trim();
    const chance = Math.floor(Math.random() * 101);

    const comment =
        comments.find((item) => chance <= item.max)?.text ?? 'Interesting.';

    await interaction.reply({
        content: [
            `🎲 **Chance of:** ${escapeMarkdown(thing)}`,
            `**Result:** ${chance}%`,
            `*${comment}*`,
        ].join('\n'),
        allowedMentions: { parse: [] },
    });
}

function escapeMarkdown(text) {
    return String(text).replace(/([\\*_~`|])/g, '\\$1');
}