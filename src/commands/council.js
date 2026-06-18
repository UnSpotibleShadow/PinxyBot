import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder,
} from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COUNCIL_ROLE_ID = '1517096790053097564';
const COUNCIL_CLOSER_ROLE_ID = '1516526178788184095';
const QUORUM_MANAGER_ROLE_ID = '1517115919153758310';

const BALLOTS_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'council-ballots.json'
);

const BALLOT_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
const ALL_VOTED_GRACE_MS = 60 * 1000;

const QUORUM_REQUIRED = 5;
const EXPECTED_COUNCIL_SIZE = 7;
const VOTE_CHANGE_LIMIT = 1;

const VOTE_FOR = 'council:vote:for';
const VOTE_AGAINST = 'council:vote:against';
const VOTE_ABSTAIN = 'council:vote:abstain';
const REQUIRE_QUORUM = 'council:quorum:require';

const scheduledClosures = new Map();

export const data = new SlashCommandBuilder()
    .setName('council')
    .setDescription('Council voting system.')
    .addSubcommand((subcommand) =>
        subcommand
            .setName('ballot')
            .setDescription('Create a council ballot.')
            .addStringOption((option) =>
                option
                    .setName('motion')
                    .setDescription('Motion number or label. Example: 1058')
                    .setRequired(true)
                    .setMaxLength(80)
            )
            .addStringOption((option) =>
                option
                    .setName('title')
                    .setDescription('Short title for the motion.')
                    .setRequired(true)
                    .setMaxLength(200)
            )
            .addStringOption((option) =>
                option
                    .setName('link')
                    .setDescription('Full motion description link.')
                    .setRequired(true)
                    .setMaxLength(500)
            )
            .addStringOption((option) =>
                option
                    .setName('summary')
                    .setDescription('Optional short summary shown on the ballot.')
                    .setRequired(false)
                    .setMaxLength(800)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('close')
            .setDescription('Close a council ballot early.')
            .addStringOption((option) =>
                option
                    .setName('message_id')
                    .setDescription('The message ID of the ballot.')
                    .setRequired(true)
                    .setMaxLength(40)
            )
            .addStringOption((option) =>
                option
                    .setName('reason')
                    .setDescription('Why is this ballot being closed early?')
                    .setRequired(true)
                    .setMaxLength(500)
            )
    );

export async function init(client) {
    const ballots = await loadJson(BALLOTS_FILE, {});
    let scheduledCount = 0;

    for (const [messageId, ballot] of Object.entries(ballots)) {
        if (ballot.closed) {
            continue;
        }

        if (!ballot.expiresAt) {
            const createdAtMs = ballot.createdAt
                ? new Date(ballot.createdAt).getTime()
                : Date.now();

            ballot.expiresAt = new Date(createdAtMs + BALLOT_DURATION_MS).toISOString();
        }

        if (ballot.pendingCloseAt) {
            schedulePendingClose(client, messageId, ballot);
            scheduledCount++;
            continue;
        }

        if (isExpired(ballot)) {
            await closeCouncilBallot(client, messageId, {
                closeType: 'expired',
            });

            continue;
        }

        if (hasAllEligibleMembersVoted(ballot)) {
            await startAllVotesCastGracePeriod(client, messageId, {
                lastVoterId: ballot.lastVoteUserId ?? null,
                announce: true,
            });

            scheduledCount++;
            continue;
        }

        scheduleBallotExpiration(client, messageId, ballot);
        scheduledCount++;
    }

    await saveJson(BALLOTS_FILE, ballots);

    console.log(`Scheduled ${scheduledCount} active council ballot closure(s).`);
}

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'ballot') {
        if (!memberHasRole(interaction, COUNCIL_ROLE_ID)) {
            await interaction.reply({
                content: 'Only council members can create council ballots.',
                ephemeral: true,
            });

            return;
        }

        await createCouncilBallot(interaction);
        return;
    }

    if (subcommand === 'close') {
        if (!memberHasRole(interaction, COUNCIL_CLOSER_ROLE_ID)) {
            await interaction.reply({
                content: 'Only authorized council closers can close a ballot early.',
                ephemeral: true,
            });

            return;
        }

        await closeCouncilBallotFromCommand(interaction);
    }
}

