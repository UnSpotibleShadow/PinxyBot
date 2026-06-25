import {
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'auto-delete-channels.json'
);

const SWEEP_INTERVAL_MS = 60 * 1000;
const DEFAULT_SCAN_LIMIT = 500;
const MIN_MINUTES = 1;
const MAX_MINUTES = 10080; // 7 days

let sweepInterval = null;
let sweepInProgress = false;

export const data = new SlashCommandBuilder()
    .setName('autodelete')
    .setDescription('Configure automatic message deletion for text channels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((subcommand) =>
        subcommand
            .setName('set')
            .setDescription('Enable auto-delete for a channel.')
            .addChannelOption((option) =>
                option
                    .setName('channel')
                    .setDescription('The text channel to configure.')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(true)
            )
            .addIntegerOption((option) =>
                option
                    .setName('minutes')
                    .setDescription('Delete messages after this many minutes.')
                    .setMinValue(MIN_MINUTES)
                    .setMaxValue(MAX_MINUTES)
                    .setRequired(true)
            )
            .addBooleanOption((option) =>
                option
                    .setName('skip_pinned')
                    .setDescription('Should pinned messages be kept? Default: true.')
                    .setRequired(false)
            )
            .addIntegerOption((option) =>
                option
                    .setName('scan_limit')
                    .setDescription('How many recent messages to scan per sweep. Default: 500.')
                    .setMinValue(100)
                    .setMaxValue(1000)
                    .setRequired(false)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('disable')
            .setDescription('Disable auto-delete for a channel.')
            .addChannelOption((option) =>
                option
                    .setName('channel')
                    .setDescription('The text channel to disable.')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('list')
            .setDescription('List all auto-delete channel rules in this server.')
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('run')
            .setDescription('Run auto-delete cleanup now.')
            .addChannelOption((option) =>
                option
                    .setName('channel')
                    .setDescription('Optional channel to clean now.')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(false)
            )
    );

export async function init(client) {
    if (sweepInterval) {
        clearInterval(sweepInterval);
    }

    sweepInterval = setInterval(() => {
        runAutoDeleteSweep(client).catch((error) => {
            console.error('Auto-delete sweep failed:', error);
        });
    }, SWEEP_INTERVAL_MS);

    setTimeout(() => {
        runAutoDeleteSweep(client).catch((error) => {
            console.error('Initial auto-delete sweep failed:', error);
        });
    }, 10_000);

    console.log('Auto-delete sweep scheduled.');
}

export async function execute(interaction) {
    if (!memberCanConfigureAutoDelete(interaction)) {
        await interaction.reply({
            content: 'You need **Manage Channels** to configure auto-delete.',
            ephemeral: true,
        });

        return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set') {
        await setAutoDelete(interaction);
        return;
    }

    if (subcommand === 'disable') {
        await disableAutoDelete(interaction);
        return;
    }

    if (subcommand === 'list') {
        await listAutoDeleteRules(interaction);
        return;
    }

    if (subcommand === 'run') {
        await runAutoDeleteNow(interaction);
    }
}

async function setAutoDelete(interaction) {
    const channel = interaction.options.getChannel('channel', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const skipPinned = interaction.options.getBoolean('skip_pinned') ?? true;
    const scanLimit = interaction.options.getInteger('scan_limit') ?? DEFAULT_SCAN_LIMIT;

    const permissionError = getBotPermissionError(channel, interaction);

    if (permissionError) {
        await interaction.reply({
            content: permissionError,
            ephemeral: true,
        });

        return;
    }

    const config = await loadJson(CONFIG_FILE, {});
    const guildConfig = getGuildConfig(config, interaction.guildId);

    guildConfig[channel.id] = {
        guildId: interaction.guildId,
        channelId: channel.id,
        minutes,
        skipPinned,
        scanLimit,
        enabled: true,
        configuredById: interaction.user.id,
        configuredAt: new Date().toISOString(),
        noticeMessageId: null,
        noticeMessageUrl: null,
        lastSweepAt: null,
        lastDeletedCount: 0,
        lastError: null,
    };

    await saveJson(CONFIG_FILE, config);

    let noticeMessage = null;

    try {
        noticeMessage = await channel.send({
            embeds: [
                createAutoDeleteNoticeEmbed({
                    channel,
                    minutes,
                    skipPinned,
                    scanLimit,
                    configuredBy: interaction.user,
                }),
            ],
            allowedMentions: {
                parse: [],
            },
        });

        guildConfig[channel.id].noticeMessageId = noticeMessage.id;
        guildConfig[channel.id].noticeMessageUrl = noticeMessage.url;

        await saveJson(CONFIG_FILE, config);
    } catch (error) {
        console.error(`Failed to send auto-delete notice in ${channel.id}:`, error);
    }

    await interaction.reply({
        content: [
            `Auto-delete enabled for ${channel}.`,
            '',
            `Messages older than **${minutes} minute${minutes === 1 ? '' : 's'}** will be deleted.`,
            `Pinned messages: **${skipPinned ? 'kept' : 'deleted too'}**`,
            `Scan limit per sweep: **${scanLimit}** recent messages`,
            '',
            noticeMessage
                ? `I posted a notice in the channel: ${noticeMessage.url}`
                : 'Auto-delete was enabled, but I could not post the channel notice.',
            skipPinned
                ? 'You can pin the notice message so it stays visible.'
                : 'Warning: pinned messages are not protected with this setting.',
        ].join('\n'),
        ephemeral: true,
    });
}

async function disableAutoDelete(interaction) {
    const channel = interaction.options.getChannel('channel', true);

    const config = await loadJson(CONFIG_FILE, {});
    const guildConfig = getGuildConfig(config, interaction.guildId);

    if (!guildConfig[channel.id]) {
        await interaction.reply({
            content: `${channel} does not have auto-delete enabled.`,
            ephemeral: true,
        });

        return;
    }

    delete guildConfig[channel.id];

    await saveJson(CONFIG_FILE, config);

    await interaction.reply({
        content: `Auto-delete disabled for ${channel}.`,
        ephemeral: true,
    });
}
function createAutoDeleteNoticeEmbed({ channel, minutes, skipPinned, scanLimit, configuredBy }) {
    return new EmbedBuilder()
        .setTitle('🧹 Auto-delete is enabled in this channel')
        .setDescription([
            `Messages in ${channel} are automatically cleaned up by PinxyBot.`,
            '',
            `Messages older than **${minutes} minute${minutes === 1 ? '' : 's'}** may be deleted.`,
            '',
            skipPinned
                ? '📌 **Pinned messages are kept.** Pin important information if it should stay visible.'
                : '⚠️ **Pinned messages are not protected.** Even pinned messages may be deleted.',
        ].join('\n'))
        .addFields(
            {
                name: 'Cleanup interval',
                value: 'PinxyBot checks configured channels about once per minute.',
                inline: false,
            },
            {
                name: 'Scan limit',
                value: `${scanLimit} recent messages per cleanup sweep.`,
                inline: true,
            },
            {
                name: 'Configured by',
                value: `${configuredBy}`,
                inline: true,
            }
        )
        .setFooter({
            text: 'Staff may pin this notice to keep it visible.',
        })
        .setTimestamp();
}
async function listAutoDeleteRules(interaction) {
    const config = await loadJson(CONFIG_FILE, {});
    const guildConfig = config[interaction.guildId] ?? {};

    const rules = Object.values(guildConfig)
        .filter((rule) => rule.enabled)
        .sort((a, b) => a.channelId.localeCompare(b.channelId));

    if (rules.length === 0) {
        await interaction.reply({
            content: 'No auto-delete rules are configured for this server.',
            ephemeral: true,
        });

        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('🧹 Auto-delete Rules')
        .setDescription(
            rules.map((rule) => {
                return [
                    `**<#${rule.channelId}>**`,
                    `Delete after: **${rule.minutes} minute${rule.minutes === 1 ? '' : 's'}**`,
                    `Pinned messages: **${rule.skipPinned ? 'kept' : 'deleted too'}**`,
                    `Scan limit: **${rule.scanLimit ?? DEFAULT_SCAN_LIMIT}**`,
                    rule.lastSweepAt
                        ? `Last sweep: <t:${Math.floor(new Date(rule.lastSweepAt).getTime() / 1000)}:R>`
                        : 'Last sweep: not yet',
                    `Last deleted: **${rule.lastDeletedCount ?? 0}**`,
                    rule.lastError ? `Last error: \`${truncate(rule.lastError, 120)}\`` : null,
                ].filter(Boolean).join('\n');
            }).join('\n\n')
        )
        .setFooter({
            text: 'Cleanup runs about once per minute.',
        })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true,
    });
}

async function runAutoDeleteNow(interaction) {
    const channel = interaction.options.getChannel('channel');

    await interaction.deferReply({
        ephemeral: true,
    });

    const result = await runAutoDeleteSweep(interaction.client, {
        guildId: interaction.guildId,
        channelId: channel?.id ?? null,
        force: true,
    });

    await interaction.editReply({
        content: [
            'Auto-delete cleanup finished.',
            '',
            `Channels checked: **${result.channelsChecked}**`,
            `Messages deleted: **${result.messagesDeleted}**`,
            result.errors.length
                ? `Errors: \`${truncate(result.errors.join(' | '), 800)}\``
                : 'Errors: **0**',
        ].join('\n'),
    });
}

async function runAutoDeleteSweep(client, options = {}) {
    const {
        guildId = null,
        channelId = null,
        force = false,
    } = options;

    if (sweepInProgress && !force) {
        return {
            channelsChecked: 0,
            messagesDeleted: 0,
            errors: ['Sweep already in progress.'],
        };
    }

    sweepInProgress = true;

    const result = {
        channelsChecked: 0,
        messagesDeleted: 0,
        errors: [],
    };

    try {
        const config = await loadJson(CONFIG_FILE, {});

        for (const [configuredGuildId, guildConfig] of Object.entries(config)) {
            if (guildId && configuredGuildId !== guildId) {
                continue;
            }

            for (const [configuredChannelId, rule] of Object.entries(guildConfig)) {
                if (channelId && configuredChannelId !== channelId) {
                    continue;
                }

                if (!rule.enabled) {
                    continue;
                }

                result.channelsChecked++;

                try {
                    const deletedCount = await sweepChannel(client, rule);

                    rule.lastSweepAt = new Date().toISOString();
                    rule.lastDeletedCount = deletedCount;
                    rule.lastError = null;

                    result.messagesDeleted += deletedCount;
                } catch (error) {
                    console.error(`Auto-delete failed for channel ${configuredChannelId}:`, error);

                    rule.lastSweepAt = new Date().toISOString();
                    rule.lastDeletedCount = 0;
                    rule.lastError = error.message;

                    result.errors.push(`${configuredChannelId}: ${error.message}`);
                }
            }
        }

        await saveJson(CONFIG_FILE, config);
    } finally {
        sweepInProgress = false;
    }

    return result;
}

async function sweepChannel(client, rule) {
    const channel = await client.channels.fetch(rule.channelId);

    if (!channel || !channel.isTextBased() || !channel.messages) {
        throw new Error('Channel is not a text channel or could not be fetched.');
    }

    const minutes = clampNumber(rule.minutes, MIN_MINUTES, MAX_MINUTES, MIN_MINUTES);
    const scanLimit = clampNumber(rule.scanLimit, 100, 1000, DEFAULT_SCAN_LIMIT);
    const skipPinned = rule.skipPinned !== false;

    const cutoffTimestamp = Date.now() - minutes * 60 * 1000;

    let before = null;
    let scanned = 0;
    let deletedCount = 0;

    while (scanned < scanLimit) {
        const limit = Math.min(100, scanLimit - scanned);

        const messages = await channel.messages.fetch({
            limit,
            before: before ?? undefined,
        });

        if (messages.size === 0) {
            break;
        }

        scanned += messages.size;

        const oldestMessage = messages.last();
        before = oldestMessage?.id ?? before;

        const expiredMessages = messages.filter((message) => {
            if (message.createdTimestamp > cutoffTimestamp) {
                return false;
            }

            if (skipPinned && message.pinned) {
                return false;
            }

            if (message.system) {
                return false;
            }

            return true;
        });

        deletedCount += await deleteMessages(channel, expiredMessages);

        if (messages.size < limit) {
            break;
        }
    }

    return deletedCount;
}

async function deleteMessages(channel, messages) {
    if (!messages || messages.size === 0) {
        return 0;
    }

    const deletableMessages = messages.filter((message) => message.deletable);

    if (deletableMessages.size === 0) {
        return 0;
    }

    if (deletableMessages.size === 1) {
        const message = deletableMessages.first();

        try {
            await message.delete();
            return 1;
        } catch (error) {
            console.error(`Failed to delete message ${message.id}:`, error);
            return 0;
        }
    }

    try {
        const deleted = await channel.bulkDelete(deletableMessages, true);
        return deleted.size;
    } catch (error) {
        console.error('Bulk delete failed, falling back to single deletes:', error);

        let deletedCount = 0;

        for (const message of deletableMessages.values()) {
            try {
                await message.delete();
                deletedCount++;
            } catch {
                // Ignore individual delete failures.
            }
        }

        return deletedCount;
    }
}

function getBotPermissionError(channel, interaction) {
    const botMember = interaction.guild?.members.me;

    if (!botMember) {
        return 'I could not check my permissions in that channel.';
    }

    const permissions = channel.permissionsFor(botMember);

    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
        return `I cannot view ${channel}.`;
    }

    if (!permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
        return `I need **Read Message History** in ${channel}.`;
    }

    if (!permissions.has(PermissionFlagsBits.ManageMessages)) {
        return `I need **Manage Messages** in ${channel}.`;
    }

    return null;
}

function memberCanConfigureAutoDelete(interaction) {
    const permissions = interaction.memberPermissions;

    if (!permissions) {
        return false;
    }

    return (
        permissions.has(PermissionFlagsBits.ManageChannels) ||
        permissions.has(PermissionFlagsBits.Administrator)
    );
}

function getGuildConfig(config, guildId) {
    if (!config[guildId]) {
        config[guildId] = {};
    }

    return config[guildId];
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, number));
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 3)}...`;
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