import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFESSIONS_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'confessions',
    'active-confessions.json'
);

const SIN_POINTS_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'confessions',
    'sin-points.json'
);

const TITLES_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'confessions',
    'sin-titles.json'
);

const CONFESSION_DURATION_MS = 24 * 60 * 60 * 1000;

const CONFESS_MODAL_PREFIX = 'confess:create:';
const BUTTON_SIN = 'confess:sin';
const BUTTON_INNOCENT = 'confess:innocent';

const scheduledClosures = new Map();

const fallbackTitles = [
    {
        min: 0,
        title: '😇 Pure Soul',
    },
    {
        min: 5,
        title: '👀 Minor Offender',
    },
    {
        min: 15,
        title: '🕯️ Suspicious Individual',
    },
    {
        min: 30,
        title: '😈 Certified Sinner',
    },
    {
        min: 50,
        title: '🔥 Menace to the Timeline',
    },
    {
        min: 69,
        title: '💦 Nice.',
    },
    {
        min: 100,
        title: '🏆 Final Boss of Bad Decisions',
    },
];

export const data = new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Anonymous confession system.')
    .addSubcommand((subcommand) =>
        subcommand
            .setName('submit')
            .setDescription('Post an anonymous confession for the server to judge.')
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('board')
            .setDescription('Show the server sinnerboard.')
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('stats')
            .setDescription('Show your own confession stats privately.')
    );

export async function init(client) {
    const confessions = await loadJson(CONFESSIONS_FILE, {});

    for (const [messageId, confession] of Object.entries(confessions)) {
        if (confession.closed) {
            continue;
        }

        if (!confession.expiresAt) {
            const createdAtMs = confession.createdAt
                ? new Date(confession.createdAt).getTime()
                : Date.now();

            confession.expiresAt = new Date(createdAtMs + CONFESSION_DURATION_MS).toISOString();
        }

        scheduleConfessionClose(client, messageId, confession);
    }

    await saveJson(CONFESSIONS_FILE, confessions);

    console.log('Scheduled active confession closures.');
}

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'submit') {
        await openConfessionModal(interaction);
        return;
    }

    if (subcommand === 'board') {
        await showSinnerboard(interaction);
        return;
    }

    if (subcommand === 'stats') {
        await showPersonalStats(interaction);
    }
}

async function openConfessionModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId(`${CONFESS_MODAL_PREFIX}${interaction.user.id}`)
        .setTitle('Anonymous Confession');

    const confessionInput = new TextInputBuilder()
        .setCustomId('confession')
        .setLabel('What is your confession?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(1000)
        .setPlaceholder('I secretly enjoy pineapple on pizza...');

    modal.addComponents(
        new ActionRowBuilder().addComponents(confessionInput)
    );

    await interaction.showModal(modal);
}

async function showSinnerboard(interaction) {
    const sinPoints = await loadJson(SIN_POINTS_FILE, {});
    const titles = await loadTitles();

    const guildStats = sinPoints[interaction.guildId] ?? {};

    const entries = Object.entries(guildStats)
        .filter(([, stats]) => Number(stats.points) > 0)
        .sort(([, statsA], [, statsB]) => Number(statsB.points) - Number(statsA.points))
        .slice(0, 10);

    if (entries.length === 0) {
        await interaction.reply({
            content: 'The sinnerboard is empty. Nobody has confessed yet.',
            ephemeral: true,
        });

        return;
    }

    const leaderboard = entries
        .map(([userId, stats], index) => {
            const points = Number(stats.points) || 0;
            const title = getTitle(points, titles);

            return [
                `**${index + 1}.** <@${userId}> — **${points}** sin point${points === 1 ? '' : 's'}`,
                `Title: ${title}`,
            ].join('\n');
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle('😈 Server Sinnerboard')
        .setDescription(leaderboard)
        .setFooter({
            text: 'Confession history stays anonymous. Only totals are shown.',
        })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        allowedMentions: {
            parse: [],
        },
    });
}