export async function handleButtonInteraction(interaction) {
    const councilButtonIds = [
        VOTE_FOR,
        VOTE_AGAINST,
        VOTE_ABSTAIN,
        REQUIRE_QUORUM,
    ];

    if (!councilButtonIds.includes(interaction.customId)) {
        return false;
    }

    if (interaction.customId === REQUIRE_QUORUM) {
        await handleRequireQuorumButton(interaction);
        return true;
    }

    await handleVoteButton(interaction);
    return true;
}

async function createCouncilBallot(interaction) {
    await interaction.deferReply({
        ephemeral: true,
    });

    if (!interaction.guildId || !interaction.guild || !interaction.channel) {
        await interaction.editReply({
            content: 'Council ballots can only be created inside a server channel.',
        });

        return;
    }

    const eligibleVoterIds = await getCouncilMemberIds(interaction.guild);

    if (eligibleVoterIds.length === 0) {
        await interaction.editReply({
            content: 'This ballot cannot be created because no eligible council members were found.',
        });

        return;
    }

    const motionInput = interaction.options.getString('motion', true);
    const title = interaction.options.getString('title', true).trim();
    const linkInput = interaction.options.getString('link', true).trim();
    const summary = interaction.options.getString('summary')?.trim() ?? null;

    const motionLabel = normalizeMotionLabel(motionInput);
    const motionUrl = normalizeUrl(linkInput);

    if (!motionUrl) {
        await interaction.editReply({
            content: 'Please provide a valid `http://` or `https://` link for the full motion description.',
        });

        return;
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + BALLOT_DURATION_MS);
    const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);

    const ballot = {
        messageId: null,
        channelId: interaction.channel.id,
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        motionLabel,
        motionTitle: title,
        motionUrl,
        summary,
        eligibleVoterIds,
        votes: {},
        voteChanges: {},
        voteOrder: [],
        lastVoteUserId: null,
        quorumEnabled: false,
        quorumRequired: null,
        quorumEnabledById: null,
        quorumEnabledAt: null,
        expectedCouncilSize: EXPECTED_COUNCIL_SIZE,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        pendingCloseStartedAt: null,
        pendingCloseAt: null,
        pendingCloseLastVoterId: null,
        closingAnnouncementId: null,
        closed: false,
    };

    const message = await interaction.channel.send({
        embeds: [
            createCouncilBallotEmbed({
                ballot,
                expiresAtUnix,
                closed: false,
            }),
        ],
        components: createVoteComponents({
            ballot,
            disabled: false,
        }),
        allowedMentions: {
            parse: [],
        },
    });

    ballot.messageId = message.id;

    const ballots = await loadJson(BALLOTS_FILE, {});
    ballots[message.id] = ballot;

    await saveJson(BALLOTS_FILE, ballots);

    scheduleBallotExpiration(interaction.client, message.id, ballot);

    await interaction.editReply({
        content: [
            'Council ballot created.',
            message.url,
            '',
            `Voting closes <t:${expiresAtUnix}:R>.`,
            `Eligible voters detected: **${eligibleVoterIds.length}**.`,
            'Quorum is **not required** by default.',
        ].join('\n'),
    });
}

async function closeCouncilBallotFromCommand(interaction) {
    await interaction.deferReply({
        ephemeral: true,
    });

    const messageId = interaction.options.getString('message_id', true).trim();
    const reason = interaction.options.getString('reason', true).trim();

    const result = await closeCouncilBallot(interaction.client, messageId, {
        closeType: 'manual',
        closedById: interaction.user.id,
        closeReason: reason,
    });

    if (!result.ok) {
        await interaction.editReply({
            content: result.message,
        });

        return;
    }

    await interaction.editReply({
        content: [
            'Council ballot closed early.',
            `Final result: **${result.verdict}**.`,
            `Reason: ${reason}`,
        ].join('\n'),
    });
}

