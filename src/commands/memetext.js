import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const IMGFLIP_MEMES_URL = 'https://api.imgflip.com/get_memes';
const TEMPLATE_CACHE_MS = 60 * 60 * 1000;

let memeCache = {
    fetchedAt: 0,
    memes: [],
};

const MEME_ALIASES = {
    'drake': 'Drake Hotline Bling',
    'distracted boyfriend': 'Distracted Boyfriend',
    'two buttons': 'Two Buttons',
    'change my mind': 'Change My Mind',
    'expanding brain': 'Expanding Brain',
    'galaxy brain': 'Expanding Brain',
    'woman yelling cat': 'Woman Yelling At Cat',
    'yelling cat': 'Woman Yelling At Cat',
    'left exit': 'Left Exit 12 Off Ramp',
    'exit ramp': 'Left Exit 12 Off Ramp',
    'one does not simply': 'One Does Not Simply',
    'success kid': 'Success Kid',
    'bad luck brian': 'Bad Luck Brian',
    'hide the pain': 'Hide the Pain Harold',
    'mocking spongebob': 'Mocking Spongebob',
    'ancient aliens': 'Ancient Aliens',
    'aliens guy': 'Ancient Aliens',
    'roll safe': 'Roll Safe Think About It',
    'thinking guy': 'Roll Safe Think About It',
    'is this a pigeon': 'Is This A Pigeon',
    'trade offer': 'Trade Offer',
    'gru plan': 'Gru\'s Plan',
    'uno draw 25': 'UNO Draw 25 Cards',
    'disaster girl': 'Disaster Girl',
    'boardroom': 'Boardroom Meeting Suggestion',
    'pawn stars': 'Pawn Stars Best I Can Do',
};

export const data = new SlashCommandBuilder()
    .setName('memetext')
    .setDescription('Pick a meme template and add top/bottom text.')
    .addStringOption((option) =>
        option
            .setName('meme')
            .setDescription('Start typing and choose a meme template from the suggestions.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(500)
    )
    .addStringOption((option) =>
        option
            .setName('bottom_text')
            .setDescription('Text to place at the bottom of the meme.')
            .setRequired(true)
            .setMaxLength(300)
    )
    .addStringOption((option) =>
        option
            .setName('top_text')
            .setDescription('Text to place at the top of the meme.')
            .setRequired(false)
            .setMaxLength(300)
    );

export async function execute(interaction) {
    await interaction.deferReply();

    const memeInput = interaction.options.getString('meme', true).trim();
    const bottomText = interaction.options.getString('bottom_text', true).trim();
    const topText = interaction.options.getString('top_text')?.trim() ?? '';

    if (!topText && !bottomText) {
        await interaction.editReply({
            content: 'Please provide at least top or bottom text.',
        });

        return;
    }

    let template;

    try {
        const memes = await fetchMemeTemplates();
        template = resolveTemplate(memes, memeInput);

        if (!template) {
            const suggestions = getTemplateSuggestions(memes, memeInput, 5);

            await interaction.editReply({
                content: [
                    `I could not confidently find a meme template for **${escapeMarkdown(memeInput)}**.`,
                    '',
                    suggestions.length
                        ? [
                            'Try selecting one from the autocomplete menu, or use one of these:',
                            ...suggestions.map((meme) => `- **${meme.name}**`),
                        ].join('\n')
                        : 'Try typing part of the template name and selecting from the autocomplete menu.',
                ].join('\n'),
                allowedMentions: {
                    parse: [],
                },
            });

            return;
        }
    } catch (error) {
        console.error('Failed to fetch meme templates:', error);

        if (isValidUrl(memeInput)) {
            template = {
                id: 'custom-url',
                name: 'Custom image URL',
                url: memeInput,
            };
        } else {
            await interaction.editReply({
                content: 'I could not fetch meme templates right now. You can also paste a direct image URL as the meme input.',
            });

            return;
        }
    }

    let imageBuffer;

    try {
        imageBuffer = await renderMemeImage({
            imageUrl: template.url,
            topText,
            bottomText,
        });
    } catch (error) {
        console.error('Failed to render meme:', error);

        await interaction.editReply({
            content: 'I found the template, but failed to render the meme image.',
        });

        return;
    }

    const safeName = createSafeFileName(template.name);

    const attachment = new AttachmentBuilder(imageBuffer, {
        name: `${safeName}.png`,
    });

    await interaction.editReply({
        content: `Meme template: **${escapeMarkdown(template.name)}**`,
        files: [attachment],
        allowedMentions: {
            parse: [],
        },
    });
}

export async function handleAutocompleteInteraction(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'meme') {
        await interaction.respond([]);
        return;
    }

    const query = String(focused.value ?? '').trim();

    if (isValidUrl(query)) {
        await interaction.respond([
            {
                name: 'Use this direct image URL',
                value: query.slice(0, 500),
            },
        ]);

        return;
    }

    try {
        const memes = await fetchMemeTemplates();
        const suggestions = getTemplateSuggestions(memes, query, 25);

        await interaction.respond(
            suggestions.map((meme) => ({
                name: truncateChoiceName(`${meme.name} (${meme.width}x${meme.height})`),
                value: `imgflip:${meme.id}`,
            }))
        );
    } catch (error) {
        console.error('Meme autocomplete failed:', error);
        await interaction.respond([]);
    }
}