async function showPersonalStats(interaction) {
    const sinPoints = await loadJson(SIN_POINTS_FILE, {});
    const titles = await loadTitles();

    const stats = sinPoints[interaction.guildId]?.[interaction.user.id] ?? {
        points: 0,
        confessions: 0,
        sinVotesReceived: 0,
    };

    const points = Number(stats.points) || 0;
    const confessions = Number(stats.confessions) || 0;
    const sinVotesReceived = Number(stats.sinVotesReceived) || 0;
    const title = getTitle(points, titles);

    const embed = new EmbedBuilder()
        .setTitle('😈 Your Confession Stats')
        .addFields(
            {
                name: 'Sin points',
                value: `${points}`,
                inline: true,
            },
            {
                name: 'Title',
                value: title,
                inline: true,
            },
            {
                name: 'Confessions submitted',
                value: `${confessions}`,
                inline: true,
            },
            {
                name: 'Pure sin votes received',
                value: `${sinVotesReceived}`,
                inline: true,
            }
        )
        .setFooter({
            text: 'Only you can see this.',
        })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true,
    });
}

export async function handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith(CONFESS_MODAL_PREFIX)) {
        return false;
    }

    const authorId = interaction.customId.slice(CONFESS_MODAL_PREFIX.length);

    if (interaction.user.id !== authorId) {
        await interaction.reply({
            content: 'This confession modal does not belong to you.',
            ephemeral: true,
        });

        return true;
    }

    if (!interaction.guildId || !interaction.channel) {
        await interaction.reply({
            content: 'Confessions can only be posted inside a server channel.',
            ephemeral: true,
        });

        return true;
    }

    await interaction.deferReply({
        ephemeral: true,
    });

    const confessionText = sanitizeConfession(
        interaction.fields.getTextInputValue('confession')
    );

    if (!confessionText) {
        await interaction.editReply({
            content: 'Your confession cannot be empty.',
        });

        return true;
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + CONFESSION_DURATION_MS);
    const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);

    const embed = createConfessionEmbed({
        confession: confessionText,
        sinVotes: 0,
        innocentVotes: 0,
        expiresAtUnix,
        closed: false,
    });

    const components = createVoteComponents({
        sinVotes: 0,
        innocentVotes: 0,
        disabled: false,
    });

    const message = await interaction.channel.send({
        embeds: [embed],
        components,
        allowedMentions: {
            parse: [],
        },
    });

    const confessions = await loadJson(CONFESSIONS_FILE, {});
    const sinPoints = await loadJson(SIN_POINTS_FILE, {});

    confessions[message.id] = {
        messageId: message.id,
        channelId: message.channel.id,
        guildId: interaction.guildId,
        authorId: interaction.user.id,
        confession: confessionText,
        sinVotes: [],
        innocentVotes: [],
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        closed: false,
    };

    addUserStats(sinPoints, interaction.guildId, interaction.user.id, {
        points: 1,
        confessions: 1,
        sinVotesReceived: 0,
    });

    await saveJson(CONFESSIONS_FILE, confessions);
    await saveJson(SIN_POINTS_FILE, sinPoints);

    scheduleConfessionClose(interaction.client, message.id, confessions[message.id]);

    await interaction.editReply({
        content: [
            'Your confession has been posted anonymously.',
            '',
            'You received **1 sin point** for confessing.',
            `Voting closes <t:${expiresAtUnix}:R>.`,
            '',
            'Your user ID is stored privately only for scoring.',
        ].join('\n'),
    });

    return true;
}