async function handleVoteButton(interaction) {
    if (!memberHasRole(interaction, COUNCIL_ROLE_ID)) {
        await interaction.reply({
            content: 'Only council members can vote on council ballots.',
            ephemeral: true,
        });

        return;
    }

    await interaction.deferReply({
        ephemeral: true,
    });

    const ballots = await loadJson(BALLOTS_FILE, {});
    const ballot = ballots[interaction.message.id];

    if (!ballot) {
        await interaction.editReply({
            content: 'This council ballot could not be found.',
        });

        return;
    }

    normalizeBallotShape(ballot);

    if (ballot.closed) {
        await interaction.editReply({
            content: 'This council ballot is already closed.',
        });

        return;
    }

    if (!isEligibleVoter(ballot, interaction.user.id)) {
        await interaction.editReply({
            content: 'You were not an eligible voter when this ballot was created.',
        });

        return;
    }

    if (isExpired(ballot)) {
        const result = await closeCouncilBallot(interaction.client, interaction.message.id, {
            closeType: 'expired',
        });

        await interaction.editReply({
            content: result.ok
                ? 'This council ballot has already closed.'
                : result.message,
        });

        return;
    }

    if (ballot.pendingCloseAt && interaction.user.id !== ballot.pendingCloseLastVoterId) {
        await interaction.editReply({
            content: [
                'All eligible votes have already been cast.',
                'The ballot is in its final 1-minute grace period.',
                'Only the last voter may change their vote during this grace period.',
            ].join('\n'),
        });

        return;
    }

    const newVote = getVoteFromCustomId(interaction.customId);
    const previousVote = ballot.votes[interaction.user.id] ?? null;

    if (previousVote === newVote) {
        await interaction.editReply({
            content: `You already voted **${formatVote(newVote)}** on this ballot.`,
        });

        return;
    }

    if (previousVote && previousVote !== newVote) {
        const usedChanges = ballot.voteChanges[interaction.user.id] ?? 0;

        if (usedChanges >= VOTE_CHANGE_LIMIT) {
            await interaction.editReply({
                content: 'You have already used your one allowed vote change for this ballot.',
            });

            return;
        }

        ballot.voteChanges[interaction.user.id] = usedChanges + 1;
    }

    ballot.votes[interaction.user.id] = newVote;

    if (!previousVote && !ballot.voteOrder.includes(interaction.user.id)) {
        ballot.voteOrder.push(interaction.user.id);
    }

    if (!ballot.pendingCloseAt) {
        ballot.lastVoteUserId = interaction.user.id;
    }

    await saveJson(BALLOTS_FILE, ballots);

    if (!ballot.pendingCloseAt && hasAllEligibleMembersVoted(ballot)) {
        const result = await startAllVotesCastGracePeriod(interaction.client, interaction.message.id, {
            lastVoterId: interaction.user.id,
            announce: true,
        });

        await interaction.editReply({
            content: [
                previousVote
                    ? `Your vote has been updated to **${formatVote(newVote)}**.`
                    : `Your vote has been recorded as **${formatVote(newVote)}**.`,
                '',
                result.ok
                    ? 'All eligible votes have now been cast. The ballot will close in 1 minute.'
                    : result.message,
            ].join('\n'),
        });

        return;
    }

    await editBallotMessage(interaction.client, interaction.message.id);

    await interaction.editReply({
        content: previousVote
            ? `Your vote has been updated to **${formatVote(newVote)}**.`
            : `Your vote has been recorded as **${formatVote(newVote)}**.`,
    });
}

