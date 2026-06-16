import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'w-data.json');

export async function loadMemory() {
    try {
        const raw = await fs.readFile(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return {};
        }

        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }

        console.error('Failed to load memory:', error);
        return {};
    }
}

export async function saveMemory(memory) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(memory, null, 2), 'utf8');
}