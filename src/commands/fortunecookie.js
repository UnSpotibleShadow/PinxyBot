import { SlashCommandBuilder } from 'discord.js';

const fortunes = [
    'A fresh start will put you on your way.',
    'A friend asks only for your time, not your money.',
    'Adventure can be real happiness.',
    'All your hard work will soon pay off.',
    'An exciting opportunity lies ahead.',
    'Believe in yourself and others will too.',
    'Better things are coming your way.',
    'Change is happening in your life, so go with the flow.',
    'Do not be afraid to take that big step.',
    'Every day is a new chance to do something great.',
    'Good news will come to you soon.',
    'Happiness begins with facing life with a smile.',
    'Now is a good time to try something new.',
    'Patience is the key to joy.',
    'Someone is thinking fondly of you.',
    'The best way to predict the future is to create it.',
    'The fortune you seek is in another cookie.',
    'Today is a good day for being weird on purpose.',
    'You are closer to your goal than you think.',
    'Your kindness will lead you to success.',
];

export const data = new SlashCommandBuilder()
    .setName('fortunecookie')
    .setDescription('Open a fortune cookie.');

export async function execute(interaction) {
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    const luckyNumbers = generateLuckyNumbers();

    await interaction.reply({
        content: [
            '🥠 **You crack open a fortune cookie...**',
            '',
            `*"${fortune}"*`,
            '',
            `**Lucky numbers:** ${luckyNumbers.join(', ')}`,
        ].join('\n'),
        allowedMentions: { parse: [] },
    });
}

function generateLuckyNumbers() {
    const numbers = new Set();

    while (numbers.size < 6) {
        numbers.add(Math.floor(Math.random() * 99) + 1);
    }

    return [...numbers].sort((a, b) => a - b);
}