async function handleRequireQuorumButton(interaction) {
    if (!memberHasRole(interaction, QUORUM_MANAGER_ROLE_ID)) {
        await interaction.reply({
            content: 'Only authorized quorum managers can require quorum for council ballots.',
            ephemeral: true,
        });

        return;
    }

    await interaction.deferReply({
        ephemeral: true,
    });

    const ballots = await loadJson(BALLOTS_FILE, {});
    const ballot = ballots[interaction.message.id];

    if (!ballot) {
        await interaction.editReply({
            content: 'This council ballot could not be found.',
        });

        return;
    }

    normalizeBallotShape(ballot);

    if (ballot.closed) {
        await interaction.editReply({
            content: 'This council ballot is already closed.',
        });

        return;
    }

    if (ballot.quorumEnabled) {
        await interaction.editReply({
            content: 'Quorum is already required for this ballot.',
        });

        return;
    }

    if (getEligibleVoterCount(ballot) < QUORUM_REQUIRED) {
        await interaction.editReply({
            content: [
                'Quorum cannot be required on this ballot because fewer than 5 eligible voters were detected when it was created.',
                '',
                `Eligible voters: **${getEligibleVoterCount(ballot)}**`,
                `Quorum required: **${QUORUM_REQUIRED}**`,
            ].join('\n'),
        });

        return;
    }

    ballot.quorumEnabled = true;
    ballot.quorumRequired = QUORUM_REQUIRED;
    ballot.quorumEnabledById = interaction.user.id;
    ballot.quorumEnabledAt = new Date().toISOString();

    await saveJson(BALLOTS_FILE, ballots);

    await editBallotMessage(interaction.client, interaction.message.id);

    await interaction.editReply({
        content: `Quorum is now required for this council ballot: **${QUORUM_REQUIRED}/${EXPECTED_COUNCIL_SIZE}**.`,
    });
}

async function startAllVotesCastGracePeriod(client, messageId, options = {}) {
    const {
        lastVoterId = null,
        announce = true,
    } = options;

    const ballots = await loadJson(BALLOTS_FILE, {});
    const ballot = ballots[messageId];

    if (!ballot) {
        return {
            ok: false,
            message: 'That council ballot could not be found.',
        };
    }

    normalizeBallotShape(ballot);

    if (ballot.closed) {
        return {
            ok: false,
            message: 'That council ballot is already closed.',
        };
    }

    if (ballot.pendingCloseAt) {
        schedulePendingClose(client, messageId, ballot);

        return {
            ok: true,
            message: 'The ballot is already in its final grace period.',
        };
    }

    const now = new Date();
    const pendingCloseAt = new Date(now.getTime() + ALL_VOTED_GRACE_MS);
    const pendingCloseAtUnix = Math.floor(pendingCloseAt.getTime() / 1000);

    ballot.pendingCloseStartedAt = now.toISOString();
    ballot.pendingCloseAt = pendingCloseAt.toISOString();
    ballot.pendingCloseLastVoterId = lastVoterId;

    await saveJson(BALLOTS_FILE, ballots);

    schedulePendingClose(client, messageId, ballot);

    try {
        const channel = await client.channels.fetch(ballot.channelId);
        const message = await channel.messages.fetch(messageId);

        await message.edit({
            embeds: [
                createCouncilBallotEmbed({
                    ballot,
                    expiresAtUnix: Math.floor(new Date(ballot.expiresAt).getTime() / 1000),
                    closed: false,
                }),
            ],
            components: createVoteComponents({
                ballot,
                disabled: false,
            }),
            allowedMentions: {
                parse: [],
            },
        });

        if (announce && !ballot.closingAnnouncementId) {
            const announcement = await channel.send({
                content: [
                    `🏛️ **Council ballot closing soon:** [${escapeMarkdown(ballot.motionLabel)}](${message.url})`,
                    '',
                    'All eligible council members have voted.',
                    `The ballot will close <t:${pendingCloseAtUnix}:R>.`,
                    ballot.pendingCloseLastVoterId
                        ? `The last voter, <@${ballot.pendingCloseLastVoterId}>, may use their one vote change during this grace period if needed.`
                        : 'The final 1-minute grace period has started.',
                ].join('\n'),
                allowedMentions: {
                    parse: [],
                },
            });

            const latestBallots = await loadJson(BALLOTS_FILE, {});
            if (latestBallots[messageId]) {
                latestBallots[messageId].closingAnnouncementId = announcement.id;
                await saveJson(BALLOTS_FILE, latestBallots);
            }
        }
    } catch (error) {
        console.error(`Failed to announce closing council ballot ${messageId}:`, error);
    }

    return {
        ok: true,
        message: 'The ballot is now in its final 1-minute grace period.',
    };
}