async function fetchMemeTemplates() {
    const now = Date.now();

    if (
        memeCache.memes.length > 0 &&
        now - memeCache.fetchedAt < TEMPLATE_CACHE_MS
    ) {
        return memeCache.memes;
    }

    const response = await fetch(IMGFLIP_MEMES_URL);
    const data = await response.json();

    if (!response.ok || !data?.success || !Array.isArray(data?.data?.memes)) {
        throw new Error('Failed to fetch Imgflip meme templates.');
    }

    memeCache = {
        fetchedAt: now,
        memes: data.data.memes,
    };

    return memeCache.memes;
}

function resolveTemplate(memes, input) {
    if (input.startsWith('imgflip:')) {
        const id = input.slice('imgflip:'.length);
        return memes.find((meme) => String(meme.id) === id) ?? null;
    }

    if (isValidUrl(input)) {
        return {
            id: 'custom-url',
            name: 'Custom image URL',
            url: input,
        };
    }

    const normalizedInput = normalizeText(input);

    if (!normalizedInput) {
        return null;
    }

    const aliasTarget = MEME_ALIASES[normalizedInput];

    if (aliasTarget) {
        const aliasMatch = findByExactName(memes, aliasTarget);

        if (aliasMatch) {
            return aliasMatch;
        }
    }

    const exactMatch = memes.find((meme) =>
        normalizeText(meme.name) === normalizedInput
    );

    if (exactMatch) {
        return exactMatch;
    }

    const includesMatches = memes.filter((meme) =>
        normalizeText(meme.name).includes(normalizedInput)
    );

    if (includesMatches.length === 1) {
        return includesMatches[0];
    }

    const suggestions = getTemplateSuggestions(memes, input, 3);
    const best = suggestions[0];

    if (!best) {
        return null;
    }

    const bestScore = scoreTemplate(best, normalizedInput);

    // This avoids bad guesses like random "Pawn Stars" results for vague input.
    if (bestScore < 180) {
        return null;
    }

    return best;
}

