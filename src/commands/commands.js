import {
    ActionRowBuilder,
    EmbedBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';

const CUSTOM_ID_PREFIX = 'commands:category:';

const COMMAND_CATEGORIES = [
    {
        id: 'fun',
        label: 'Fun & Social',
        emoji: '🎉',
        description: 'Social chaos, compliments, bonks, ships, and silly commands.',
        commands: [
            'bonk',
            'blame',
            'decide',
            'give',
            'praise',
            'ship',
            'wyr',
            'fortunecookie',
        ],
    },
    {
        id: 'interactive',
        label: 'Games & Interactive',
        emoji: '🎮',
        description: 'Polls, petitions, voting, and chat engagement commands.',
        commands: [
            'poll',
            'petition',
        ],
    },
    {
        id: 'confession',
        label: 'Confession System',
        emoji: '😈',
        description: 'Anonymous confessions, sin points, and the sinnerboard.',
        commands: [
            'confess',
        ],
    },
    {
        id: 'memory',
        label: 'Memory / Server Lore',
        emoji: '🧠',
        description: 'Commands that remember things for the server.',
        commands: [
            'w',
        ],
    },
    {
        id: 'utility',
        label: 'Utility',
        emoji: '🛠️',
        description: 'Helpful bot/server utility commands.',
        commands: [
            'commands',
            'ping',
        ],
    },
];

export const data = new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Send you an interactive DM with all available commands.');

export async function execute(interaction) {
    const commands = getSortedCommands(interaction);

    const embed = createOverviewEmbed(commands);
    const components = createCategoryComponents(interaction.user.id, commands);

    try {
        await interaction.user.send({
            embeds: [embed],
            components,
            allowedMentions: {
                parse: [],
            },
        });

        await interaction.reply({
            content: '📬 I sent you the interactive command list in DMs!',
            ephemeral: true,
        });
    } catch (error) {
        console.error('Failed to send commands DM:', error);

        await interaction.reply({
            content: 'I could not DM you the command list. You may have DMs disabled for this server.',
            ephemeral: true,
        });
    }
}

export async function handleSelectMenuInteraction(interaction) {
    if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) {
        return false;
    }

    const ownerId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);

    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: 'This command menu belongs to someone else.',
            ephemeral: true,
        });

        return true;
    }

    const selectedCategoryId = interaction.values[0];
    const commands = getSortedCommands(interaction);

    const embed = selectedCategoryId === 'overview'
        ? createOverviewEmbed(commands)
        : createCategoryEmbed(commands, selectedCategoryId);

    const components = createCategoryComponents(interaction.user.id, commands, selectedCategoryId);

    await interaction.update({
        embeds: [embed],
        components,
        allowedMentions: {
            parse: [],
        },
    });

    return true;
}

function getSortedCommands(interaction) {
    return [...interaction.client.commands.values()]
        .map((command) => command.data.toJSON())
        .sort((a, b) => a.name.localeCompare(b.name));
}

function createOverviewEmbed(commands) {
    const categorizedCommandNames = new Set(
        COMMAND_CATEGORIES.flatMap((category) => category.commands)
    );

    const uncategorized = commands.filter((command) =>
        !categorizedCommandNames.has(command.name)
    );

    const categoryLines = COMMAND_CATEGORIES.map((category) => {
        const count = getCommandsForCategory(commands, category).length;

        return `${category.emoji} **${category.label}** — ${count} command${count === 1 ? '' : 's'}`;
    });

    if (uncategorized.length > 0) {
        categoryLines.push(`📦 **Other** — ${uncategorized.length} command${uncategorized.length === 1 ? '' : 's'}`);
    }

    return new EmbedBuilder()
        .setTitle('📜 PinxyBot Commands')
        .setDescription([
            'Choose a category from the dropdown below to browse commands.',
            '',
            ...categoryLines,
            '',
            `Total commands loaded: **${commands.length}**`,
        ].join('\n'))
        .setFooter({
            text: 'Use the dropdown to switch categories.',
        })
        .setTimestamp();
}

function createCategoryEmbed(commands, categoryId) {
    const category = COMMAND_CATEGORIES.find((item) => item.id === categoryId);

    if (categoryId === 'other') {
        return createOtherCategoryEmbed(commands);
    }

    if (!category) {
        return createOverviewEmbed(commands);
    }

    const categoryCommands = getCommandsForCategory(commands, category);

    const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.label}`)
        .setDescription(category.description)
        .setFooter({
            text: `${categoryCommands.length} command${categoryCommands.length === 1 ? '' : 's'} in this category.`,
        })
        .setTimestamp();

    if (categoryCommands.length === 0) {
        embed.addFields({
            name: 'No commands found',
            value: 'There are no loaded commands in this category.',
        });

        return embed;
    }

    for (const command of categoryCommands.slice(0, 25)) {
        embed.addFields({
            name: `/${command.name}`,
            value: formatCommandDescription(command),
            inline: false,
        });
    }

    return embed;
}

function createOtherCategoryEmbed(commands) {
    const categorizedCommandNames = new Set(
        COMMAND_CATEGORIES.flatMap((category) => category.commands)
    );

    const otherCommands = commands.filter((command) =>
        !categorizedCommandNames.has(command.name)
    );

    const embed = new EmbedBuilder()
        .setTitle('📦 Other Commands')
        .setDescription('Commands that are not assigned to a category yet.')
        .setFooter({
            text: `${otherCommands.length} uncategorized command${otherCommands.length === 1 ? '' : 's'}.`,
        })
        .setTimestamp();

    if (otherCommands.length === 0) {
        embed.addFields({
            name: 'No uncategorized commands',
            value: 'Every loaded command is currently assigned to a category.',
        });

        return embed;
    }

    for (const command of otherCommands.slice(0, 25)) {
        embed.addFields({
            name: `/${command.name}`,
            value: formatCommandDescription(command),
            inline: false,
        });
    }

    return embed;
}

function createCategoryComponents(userId, commands, selectedCategoryId = 'overview') {
    const categorizedCommandNames = new Set(
        COMMAND_CATEGORIES.flatMap((category) => category.commands)
    );

    const hasUncategorized = commands.some((command) =>
        !categorizedCommandNames.has(command.name)
    );

    const options = [
        {
            label: 'Overview',
            value: 'overview',
            description: 'Show all command categories.',
            emoji: '📜',
            default: selectedCategoryId === 'overview',
        },
        ...COMMAND_CATEGORIES.map((category) => ({
            label: category.label,
            value: category.id,
            description: truncate(category.description, 100),
            emoji: category.emoji,
            default: selectedCategoryId === category.id,
        })),
    ];

    if (hasUncategorized) {
        options.push({
            label: 'Other',
            value: 'other',
            description: 'Commands not assigned to a category.',
            emoji: '📦',
            default: selectedCategoryId === 'other',
        });
    }

    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${CUSTOM_ID_PREFIX}${userId}`)
                .setPlaceholder('Choose a command category...')
                .addOptions(options.slice(0, 25))
        ),
    ];
}

function getCommandsForCategory(commands, category) {
    return commands.filter((command) =>
        category.commands.includes(command.name)
    );
}

function formatCommandDescription(command) {
    const lines = [
        command.description || 'No description provided.',
    ];

    const subcommands = command.options?.filter((option) => option.type === 1);

    if (subcommands?.length) {
        lines.push('');
        lines.push(
            subcommands
                .map((subcommand) =>
                    `↳ \`/${command.name} ${subcommand.name}\` — ${subcommand.description}`
                )
                .join('\n')
        );
    }

    return truncate(lines.join('\n'), 1024);
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 3)}...`;
}