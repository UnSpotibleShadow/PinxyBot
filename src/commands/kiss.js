import { SlashCommandBuilder } from 'discord.js';

const kissMessages = [
    '{sender} gives {target} a sweet kiss 💋',
    '{sender} blows a kiss to {target} 😘',
    '{sender} gives {target} a gentle forehead kiss 💖',
    '{sender} sends {target} a kiss through the air ✨',
    '{sender} smooches {target} lovingly 💕',
];

export const data = new SlashCommandBuilder()
    .setName('kiss')
    .setDescription('Give someone a kiss.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person you want to kiss.')
            .setRequired(true)
    );

export async function execute(interaction) {
    const sender = interaction.user;
    const target = interaction.options.getUser('target', true);

    if (target.bot) {
        await interaction.reply({
            content: `${sender} tries to kiss ${target}, but gets a metallic *beep boop* instead 🤖`,
            allowedMentions: { users: [sender.id, target.id] },
        });
        return;
    }

    if (target.id === sender.id) {
        await interaction.reply({
            content: `${sender} gives themselves a little self-love kiss 😘`,
            allowedMentions: { users: [sender.id] },
        });
        return;
    }

    const template = kissMessages[Math.floor(Math.random() * kissMessages.length)];

    await interaction.reply({
        content: template
            .replace('{sender}', `${sender}`)
            .replace('{target}', `${target}`),
        allowedMentions: { users: [sender.id, target.id] },
    });
}