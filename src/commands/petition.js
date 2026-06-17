import {SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits} from 'discord.js';

const CHECKMARK = '✅';
const CROSS = '❌';

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 10 * 1000;

export const data = new SlashCommandBuilder()
    .setName('petition')
    .setDescription('Start a petition that people can vote on.')
    .addStringOption((option) =>
        option
            .setName('reason')
            .setDescription('What is this petition about?')
            .setRequired(true)
            .setMaxLength(500)
    )
    .addStringOption((option) =>
        option
            .setName('duration')
            .setDescription('How long should it run? Example: 30s, 10m, 2h, 1d. Max: 1d.')
            .setRequired(true)
            .setMaxLength(20)
    );

export async function execute(interaction) {

    if (!canUsePetition(interaction)) {
        await interaction.reply({
            content: 'Only moderators can start a petition',
            ephemeral: true,
        });
        return;
    }
    const reason = interaction.options.getString('reason', true).trim();
    const durationInput = interaction.options.getString('duration', true).trim();

    const durationMs = parseDuration(durationInput);

    if (!durationMs) {
        await interaction.reply({
            content: 'Invalid duration. Use something like `30s`, `10m`, `2h`, or `1d`.',
            ephemeral: true,
        });

        return;
    }

    if (durationMs < MIN_DURATION_MS) {
        await interaction.reply({
            content: 'Petitions must last at least `10s`.',
            ephemeral: true,
        });

        return;
    }

    if (durationMs > MAX_DURATION_MS) {
        await interaction.reply({
            content: 'Petitions can only last up to `1d`.',
            ephemeral: true,
        });

        return;
    }

    const endsAt = Date.now() + durationMs;
    const endsAtUnix = Math.floor(endsAt / 1000);

    const embed = new EmbedBuilder()
        .setTitle('📜 Petition Started')
        .setDescription(reason)
        .addFields(
            {
                name: 'Status',
                value: 'Open for voting',
                inline: true,
            },
            {
                name: 'Ends',
                value: `<t:${endsAtUnix}:R>`,
                inline: true,
            },
            {
                name: 'How to vote',
                value: `${CHECKMARK} = Support\n${CROSS} = Oppose`,
                inline: false,
            }
        )
        .setFooter({
            text: `Started by ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

    const message = await interaction.reply({
        embeds: [embed],
        fetchReply: true,
    });

    await message.react(CHECKMARK);
    await message.react(CROSS);

    setTimeout(() => {
        closePetition(message, {
            reason,
            startedBy: interaction.user,
            endedAt: endsAt,
        });
    }, durationMs);
}

async function closePetition(message, petition) {
    try {
        const freshMessage = await message.channel.messages.fetch(message.id);

        const supportReaction = freshMessage.reactions.cache.get(CHECKMARK);
        const opposeReaction = freshMessage.reactions.cache.get(CROSS);

        const supportVotes = Math.max((supportReaction?.count ?? 1) - 1, 0);
        const opposeVotes = Math.max((opposeReaction?.count ?? 1) - 1, 0);
        const totalVotes = supportVotes + opposeVotes;

        const outcome = getOutcome(supportVotes, opposeVotes);
        const endedAtUnix = Math.floor(Date.now() / 1000);

        const resultEmbed = new EmbedBuilder()
            .setTitle('📜 Petition Closed')
            .setDescription(petition.reason)
            .addFields(
                {
                    name: 'Outcome',
                    value: outcome,
                    inline: false,
                },
                {
                    name: `${CHECKMARK} Support`,
                    value: `${supportVotes}`,
                    inline: true,
                },
                {
                    name: `${CROSS} Oppose`,
                    value: `${opposeVotes}`,
                    inline: true,
                },
                {
                    name: 'Total votes',
                    value: `${totalVotes}`,
                    inline: true,
                },
                {
                    name: 'Closed',
                    value: `<t:${endedAtUnix}:R>`,
                    inline: false,
                }
            )
            .setFooter({
                text: `Started by ${petition.startedBy.username}`,
                iconURL: petition.startedBy.displayAvatarURL(),
            })
            .setTimestamp();

        await freshMessage.edit({
            embeds: [resultEmbed],
        });

        await freshMessage.reactions.removeAll().catch(() => null);
    } catch (error) {
        console.error('Failed to close petition:', error);
    }
}

function getOutcome(supportVotes, opposeVotes) {
    if (supportVotes > opposeVotes) {
        return '✅ Petition passed.';
    }

    if (opposeVotes > supportVotes) {
        return '❌ Petition failed.';
    }

    return '🤝 Petition ended in a tie.';
}

function canUsePetition(interaction) {
    return interaction.memberPermissions?.any([
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
    ]);
}

function parseDuration(input) {
    const match = input.toLowerCase().match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);

    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    if (!Number.isInteger(amount) || amount <= 0) {
        return null;
    }

    if (['s', 'sec', 'secs', 'second', 'seconds'].includes(unit)) {
        return amount * 1000;
    }

    if (['m', 'min', 'mins', 'minute', 'minutes'].includes(unit)) {
        return amount * 60 * 1000;
    }

    if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(unit)) {
        return amount * 60 * 60 * 1000;
    }

    if (['d', 'day', 'days'].includes(unit)) {
        return amount * 24 * 60 * 60 * 1000;
    }

    return null;
}