function scheduleBallotExpiration(client, messageId, ballot) {
    if (scheduledClosures.has(messageId)) {
        clearTimeout(scheduledClosures.get(messageId));
    }

    const expiresAtMs = new Date(ballot.expiresAt).getTime();
    const delay = expiresAtMs - Date.now();

    if (delay <= 0) {
        closeCouncilBallot(client, messageId, {
            closeType: 'expired',
        });

        return;
    }

    const timeout = setTimeout(() => {
        closeCouncilBallot(client, messageId, {
            closeType: 'expired',
        });
    }, delay);

    scheduledClosures.set(messageId, timeout);
}

function schedulePendingClose(client, messageId, ballot) {
    if (scheduledClosures.has(messageId)) {
        clearTimeout(scheduledClosures.get(messageId));
    }

    const pendingCloseAtMs = new Date(ballot.pendingCloseAt).getTime();
    const delay = pendingCloseAtMs - Date.now();

    if (delay <= 0) {
        closeCouncilBallot(client, messageId, {
            closeType: 'all_voted',
        });

        return;
    }

    const timeout = setTimeout(() => {
        closeCouncilBallot(client, messageId, {
            closeType: 'all_voted',
        });
    }, delay);

    scheduledClosures.set(messageId, timeout);
}

async function closeCouncilBallot(client, messageId, options = {}) {
    const {
        closeType = 'expired',
        closedById = null,
        closeReason = null,
    } = options;

    const ballots = await loadJson(BALLOTS_FILE, {});
    const ballot = ballots[messageId];

    if (!ballot) {
        return {
            ok: false,
            message: 'That council ballot could not be found.',
        };
    }

    normalizeBallotShape(ballot);

    if (ballot.closed) {
        return {
            ok: false,
            message: 'That council ballot is already closed.',
        };
    }

    const counts = getVoteCounts(ballot);
    const verdict = getFinalVerdict(ballot, counts);

    ballot.closed = true;
    ballot.closedAt = new Date().toISOString();
    ballot.closeType = closeType;
    ballot.closedById = closedById;
    ballot.closeReason = closeReason;
    ballot.finalCounts = counts;
    ballot.finalVerdict = verdict;

    await saveJson(BALLOTS_FILE, ballots);

    if (scheduledClosures.has(messageId)) {
        clearTimeout(scheduledClosures.get(messageId));
        scheduledClosures.delete(messageId);
    }

    try {
        const channel = await client.channels.fetch(ballot.channelId);
        const message = await channel.messages.fetch(messageId);

        await message.edit({
            embeds: [
                createCouncilBallotEmbed({
                    ballot,
                    expiresAtUnix: null,
                    closed: true,
                }),
            ],
            components: createVoteComponents({
                ballot,
                disabled: true,
            }),
            allowedMentions: {
                parse: [],
            },
        });
    } catch (error) {
        console.error(`Failed to edit closed council ballot ${messageId}:`, error);
    }

    return {
        ok: true,
        verdict,
        counts,
    };
}

