import { SlashCommandBuilder } from 'discord.js';

const hugMessages = [
    '{sender} gives {target} a big warm hug 🤗',
    '{sender} wraps {target} in a cozy hug 💖',
    '{sender} hugs {target} tightly 🫂',
    '{sender} gives {target} a much-needed hug ✨',
    '{sender} sends {target} a virtual hug 🤍',
];

export const data = new SlashCommandBuilder()
    .setName('hug')
    .setDescription('Give someone a hug.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person you want to hug.')
            .setRequired(true)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);
    const sender = interaction.user;

    if (target.id === sender.id) {
        await interaction.reply({
            content: `${sender} hugs themselves. Self-care is important 🤗`,
            allowedMentions: { users: [sender.id] },
        });
        return;
    }

    const template = hugMessages[Math.floor(Math.random() * hugMessages.length)];

    const message = template
        .replace('{sender}', `${sender}`)
        .replace('{target}', `${target}`);

    await interaction.reply({
        content: message,
        allowedMentions: { users: [sender.id, target.id] },
    });
}