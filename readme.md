# PinxyBot

PinxyBot is a small Discord slash-command bot built with Node.js and `discord.js`.

It includes fun commands like coin flips, dice rolls, 8-ball answers, hugs, praise, random advice, dictionary lookups, and a small custom `/w` memory system.

## Features

* Slash-command based Discord bot
* Modular command structure
* Easy to add new commands
* Persistent `/w` memory stored in JSON
* Supports multiple Discord servers through `GUILD_IDS`
* Designed to run locally or 24/7 on a cloud server with PM2

## Commands

| Command                            | Description                                       |
| ---------------------------------- | ------------------------------------------------- |
| `/ping`                            | Replies with `Pong!`                              |
| `/commands`                        | Shows a list of available commands                |
| `/w learn key:<key> input:<input>` | Saves text under a key. Moderator-only            |
| `/w show key:<key>`                | Shows everything saved under a key                |
| `/8 question:<question>`           | Magic 8-ball response                             |
| `/roll dice:<dice>`                | Rolls dice, such as `1d6`, `2d20`, or `d100`      |
| `/chance thing:<thing>`            | Gives a random percentage chance                  |
| `/coinflip`                        | Flips a coin with heads/tails images if available |
| `/fortunecookie`                   | Opens a fortune cookie                            |
| `/advice`                          | Gets random advice from a public API              |
| `/dict word:<word>`                | Looks up a normal dictionary definition           |
| `/urban term:<term>`               | Looks up a term on Urban Dictionary               |
| `/hug target:<user>`               | Gives a user a hug                                |
| `/kiss target:<user>`              | Gives a user a kiss                               |
| `/spank target:<user>`             | Playfully spanks a user                           |
| `/praise target:<user>`            | Praises a user                                    |

## Project Structure

```text
PinxyBot/
├─ .env
├─ package.json
├─ package-lock.json
├─ README.md
├─ assets/
│  └─ coin/
│     ├─ heads.png
│     └─ tails.png
├─ data/
│  └─ w-data.json
└─ src/
   ├─ index.js
   ├─ deploy-commands.js
   ├─ commands/
   │  ├─ 8.js
   │  ├─ advice.js
   │  ├─ chance.js
   │  ├─ coinflip.js
   │  ├─ commands.js
   │  ├─ dict.js
   │  ├─ fortunecookie.js
   │  ├─ hug.js
   │  ├─ kiss.js
   │  ├─ ping.js
   │  ├─ praise.js
   │  ├─ roll.js
   │  ├─ spank.js
   │  ├─ urban.js
   │  └─ w.js
   └─ lib/
      ├─ loadCommands.js
      └─ memoryStore.js
```

## Requirements

* Node.js
* npm
* A Discord bot application
* A Discord bot token
* One or more Discord server IDs

## Installation

Clone or copy the project, then install dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env` file in the root folder:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_IDS=your_first_server_id,your_second_server_id
```

You can also use a single guild ID:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here
```

## Discord Bot Setup

In the Discord Developer Portal:

1. Create an application.
2. Go to **Bot** and create a bot.
3. Copy the bot token into `.env`.
4. Go to **General Information** and copy the Application ID into `.env` as `CLIENT_ID`.
5. Go to **OAuth2 → URL Generator**.
6. Select these scopes:

    * `bot`
    * `applications.commands`
7. Select the permissions your bot needs.
8. Open the generated invite URL and invite the bot to your server.

## Deploy Slash Commands

Run this whenever you add, remove, or rename slash commands:

```bash
npm run deploy
```

## Run Locally

```bash
npm start
```

## Run Persistently with PM2

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Start the bot:

```bash
pm2 start npm --name pinxybot -- start
```

Save the PM2 process list:

```bash
pm2 save
```

Enable startup after reboot:

```bash
pm2 startup
```

PM2 will print a command starting with `sudo env ...`. Copy and run that command.

Then save again:

```bash
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs pinxybot
pm2 restart pinxybot
pm2 stop pinxybot
pm2 delete pinxybot
```

## Updating the Bot on a Cloud Server

Copy your updated files to the server, then run:

```bash
cd ~/discord-bot
npm install
npm run deploy
pm2 restart pinxybot
```

Do not upload `node_modules`. Run `npm install` on the server instead.

## Adding a New Command

Create a new file in:

```text
src/commands/
```

Example:

```js
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('example')
  .setDescription('An example command.');

export async function execute(interaction) {
  await interaction.reply('This is an example command.');
}
```

Then deploy and restart:

```bash
npm run deploy
pm2 restart pinxybot
```

## Notes

* `/w learn` is moderator-only.
* `/w show` is public.
* `/coinflip` uses local image files from `assets/coin/heads.png` and `assets/coin/tails.png`.
* The `/w` memory data is stored in `data/w-data.json`.
* Keep `.env` private. Never commit your bot token to a public repository.

## License

