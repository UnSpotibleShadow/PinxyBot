import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  const envClientId = process.env.CLIENT_ID?.trim();
  const envGuildId = process.env.GUILD_ID?.trim();

  console.log(`Logged in as: ${client.user.tag}`);
  console.log(`Bot user ID: ${client.user.id}`);

  await client.application.fetch();

  console.log(`Application ID from token: ${client.application.id}`);
  console.log(`CLIENT_ID in .env:       ${envClientId}`);

  if (client.application.id === envClientId) {
    console.log('✅ CLIENT_ID matches the token.');
  } else {
    console.log('❌ CLIENT_ID does NOT match this bot token.');
    console.log('Use the Application ID shown above in your .env.');
  }

  try {
    const guild = await client.guilds.fetch(envGuildId);
    console.log(`✅ Bot can access guild: ${guild.name} (${guild.id})`);
  } catch (error) {
    console.log(`❌ Bot cannot access GUILD_ID: ${envGuildId}`);
    console.log('This usually means GUILD_ID is wrong, or the bot is not in that server.');
    console.error(error.code, error.message);
  }

  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