async function editBallotMessage(client, messageId) {
    const ballots = await loadJson(BALLOTS_FILE, {});
    const ballot = ballots[messageId];

    if (!ballot) {
        return;
    }

    normalizeBallotShape(ballot);

    const expiresAtUnix = ballot.pendingCloseAt
        ? Math.floor(new Date(ballot.expiresAt).getTime() / 1000)
        : Math.floor(new Date(ballot.expiresAt).getTime() / 1000);

    try {
        const channel = await client.channels.fetch(ballot.channelId);
        const message = await channel.messages.fetch(messageId);

        await message.edit({
            embeds: [
                createCouncilBallotEmbed({
                    ballot,
                    expiresAtUnix,
                    closed: false,
                }),
            ],
            components: createVoteComponents({
                ballot,
                disabled: false,
            }),
            allowedMentions: {
                parse: [],
            },
        });
    } catch (error) {
        console.error(`Failed to edit council ballot ${messageId}:`, error);
    }
}

function createCouncilBallotEmbed({ ballot, expiresAtUnix, closed }) {
    const counts = getVoteCounts(ballot);
    const totalVotes = counts.for + counts.against + counts.abstain;
    const eligibleCount = getEligibleVoterCount(ballot);
    const pendingCount = Math.max(0, eligibleCount - totalVotes);
    const RESULT_DISCLAIMER = 'Disclaimer: This module is still under development, any issues can arise in the process. The result shown may not be the correct result and will always have to follow the rules.';

    const embed = new EmbedBuilder()
        .setTitle(closed ? '🏛️ Council Ballot Closed' : '🏛️ Council Ballot')
        .setDescription([
            `## ${escapeMarkdown(ballot.motionTitle)}`,
            '',
            ballot.summary ? `${escapeMarkdown(ballot.summary)}` : null,
            '',
            `Full motion: [${escapeMarkdown(ballot.motionLabel)}](${ballot.motionUrl})`,
        ].filter(Boolean).join('\n'))
        .addFields(
            {
                name: 'Voting progress',
                value: `${totalVotes}/${eligibleCount} eligible voters have voted.`,
                inline: true,
            },
            {
                name: 'Pending voters',
                value: `${pendingCount}`,
                inline: true,
            },
            {
                name: 'Quorum',
                value: getQuorumStatusText(ballot),
                inline: true,
            },
            {
                name: 'Eligible voters',
                value: formatEligibleVoters(ballot),
                inline: false,
            }
        )
        .setFooter({
            text: closed
                ? 'Council vote closed'
                : 'Vote totals are hidden while the ballot is open.',
        })
        .setTimestamp();

    if (!closed) {
        embed.addFields({
            name: 'Current result',
            value: 'Hidden until the ballot closes.',
            inline: false,
        });

        if (ballot.pendingCloseAt) {
            embed.addFields({
                name: 'Closing soon',
                value: [
                    'All eligible voters have voted.',
                    `This ballot closes <t:${Math.floor(new Date(ballot.pendingCloseAt).getTime() / 1000)}:R>.`,
                    ballot.pendingCloseLastVoterId
                        ? `Last voter allowed final change: <@${ballot.pendingCloseLastVoterId}>`
                        : null,
                ].filter(Boolean).join('\n'),
                inline: false,
            });
        } else if (expiresAtUnix) {
            embed.addFields({
                name: 'Closes',
                value: `<t:${expiresAtUnix}:R>`,
                inline: true,
            });

            embed.addFields({
                name: 'Auto-close',
                value: 'This ballot starts a 1-minute closing timer once all eligible voters have voted.',
                inline: false,
            });
        }

        if (ballot.quorumEnabled) {
            embed.addFields({
                name: 'Quorum enabled by',
                value: ballot.quorumEnabledById ? `<@${ballot.quorumEnabledById}>` : 'Unknown',
                inline: true,
            });
        }

        return embed;
    }

    embed.addFields(
        {
            name: 'Final result',
            value: getFinalVerdict(ballot, counts),
            inline: false,
        },
        {
            name: 'Final tally',
            value: [
                `✅ For: **${counts.for}**`,
                `❌ Against: **${counts.against}**`,
                `⚪ Abstain: **${counts.abstain}**`,
            ].join('\n'),
            inline: false,
        },
        {
            name: 'Closed because',
            value: getCloseReasonText(ballot),
            inline: false,
        }
    );

    if (ballot.closeType === 'manual') {
        embed.addFields(
            {
                name: 'Closed early by',
                value: ballot.closedById ? `<@${ballot.closedById}>` : 'Unknown',
                inline: true,
            },
            {
                name: 'Early close reason',
                value: escapeMarkdown(ballot.closeReason ?? 'No reason provided.'),
                inline: false,
            }
        );
    }

    return embed;
}