export async function handleButtonInteraction(interaction) {
    if (![BUTTON_SIN, BUTTON_INNOCENT].includes(interaction.customId)) {
        return false;
    }

    await interaction.deferReply({
        ephemeral: true,
    });

    const confessions = await loadJson(CONFESSIONS_FILE, {});
    const sinPoints = await loadJson(SIN_POINTS_FILE, {});

    const confession = confessions[interaction.message.id];

    if (!confession || confession.closed) {
        await interaction.editReply({
            content: 'This confession is no longer active.',
        });

        return true;
    }

    if (isExpired(confession)) {
        await closeConfession(interaction.client, interaction.message.id);

        await interaction.editReply({
            content: 'This confession has already closed.',
        });

        return true;
    }

    if (interaction.user.id === confession.authorId) {
        await interaction.editReply({
            content: 'You cannot vote on your own anonymous confession.',
        });

        return true;
    }

    const newVote = interaction.customId === BUTTON_SIN ? 'sin' : 'innocent';
    const previousVote = getPreviousVote(confession, interaction.user.id);

    if (previousVote === newVote) {
        await interaction.editReply({
            content: `You already voted **${formatVoteName(newVote)}** on this confession.`,
        });

        return true;
    }

    removeVote(confession, interaction.user.id);

    if (newVote === 'sin') {
        confession.sinVotes.push(interaction.user.id);
    } else {
        confession.innocentVotes.push(interaction.user.id);
    }

    if (previousVote !== 'sin' && newVote === 'sin') {
        addUserStats(sinPoints, confession.guildId, confession.authorId, {
            points: 1,
            confessions: 0,
            sinVotesReceived: 1,
        });
    }

    if (previousVote === 'sin' && newVote !== 'sin') {
        addUserStats(sinPoints, confession.guildId, confession.authorId, {
            points: -1,
            confessions: 0,
            sinVotesReceived: -1,
        });
    }

    await saveJson(CONFESSIONS_FILE, confessions);
    await saveJson(SIN_POINTS_FILE, sinPoints);

    const sinVoteCount = confession.sinVotes.length;
    const innocentVoteCount = confession.innocentVotes.length;
    const expiresAtUnix = Math.floor(new Date(confession.expiresAt).getTime() / 1000);

    const updatedEmbed = createConfessionEmbed({
        confession: confession.confession,
        sinVotes: sinVoteCount,
        innocentVotes: innocentVoteCount,
        expiresAtUnix,
        closed: false,
    });

    const updatedComponents = createVoteComponents({
        sinVotes: sinVoteCount,
        innocentVotes: innocentVoteCount,
        disabled: false,
    });

    await interaction.message.edit({
        embeds: [updatedEmbed],
        components: updatedComponents,
        allowedMentions: {
            parse: [],
        },
    });

    await interaction.editReply({
        content: `Your anonymous vote has been recorded as **${formatVoteName(newVote)}**.`,
    });

    return true;
}

function scheduleConfessionClose(client, messageId, confession) {
    if (scheduledClosures.has(messageId)) {
        clearTimeout(scheduledClosures.get(messageId));
    }

    const expiresAtMs = new Date(confession.expiresAt).getTime();
    const delay = expiresAtMs - Date.now();

    if (delay <= 0) {
        closeConfession(client, messageId);
        return;
    }

    const timeout = setTimeout(() => {
        closeConfession(client, messageId);
    }, delay);

    scheduledClosures.set(messageId, timeout);
}

async function closeConfession(client, messageId) {
    const confessions = await loadJson(CONFESSIONS_FILE, {});
    const confession = confessions[messageId];

    if (!confession || confession.closed) {
        return;
    }

    const sinVotes = Array.isArray(confession.sinVotes) ? confession.sinVotes.length : 0;
    const innocentVotes = Array.isArray(confession.innocentVotes) ? confession.innocentVotes.length : 0;

    const closedEmbed = createConfessionEmbed({
        confession: confession.confession,
        sinVotes,
        innocentVotes,
        expiresAtUnix: null,
        closed: true,
    });

    const closedComponents = createVoteComponents({
        sinVotes,
        innocentVotes,
        disabled: true,
    });

    try {
        const channel = await client.channels.fetch(confession.channelId);
        const message = await channel.messages.fetch(messageId);

        await message.edit({
            embeds: [closedEmbed],
            components: closedComponents,
            allowedMentions: {
                parse: [],
            },
        });
    } catch (error) {
        console.error(`Failed to edit closed confession ${messageId}:`, error);
    }

    confessions[messageId] = {
        messageId,
        channelId: confession.channelId,
        guildId: confession.guildId,
        closed: true,
        closedAt: new Date().toISOString(),
        sinVoteCount: sinVotes,
        innocentVoteCount: innocentVotes,
    };

    await saveJson(CONFESSIONS_FILE, confessions);

    if (scheduledClosures.has(messageId)) {
        clearTimeout(scheduledClosures.get(messageId));
        scheduledClosures.delete(messageId);
    }
}