function getTemplateSuggestions(memes, query, limit) {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
        return memes.slice(0, limit);
    }

    const aliasTarget = MEME_ALIASES[normalizedQuery];

    const scored = memes
        .map((meme, index) => {
            let score = scoreTemplate(meme, normalizedQuery);

            if (aliasTarget && normalizeText(meme.name) === normalizeText(aliasTarget)) {
                score += 1000;
            }

            // Imgflip returns popular templates first, so lightly prefer earlier results.
            score -= index * 0.01;

            return {
                meme,
                score,
            };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored
        .slice(0, limit)
        .map((entry) => entry.meme);
}

function scoreTemplate(meme, normalizedQuery) {
    const normalizedName = normalizeText(meme.name);

    if (!normalizedQuery) {
        return 1;
    }

    if (normalizedName === normalizedQuery) {
        return 1000;
    }

    if (normalizedName.startsWith(normalizedQuery)) {
        return 700;
    }

    if (normalizedName.includes(normalizedQuery)) {
        return 500;
    }

    const queryWords = normalizedQuery.split(' ').filter(Boolean);
    const nameWords = normalizedName.split(' ').filter(Boolean);

    let score = 0;

    for (const queryWord of queryWords) {
        for (const nameWord of nameWords) {
            if (nameWord === queryWord) {
                score += 140;
            } else if (nameWord.startsWith(queryWord)) {
                score += 90;
            } else if (nameWord.includes(queryWord)) {
                score += 50;
            } else if (levenshteinDistance(queryWord, nameWord) <= 1 && queryWord.length >= 4) {
                score += 35;
            }
        }
    }

    return score;
}

function findByExactName(memes, name) {
    const normalizedName = normalizeText(name);

    return memes.find((meme) =>
        normalizeText(meme.name) === normalizedName
    ) ?? null;
}

async function renderMemeImage({ imageUrl, topText, bottomText }) {
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
        throw new Error(`Failed to download template image: ${imageResponse.status}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const image = await loadImage(Buffer.from(arrayBuffer));

    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (topText) {
        drawMemeText(ctx, {
            text: topText,
            canvasWidth: canvas.width,
            y: 20,
            position: 'top',
        });
    }

    if (bottomText) {
        drawMemeText(ctx, {
            text: bottomText,
            canvasWidth: canvas.width,
            y: canvas.height - 20,
            position: 'bottom',
        });
    }

    return canvas.toBuffer('image/png');
}

function drawMemeText(ctx, options) {
    const {
        text,
        canvasWidth,
        y,
        position,
    } = options;

    const safeText = sanitizeMemeText(text);

    const maxWidth = canvasWidth * 0.92;
    const maxFontSize = Math.floor(canvasWidth / 9);
    const minFontSize = 18;
    const maxLines = 4;

    const layout = getBestMemeTextLayout(ctx, {
        text: safeText,
        maxWidth,
        maxFontSize,
        minFontSize,
        maxLines,
    });

    ctx.save();

    ctx.font = getMemeFont(layout.fontSize);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(4, Math.floor(layout.fontSize / 8));

    const lineHeight = layout.fontSize * 1.05;

    let startY;

    if (position === 'top') {
        ctx.textBaseline = 'top';
        startY = y;
    } else {
        ctx.textBaseline = 'bottom';
        startY = y - ((layout.lines.length - 1) * lineHeight);
    }

    for (let i = 0; i < layout.lines.length; i++) {
        const lineY = startY + i * lineHeight;
        const line = layout.lines[i];

        ctx.strokeText(line, canvasWidth / 2, lineY);
        ctx.fillText(line, canvasWidth / 2, lineY);
    }

    ctx.restore();
}

function getBestMemeTextLayout(ctx, options) {
    const {
        text,
        maxWidth,
        maxFontSize,
        minFontSize,
        maxLines,
    } = options;

    for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize--) {
        ctx.font = getMemeFont(fontSize);

        const lines = wrapText(ctx, text, maxWidth);

        if (lines.length <= maxLines) {
            return {
                fontSize,
                lines,
            };
        }
    }

    ctx.font = getMemeFont(minFontSize);

    return {
        fontSize: minFontSize,
        lines: wrapText(ctx, text, maxWidth).slice(0, maxLines),
    };
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;

        if (ctx.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        if (ctx.measureText(word).width <= maxWidth) {
            currentLine = word;
        } else {
            currentLine = trimToWidth(ctx, word, maxWidth);
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
}

function trimToWidth(ctx, text, maxWidth) {
    let trimmed = text;

    while (trimmed.length > 3 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }

    return `${trimmed}...`;
}

function getMemeFont(size) {
    return `bold ${size}px Impact, Arial Black, Arial, sans-serif`;
}

function sanitizeMemeText(text) {
    return String(text)
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
        .slice(0, 300);
}

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isValidUrl(input) {
    try {
        const url = new URL(input);

        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

function createSafeFileName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'meme';
}

function truncateChoiceName(text) {
    if (text.length <= 100) {
        return text;
    }

    return `${text.slice(0, 97)}...`;
}

function escapeMarkdown(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/\|/g, '\\|');
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () =>
        Array(b.length + 1).fill(0)
    );

    for (let i = 0; i <= a.length; i++) {
        matrix[i][0] = i;
    }

    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;

            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[a.length][b.length];
}