import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice.')
    .addStringOption((option) =>
        option
            .setName('dice')
            .setDescription('Dice format, like 1d6, 2d20, or d100.')
            .setRequired(false)
            .setMaxLength(20)
    );

export async function execute(interaction) {
    const diceInput = interaction.options.getString('dice') ?? '1d6';
    const parsed = parseDice(diceInput);

    if (!parsed) {
        await interaction.reply({
            content: 'Invalid dice format. Try `1d6`, `2d20`, `d100`, or `4d6`.',
            ephemeral: true,
        });
        return;
    }

    const { amount, sides } = parsed;

    if (amount > 100) {
        await interaction.reply({
            content: 'Please roll 100 dice or fewer.',
            ephemeral: true,
        });
        return;
    }

    if (sides > 1000000) {
        await interaction.reply({
            content: 'Please use dice with 1,000,000 sides or fewer.',
            ephemeral: true,
        });
        return;
    }

    const rolls = Array.from(
        { length: amount },
        () => Math.floor(Math.random() * sides) + 1
    );

    const total = rolls.reduce((sum, roll) => sum + roll, 0);

    const rollList =
        rolls.length <= 30
            ? rolls.join(', ')
            : `${rolls.slice(0, 30).join(', ')}...`;

    await interaction.reply({
        content: [
            `🎲 **Rolling ${amount}d${sides}**`,
            `**Rolls:** ${rollList}`,
            `**Total:** ${total}`,
        ].join('\n'),
        allowedMentions: { parse: [] },
    });
}

function parseDice(input) {
    const normalized = input.trim().toLowerCase();

    const match = normalized.match(/^(\d*)d(\d+)$/);

    if (!match) return null;

    const amount = match[1] ? Number(match[1]) : 1;
    const sides = Number(match[2]);

    if (!Number.isInteger(amount) || !Number.isInteger(sides)) return null;
    if (amount < 1 || sides < 2) return null;

    return { amount, sides };
}