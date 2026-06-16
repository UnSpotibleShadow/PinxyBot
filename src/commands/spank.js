import { SlashCommandBuilder } from 'discord.js';

const spankMessages = [
    '{sender} bonks {target} with a cartoonishly oversized paddle 🏓',
    '{sender} gives {target} a dramatic anime-style smack 💥',
    '{sender} lightly spanks {target}. Behave! 😤',
    '{sender} sends {target} to the silly corner 👀',
    '{sender} delivers justice to {target} with a tiny squeaky paddle 🧸',
];

export const data = new SlashCommandBuilder()
    .setName('spank')
    .setDescription('Playfully spank someone.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person you want to spank.')
            .setRequired(true)
    );

export async function execute(interaction) {
    const sender = interaction.user;
    const target = interaction.options.getUser('target', true);

    if (target.bot) {
        await interaction.reply({
            content: `${sender} tries to spank ${target}, but the robot armor is too strong 🤖`,
            allowedMentions: { users: [sender.id, target.id] },
        });
        return;
    }

    if (target.id === sender.id) {
        await interaction.reply({
            content: `${sender} bonks themselves. Confusing, but valid 🫡`,
            allowedMentions: { users: [sender.id] },
        });
        return;
    }

    const template = spankMessages[Math.floor(Math.random() * spankMessages.length)];

    await interaction.reply({
        content: template
            .replace('{sender}', `${sender}`)
            .replace('{target}', `${target}`),
        allowedMentions: { users: [sender.id, target.id] },
    });
}