function createConfessionEmbed({ confession, sinVotes, innocentVotes, expiresAtUnix, closed }) {
    const embed = new EmbedBuilder()
        .setTitle(closed ? '😈 Anonymous Confession Closed' : '😈 Anonymous Confession')
        .setDescription(`> ${confession}`)
        .addFields(
            {
                name: 'How sinful is this?',
                value: closed ? 'Voting is closed.' : 'Vote below.',
                inline: false,
            },
            {
                name: '😈 Pure sin',
                value: `${sinVotes}`,
                inline: true,
            },
            {
                name: '😇 Innocent',
                value: `${innocentVotes}`,
                inline: true,
            },
            {
                name: 'Verdict',
                value: getVerdict(sinVotes, innocentVotes, closed),
                inline: false,
            }
        )
        .setFooter({
            text: closed ? 'Confession closed' : 'Anonymous confession',
        })
        .setTimestamp();

    if (!closed && expiresAtUnix) {
        embed.addFields({
            name: 'Closes',
            value: `<t:${expiresAtUnix}:R>`,
            inline: false,
        });
    }

    return embed;
}

function createVoteComponents({ sinVotes, innocentVotes, disabled }) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_SIN)
                .setLabel(`Pure sin (${sinVotes})`)
                .setEmoji('😈')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(BUTTON_INNOCENT)
                .setLabel(`I'm innocent (${innocentVotes})`)
                .setEmoji('😇')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled)
        ),
    ];
}

function getVerdict(sinVotes, innocentVotes, closed) {
    if (sinVotes > innocentVotes) {
        return closed
            ? '😈 Final verdict: sinful.'
            : '😈 The server currently judges this as sinful.';
    }

    if (innocentVotes > sinVotes) {
        return closed
            ? '😇 Final verdict: innocent.'
            : '😇 The server currently declares innocence.';
    }

    return closed
        ? '⚖️ Final verdict: undecided.'
        : '⚖️ The server is currently undecided.';
}

function isExpired(confession) {
    if (!confession.expiresAt) {
        return false;
    }

    return Date.now() >= new Date(confession.expiresAt).getTime();
}

function getPreviousVote(confession, userId) {
    if (confession.sinVotes.includes(userId)) {
        return 'sin';
    }

    if (confession.innocentVotes.includes(userId)) {
        return 'innocent';
    }

    return null;
}

function removeVote(confession, userId) {
    confession.sinVotes = confession.sinVotes.filter((id) => id !== userId);
    confession.innocentVotes = confession.innocentVotes.filter((id) => id !== userId);
}

function formatVoteName(vote) {
    return vote === 'sin' ? '😈 Pure sin' : '😇 Innocent';
}

function sanitizeConfession(text) {
    return String(text)
        .replace(/@everyone/g, '@\u200beveryone')
        .replace(/@here/g, '@\u200bhere')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000);
}

function addUserStats(data, guildId, userId, changes) {
    if (!data[guildId]) {
        data[guildId] = {};
    }

    if (!data[guildId][userId]) {
        data[guildId][userId] = {
            points: 0,
            confessions: 0,
            sinVotesReceived: 0,
        };
    }

    const stats = data[guildId][userId];

    stats.points = Math.max(0, stats.points + changes.points);
    stats.confessions = Math.max(0, stats.confessions + changes.confessions);
    stats.sinVotesReceived = Math.max(
        0,
        stats.sinVotesReceived + changes.sinVotesReceived
    );
}

async function loadTitles() {
    try {
        const raw = await fs.readFile(TITLES_FILE, 'utf8');
        const titles = JSON.parse(raw);

        if (!Array.isArray(titles)) {
            return fallbackTitles;
        }

        const validTitles = titles.filter((title) =>
            title &&
            Number.isFinite(Number(title.min)) &&
            typeof title.title === 'string' &&
            title.title.trim().length > 0
        );

        return validTitles.length > 0 ? validTitles : fallbackTitles;
    } catch (error) {
        console.error('Failed to load sin-titles.json:', error);
        return fallbackTitles;
    }
}

function getTitle(points, titles) {
    return [...titles]
        .sort((a, b) => Number(b.min) - Number(a.min))
        .find((title) => points >= Number(title.min))?.title ?? '😇 Pure Soul';
}

async function loadJson(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { ...fallback };
        }

        return data;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Failed to load ${filePath}:`, error);
        }

        return { ...fallback };
    }
}

async function saveJson(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
}