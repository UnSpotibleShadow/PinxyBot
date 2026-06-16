import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

export async function loadCommands() {
    const files = await fs.readdir(COMMANDS_DIR);
    const commandFiles = files.filter((file) => file.endsWith('.js'));

    const commands = [];

    for (const file of commandFiles) {
        const filePath = path.join(COMMANDS_DIR, file);
        const moduleUrl = pathToFileURL(filePath).href;
        const command = await import(moduleUrl);

        if (!command.data || !command.execute) {
            console.warn(`Skipping ${file}: missing "data" or "execute" export.`);
            continue;
        }

        commands.push(command);
    }

    return commands;
}