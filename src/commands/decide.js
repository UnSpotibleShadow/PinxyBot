import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('decide')
    .setDescription('Let the bot pick a random item for someone.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person this decision is for.')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('items')
            .setDescription('Items to choose from, separated with |. Example: pizza | sushi | tacos')
            .setRequired(true)
            .setMaxLength(1500)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);
    const rawItems = interaction.options.getString('items', true);

    const items = parseItems(rawItems);

    if (items.length < 2) {
        await interaction.reply({
            content: 'Please provide at least 2 items, separated with `|`. Example: `pizza | sushi | tacos`',
            ephemeral: true,
        });

        return;
    }

    const pickedItem = randomFrom(items);

    await interaction.reply({
        content: `🎲 ${interaction.client.user} decides ${target} gets **${pickedItem}**!`,
        allowedMentions: {
            users: [target.id],
        },
    });
}

function parseItems(rawItems) {
    return rawItems
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 100));
}

function randomFrom(items) {
    return items[Math.floor(Math.random() * items.length)];
}