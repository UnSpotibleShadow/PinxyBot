import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadCommands } from './lib/loadCommands.js';

const commands = await loadCommands();
const commandData = commands.map((command) => command.data.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildIds = process.env.GUILD_IDS
    ? process.env.GUILD_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : [process.env.GUILD_ID].filter(Boolean);

if (!process.env.CLIENT_ID) {
    throw new Error('Missing CLIENT_ID in .env');
}

if (!guildIds.length) {
    throw new Error('Missing GUILD_IDS or GUILD_ID in .env');
}

console.log(`Found ${commandData.length} command(s).`);

for (const guildId of guildIds) {
    console.log(`Registering commands for guild ${guildId}...`);

    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commandData }
    );

    console.log(`Registered commands for guild ${guildId}.`);
}

console.log('Done.');