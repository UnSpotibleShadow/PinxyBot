import { SlashCommandBuilder } from 'discord.js';

const praiseMessages = [
    '{target} is doing amazing today ✨',
    '{target} deserves a round of applause 👏',
    '{target} is absolutely crushing it 💪',
    '{target} is a certified legend 🏆',
    '{target} brings excellent vibes to the server 🌟',
    '{target} is smarter than they give themselves credit for 🧠',
    '{target} has immaculate energy today 💖',
    '{target} is the moment 😌',
    '{target} deserves praise, snacks, and a nap 🥐',
    '{target} is built different, respectfully 🔥',
];

export const data = new SlashCommandBuilder()
    .setName('praise')
    .setDescription('Praise someone.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person you want to praise.')
            .setRequired(true)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);

    const template = praiseMessages[
        Math.floor(Math.random() * praiseMessages.length)
        ];

    const message = template.replace('{target}', `${target}`);

    await interaction.reply({
        content: message,
        allowedMentions: { users: [target.id] },
    });
}