function createVoteComponents({ ballot, disabled }) {
    const quorumButtonDisabled = disabled || ballot.quorumEnabled;

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(VOTE_FOR)
                .setLabel('For')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(VOTE_AGAINST)
                .setLabel('Against')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(VOTE_ABSTAIN)
                .setLabel('Abstain')
                .setEmoji('⚪')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(REQUIRE_QUORUM)
                .setLabel(ballot.quorumEnabled ? 'Quorum Required' : 'Require Quorum 5/7')
                .setEmoji('📌')
                .setStyle(ballot.quorumEnabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(quorumButtonDisabled)
        ),
    ];
}

async function getCouncilMemberIds(guild) {
    await guild.members.fetch();

    return guild.members.cache
        .filter((member) =>
            !member.user.bot &&
            member.roles.cache.has(COUNCIL_ROLE_ID)
        )
        .map((member) => member.id)
        .sort();
}

function memberHasRole(interaction, roleId) {
    const roles = interaction.member?.roles;

    if (!roles) {
        return false;
    }

    if (roles.cache) {
        return roles.cache.has(roleId);
    }

    if (Array.isArray(roles)) {
        return roles.includes(roleId);
    }

    return false;
}

function normalizeBallotShape(ballot) {
    if (!ballot.votes || typeof ballot.votes !== 'object' || Array.isArray(ballot.votes)) {
        ballot.votes = {};
    }

    if (!ballot.voteChanges || typeof ballot.voteChanges !== 'object' || Array.isArray(ballot.voteChanges)) {
        ballot.voteChanges = {};
    }

    if (!Array.isArray(ballot.voteOrder)) {
        ballot.voteOrder = [];
    }

    if (!Array.isArray(ballot.eligibleVoterIds)) {
        ballot.eligibleVoterIds = [];
    }

    if (typeof ballot.quorumEnabled !== 'boolean') {
        ballot.quorumEnabled = false;
    }

    if (!Object.prototype.hasOwnProperty.call(ballot, 'quorumRequired')) {
        ballot.quorumRequired = null;
    }
}

function isEligibleVoter(ballot, userId) {
    if (!Array.isArray(ballot.eligibleVoterIds)) {
        return false;
    }

    return ballot.eligibleVoterIds.includes(userId);
}

function hasAllEligibleMembersVoted(ballot) {
    if (!Array.isArray(ballot.eligibleVoterIds) || ballot.eligibleVoterIds.length === 0) {
        return false;
    }

    const votes = ballot.votes && typeof ballot.votes === 'object'
        ? ballot.votes
        : {};

    return ballot.eligibleVoterIds.every((userId) =>
        Object.prototype.hasOwnProperty.call(votes, userId)
    );
}

function getVoteFromCustomId(customId) {
    if (customId === VOTE_FOR) {
        return 'for';
    }

    if (customId === VOTE_AGAINST) {
        return 'against';
    }

    return 'abstain';
}

function getVoteCounts(ballot) {
    const counts = {
        for: 0,
        against: 0,
        abstain: 0,
    };

    const votes = ballot.votes && typeof ballot.votes === 'object'
        ? ballot.votes
        : {};

    for (const [userId, vote] of Object.entries(votes)) {
        if (!isEligibleVoter(ballot, userId)) {
            continue;
        }

        if (vote === 'for') {
            counts.for++;
        } else if (vote === 'against') {
            counts.against++;
        } else if (vote === 'abstain') {
            counts.abstain++;
        }
    }

    return counts;
}

