import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const POLL_EMOJIS = [
    '1️⃣',
    '2️⃣',
    '3️⃣',
    '4️⃣',
    '5️⃣',
    '6️⃣',
    '7️⃣',
    '8️⃣',
    '9️⃣',
    '🔟',
];

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 10 * 1000;

export const data = new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Start a poll with multiple options.')
    .addStringOption((option) =>
        option
            .setName('poll')
            .setDescription('The poll question.')
            .setRequired(true)
            .setMaxLength(300)
    )
    .addStringOption((option) =>
        option
            .setName('options')
            .setDescription('Poll options, separated with |. Example: Pizza | Sushi | Tacos')
            .setRequired(true)
            .setMaxLength(1500)
    )
    .addStringOption((option) =>
        option
            .setName('duration')
            .setDescription('How long should it run? Example: 30s, 10m, 2h, 1d. Max: 1d.')
            .setRequired(true)
            .setMaxLength(20)
    );

export async function execute(interaction) {
    const pollQuestion = interaction.options.getString('poll', true).trim();
    const rawOptions = interaction.options.getString('options', true).trim();
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
            content: 'Polls must last at least `10s`.',
            ephemeral: true,
        });

        return;
    }

    if (durationMs > MAX_DURATION_MS) {
        await interaction.reply({
            content: 'Polls can only last up to `1d`.',
            ephemeral: true,
        });

        return;
    }

    const options = parsePollOptions(rawOptions);

    if (options.length < 2) {
        await interaction.reply({
            content: 'Please provide at least 2 options. Example: `Pizza | Sushi | Tacos`',
            ephemeral: true,
        });

        return;
    }

    if (options.length > POLL_EMOJIS.length) {
        await interaction.reply({
            content: `This poll supports up to ${POLL_EMOJIS.length} options.`,
            ephemeral: true,
        });

        return;
    }

    const endsAt = Date.now() + durationMs;
    const endsAtUnix = Math.floor(endsAt / 1000);

    const embed = new EmbedBuilder()
        .setTitle('📊 Poll Started')
        .setDescription(pollQuestion)
        .addFields(
            {
                name: 'Options',
                value: formatOptions(options),
                inline: false,
            },
            {
                name: 'Ends',
                value: `<t:${endsAtUnix}:R>`,
                inline: true,
            },
            {
                name: 'Status',
                value: 'Open for voting',
                inline: true,
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

    for (let i = 0; i < options.length; i++) {
        await message.react(POLL_EMOJIS[i]);
    }

    setTimeout(() => {
        closePoll(message, {
            pollQuestion,
            options,
            startedBy: interaction.user,
        });
    }, durationMs);
}

async function closePoll(message, poll) {
    try {
        const freshMessage = await message.channel.messages.fetch(message.id);

        const results = poll.options.map((option, index) => {
            const emoji = POLL_EMOJIS[index];
            const reaction = freshMessage.reactions.cache.get(emoji);

            return {
                emoji,
                option,
                votes: Math.max((reaction?.count ?? 1) - 1, 0),
            };
        });

        const totalVotes = results.reduce((sum, result) => sum + result.votes, 0);
        const winners = getWinners(results);
        const outcome = formatOutcome(winners, totalVotes);
        const endedAtUnix = Math.floor(Date.now() / 1000);

        const resultEmbed = new EmbedBuilder()
            .setTitle('📊 Poll Closed')
            .setDescription(poll.pollQuestion)
            .addFields(
                {
                    name: 'Results',
                    value: formatResults(results, totalVotes),
                    inline: false,
                },
                {
                    name: 'Outcome',
                    value: outcome,
                    inline: false,
                },
                {
                    name: 'Total votes',
                    value: `${totalVotes}`,
                    inline: true,
                },
                {
                    name: 'Closed',
                    value: `<t:${endedAtUnix}:R>`,
                    inline: true,
                }
            )
            .setFooter({
                text: `Started by ${poll.startedBy.username}`,
                iconURL: poll.startedBy.displayAvatarURL(),
            })
            .setTimestamp();

        await freshMessage.edit({
            embeds: [resultEmbed],
        });

        await freshMessage.reactions.removeAll().catch(() => null);
    } catch (error) {
        console.error('Failed to close poll:', error);
    }
}

function parsePollOptions(rawOptions) {
    return rawOptions
        .split('|')
        .map((option) => option.trim())
        .filter(Boolean)
        .map((option) => option.slice(0, 100));
}

function formatOptions(options) {
    return options
        .map((option, index) => `${POLL_EMOJIS[index]} ${option}`)
        .join('\n');
}

function formatResults(results, totalVotes) {
    return results
        .map((result) => {
            const percentage = totalVotes === 0
                ? 0
                : Math.round((result.votes / totalVotes) * 100);

            return `${result.emoji} **${result.option}** — ${result.votes} vote${result.votes === 1 ? '' : 's'} (${percentage}%)`;
        })
        .join('\n');
}

function getWinners(results) {
    const highestVotes = Math.max(...results.map((result) => result.votes));

    if (highestVotes === 0) {
        return [];
    }

    return results.filter((result) => result.votes === highestVotes);
}

function formatOutcome(winners, totalVotes) {
    if (totalVotes === 0) {
        return 'No votes were cast.';
    }

    if (winners.length === 1) {
        return `🏆 **${winners[0].option}** won with **${winners[0].votes}** vote${winners[0].votes === 1 ? '' : 's'}.`;
    }

    return `🤝 Tie between ${winners.map((winner) => `**${winner.option}**`).join(', ')}.`;
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