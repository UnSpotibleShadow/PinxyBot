import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMENTS_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'ship-comments.json'
);

const franID = '1410897591977246822';
const creamID = '564230384389193751';

const shipOverrides = [
    {
        ids: ['1410897591977246822' /*fran*/, '564230384389193751'/*cream*/],
        percentage: 10000,
        comment: 'They will coom a lot forever and ever, coombuddies!',
    },
    {
        ids: ['1264136522702131294' /*Odin*/, '652591117828882433'/*Jack*/],
        percentage: 10000,
        comment: 'Either of them is gonna spread their cheeks tonight!',
    },
];

const fallbackComments = {
    normal: [
        'They look good together.',
        'The vibes are solid.',
        'This could be cute.',
    ],
    low: [
        'This ship may need some work.',
        'The vibes are a little confused.',
    ],
    perfect: [
        'This ship is basically perfect.',
        'Soulmate energy detected.',
    ],
    sexy:[
        'They will eat eachother so well',
        'Oh come-on, coom on eachother already!'
    ]
};

export const data = new SlashCommandBuilder()
    .setName('ship')
    .setDescription('See how good two people look together.')
    .addUserOption((option) =>
        option
            .setName('person_a')
            .setDescription('The first person.')
            .setRequired(true)
    )
    .addUserOption((option) =>
        option
            .setName('person_b')
            .setDescription('The second person.')
            .setRequired(true)
    );

export async function execute(interaction) {
    const personA = interaction.options.getUser('person_a', true);
    const personB = interaction.options.getUser('person_b', true);

    if (personA.id === personB.id) {
        await interaction.reply({
            content: `💞 ${personA} ships with themselves. Honestly? Self-love is important.`,
            allowedMentions: {
                users: [personA.id],
            },
        });

        return;
    }

    const comments = await loadComments();
    const override = findShipOverride(personA.id, personB.id);

    const percentage = override
        ? clampPercentage(override.percentage)
        : getShipPercentage(personA.id, personB.id);

    const shipName = createShipName(personA.username, personB.username);

    const comment = override?.comment || getComment(percentage, comments);

    await interaction.reply({
        content: [
            '💘 **Ship detected!**',
            '',
            `${personA} + ${personB}`,
            `**Ship name:** ${shipName}`,
            `**Compatibility:** ${percentage}%`,
            '',
            getProgressBar(percentage),
            '',
            `_${comment}_`,
        ].join('\n'),
        allowedMentions: {
            users: [personA.id, personB.id],
        },
    });
}

async function loadComments() {
    try {
        const raw = await fs.readFile(COMMENTS_FILE, 'utf8');
        const comments = JSON.parse(raw);

        return {
            normal: validateCommentList(comments.normal, fallbackComments.normal),
            low: validateCommentList(comments.low, fallbackComments.low),
            perfect: validateCommentList(comments.perfect, fallbackComments.perfect),
            sexy: validateCommentList(comments.sexy, fallbackComments.sexy),
        };
    } catch (error) {
        console.error('Failed to load ship-comments.json:', error);
        return fallbackComments;
    }
}

function validateCommentList(value, fallback) {
    if (!Array.isArray(value)) {
        return fallback;
    }

    const validComments = value.filter((comment) =>
        typeof comment === 'string' && comment.trim().length > 0
    );

    return validComments.length > 0 ? validComments : fallback;
}

function findShipOverride(idA, idB) {
    const pairKey = createPairKey(idA, idB);

    return shipOverrides.find((override) => {
        if (!Array.isArray(override.ids) || override.ids.length !== 2) {
            return false;
        }

        return createPairKey(override.ids[0], override.ids[1]) === pairKey;
    });
}

function createPairKey(idA, idB) {
    return [idA, idB].sort().join(':');
}

function getShipPercentage(idA, idB) {
    const pairKey = [idA, idB].sort().join(':');

    let hash = 0;

    for (let i = 0; i < pairKey.length; i++) {
        hash = (hash * 31 + pairKey.charCodeAt(i)) % 101;
    }

    return hash;
}

function createShipName(nameA, nameB) {
    const cleanA = cleanName(nameA);
    const cleanB = cleanName(nameB);

    const firstHalf = cleanA.slice(0, Math.ceil(cleanA.length / 2));
    const secondHalf = cleanB.slice(Math.floor(cleanB.length / 2));

    return `${firstHalf}${secondHalf}`;
}

function cleanName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '') || 'Mystery';
}

function getComment(percentage, comments) {

    if(percentage === 69)
    {
        return randomFrom(comments.sexy)
    }

    if (percentage >= 90) {
        return randomFrom(comments.perfect);
    }

    if (percentage <= 30) {
        return randomFrom(comments.low);
    }

    return randomFrom(comments.normal);
}

function getProgressBar(percentage) {
    const filledBlocks = Math.round(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;

    return '❤️'.repeat(filledBlocks) + '🤍'.repeat(emptyBlocks);
}

function randomFrom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function clampPercentage(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 50;
    }

    return Math.max(0, Math.min(100, Math.round(number)));
}