function getFinalVerdict(ballot, counts) {
    const totalVotes = counts.for + counts.against + counts.abstain;

    if (ballot.quorumEnabled) {
        const quorumRequired = getQuorumRequired(ballot);

        if (totalVotes < quorumRequired) {
            return `🚫 Failed — quorum was not met (${totalVotes}/${quorumRequired})`;
        }

        const yesVotesRequired = getYesVotesRequired(totalVotes);

        if (counts.for >= yesVotesRequired) {
            return `✅ Passed — ${counts.for}/${yesVotesRequired} required yes votes`;
        }

        return `❌ Failed — ${counts.for}/${yesVotesRequired} required yes votes`;
    }

    if (counts.for > counts.against) {
        return '✅ Passed';
    }

    if (counts.against > counts.for) {
        return '❌ Failed';
    }

    return '⚖️ Tied';
}

function getQuorumStatusText(ballot) {
    if (!ballot.quorumEnabled) {
        return 'Not required';
    }

    return `Required: ${getQuorumRequired(ballot)}/${EXPECTED_COUNCIL_SIZE}`;
}

function getQuorumRequired(ballot) {
    return Number(ballot.quorumRequired) || QUORUM_REQUIRED;
}

function getYesVotesRequired(totalVotes) {
    return Math.floor(totalVotes / 2) + 1;
}

function getCloseReasonText(ballot) {
    if (ballot.closeType === 'manual') {
        return 'Closed early by an authorized council closer.';
    }

    if (ballot.closeType === 'all_voted') {
        return 'Closed automatically after all eligible voters voted and the 1-minute grace period ended.';
    }

    return 'Closed automatically because the 10-day voting period ended.';
}

function getEligibleVoterCount(ballot) {
    if (Array.isArray(ballot.eligibleVoterIds)) {
        return ballot.eligibleVoterIds.length;
    }

    return 0;
}

function formatEligibleVoters(ballot) {
    const votes = ballot.votes && typeof ballot.votes === 'object'
        ? ballot.votes
        : {};

    const lines = ballot.eligibleVoterIds.map((userId) => {
        const hasVoted = Object.prototype.hasOwnProperty.call(votes, userId);
        const changeCount = ballot.voteChanges?.[userId] ?? 0;
        const changeText = changeCount > 0 ? ' · changed once' : '';

        return `${hasVoted ? '✅' : '⬜'} <@${userId}>${changeText}`;
    });

    if (lines.length === 0) {
        return 'No eligible voters were recorded for this ballot.';
    }

    return truncate(lines.join('\n'), 1024);
}

function formatVote(vote) {
    if (vote === 'for') {
        return '✅ For';
    }

    if (vote === 'against') {
        return '❌ Against';
    }

    return '⚪ Abstain';
}

function isExpired(ballot) {
    if (!ballot.expiresAt) {
        return false;
    }

    return Date.now() >= new Date(ballot.expiresAt).getTime();
}

function normalizeMotionLabel(input) {
    const trimmed = String(input)
        .replace(/\s+/g, ' ')
        .trim();

    const withoutMotion = trimmed.replace(/^motion\s*/i, '').trim();

    if (/^#?\d+$/.test(withoutMotion)) {
        return `Motion #${withoutMotion.replace(/^#/, '')}`;
    }

    if (/^motion\b/i.test(trimmed)) {
        return trimmed;
    }

    return `Motion ${trimmed}`;
}

function normalizeUrl(input) {
    try {
        const url = new URL(input);

        if (!['http:', 'https:'].includes(url.protocol)) {
            return null;
        }

        return url.toString();
    } catch {
        return null;
    }
}

function escapeMarkdown(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/\|/g, '\\|')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
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