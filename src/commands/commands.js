import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Send you a DM with all available commands.');

export async function execute(interaction) {
    const commands = [...interaction.client.commands.values()]
        .map((command) => command.data.toJSON())
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines = ['📜 **Available Commands**', ''];

    for (const command of commands) {
        lines.push(`**/${command.name}** — ${command.description}`);

        const subcommands = command.options?.filter(
            (option) => option.type === 1 // SUB_COMMAND
        );

        if (subcommands?.length) {
            for (const subcommand of subcommands) {
                lines.push(
                    `↳ \`/${command.name} ${subcommand.name}\` — ${subcommand.description}`
                );
            }
        }

        lines.push('');
    }

    const chunks = chunkText(lines.join('\n'));

    try {
        for (const chunk of chunks) {
            await interaction.user.send({
                content: chunk,
                allowedMentions: { parse: [] },
            });
        }

        await interaction.reply({
            content: '📬 I sent you the command list in DMs!',
            ephemeral: true,
        });
    } catch (error) {
        console.error('Failed to send commands DM:', error);

        await interaction.reply({
            content:
                'I could not DM you the command list. You may have DMs disabled for this server.',
            ephemeral: true,
        });
    }
}

function chunkText(text, maxLength = 1900) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf('\n', maxLength);

        if (splitAt <= 0) {
            splitAt = maxLength;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt).trimStart();
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}