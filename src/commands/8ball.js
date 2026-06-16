import { SlashCommandBuilder } from 'discord.js';

const responses = [
    'It is certain.',
    'It is decidedly so.',
    'Without a doubt.',
    'Yes definitely.',
    'You may rely on it.',
    'As I see it, yes.',
    'Most likely.',
    'Outlook good.',
    'Yes.',
    'Signs point to yes.',
    'Reply hazy, try again.',
    'Ask again later.',
    'Better not tell you now.',
    'Cannot predict now.',
    'Concentrate and ask again.',
    'Do not count on it.',
    'My reply is no.',
    'My sources say no.',
    'Outlook not so good.',
    'Very doubtful.',
    'Only if Francesca won\'t hate you for it',
];

export const data = new SlashCommandBuilder()
    .setName('8')
    .setDescription('Ask the magic 8-ball a question.')
    .addStringOption((option) =>
        option
            .setName('question')
            .setDescription('Your question for the 8-ball.')
            .setRequired(true)
            .setMaxLength(300)
    );

export async function execute(interaction) {
    const question = interaction.options.getString('question', true);
    const answer = responses[Math.floor(Math.random() * responses.length)];

    await interaction.reply({
        content: [
            `🎱 **Question:** ${question}`,
            `**Answer:** ${answer}`,
        ].join('\n'),
        allowedMentions: { parse: [] },
    });
}