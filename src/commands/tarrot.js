import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const TAROT_API_BASE_URL = 'https://tarotapi.dev/api/v1/cards/random';
const TAROT_IMAGE_CATALOG_URL =
    'https://raw.githubusercontent.com/metabismuth/tarot-json/master/tarot-images.json';
const TAROT_IMAGE_BASE_URL =
    'https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards/';

const IMAGE_CATALOG_CACHE_MS = 60 * 60 * 1000;

let imageCatalogCache = {
    fetchedAt: 0,
    cards: [],
};

const spreads = {
    single: {
        label: 'Single Card',
        cardCount: 1,
        positions: ['Insight'],
    },
    two_card: {
        label: 'Two Card',
        cardCount: 2,
        positions: ['Situation', 'Outcome'],
    },
    past_present_future: {
        label: 'Past, Present, Future',
        cardCount: 3,
        positions: ['Past', 'Present', 'Future'],
    },
    five_card: {
        label: 'Five Card Spread',
        cardCount: 5,
        positions: ['Current Energy', 'Challenge', 'Advice', 'Hidden Influence', 'Outcome'],
    },
    celtic_cross: {
        label: 'Celtic Cross',
        cardCount: 10,
        positions: [
            'Present',
            'Challenge',
            'Past',
            'Future',
            'Above',
            'Below',
            'Advice',
            'External Influence',
            'Hopes / Fears',
            'Outcome',
        ],
    },
};

const fallbackCards = [
    {
        name: 'The Fool',
        name_short: 'ar00',
        meaning_up: 'new beginnings, risk, curiosity, chaos with potential',
        meaning_rev: 'recklessness, poor planning, questionable decisions',
    },
    {
        name: 'The Magician',
        name_short: 'ar01',
        meaning_up: 'willpower, skill, action, making things happen',
        meaning_rev: 'blocked potential, trickery, wasted talent',
    },
    {
        name: 'The High Priestess',
        name_short: 'ar02',
        meaning_up: 'intuition, secrets, hidden knowledge, quiet observation',
        meaning_rev: 'confusion, hidden motives, ignoring intuition',
    },
    {
        name: 'The Empress',
        name_short: 'ar03',
        meaning_up: 'growth, comfort, creativity, care',
        meaning_rev: 'smothering, stagnation, neglected self-care',
    },
    {
        name: 'The Emperor',
        name_short: 'ar04',
        meaning_up: 'structure, control, leadership, discipline',
        meaning_rev: 'rigidity, domination, control issues',
    },
    {
        name: 'The Hierophant',
        name_short: 'ar05',
        meaning_up: 'tradition, rules, guidance, established systems',
        meaning_rev: 'rebellion, stale rules, rejecting tradition',
    },
    {
        name: 'The Lovers',
        name_short: 'ar06',
        meaning_up: 'choices, bonds, attraction, alignment',
        meaning_rev: 'imbalance, mixed signals, misalignment',
    },
    {
        name: 'The Chariot',
        name_short: 'ar07',
        meaning_up: 'drive, focus, victory, pushing forward',
        meaning_rev: 'loss of direction, scattered energy, stalled progress',
    },
    {
        name: 'Strength',
        name_short: 'ar08',
        meaning_up: 'patience, courage, emotional control, gentle power',
        meaning_rev: 'self-doubt, emotional mess, weak boundaries',
    },
    {
        name: 'The Hermit',
        name_short: 'ar09',
        meaning_up: 'reflection, solitude, wisdom, stepping back',
        meaning_rev: 'isolation, avoidance, withdrawing too much',
    },
    {
        name: 'Wheel of Fortune',
        name_short: 'ar10',
        meaning_up: 'change, luck, cycles, unexpected turns',
        meaning_rev: 'bad timing, resistance to change, setbacks',
    },
    {
        name: 'Justice',
        name_short: 'ar11',
        meaning_up: 'truth, fairness, consequences, balance',
        meaning_rev: 'unfairness, denial, avoiding accountability',
    },
    {
        name: 'The Hanged Man',
        name_short: 'ar12',
        meaning_up: 'pause, sacrifice, a new perspective',
        meaning_rev: 'stalling, stubbornness, refusing perspective',
    },
    {
        name: 'Death',
        name_short: 'ar13',
        meaning_up: 'endings, transformation, release, a major shift',
        meaning_rev: 'resistance, fear of change, clinging to the past',
    },
    {
        name: 'Temperance',
        name_short: 'ar14',
        meaning_up: 'balance, patience, healing, moderation',
        meaning_rev: 'imbalance, excess, poor timing',
    },
    {
        name: 'The Devil',
        name_short: 'ar15',
        meaning_up: 'temptation, obsession, bad habits, being stuck',
        meaning_rev: 'breaking free, awareness, loosening toxic ties',
    },
    {
        name: 'The Tower',
        name_short: 'ar16',
        meaning_up: 'sudden change, disruption, collapse, uncomfortable truth',
        meaning_rev: 'avoiding disaster, delayed chaos, resisting change',
    },
    {
        name: 'The Star',
        name_short: 'ar17',
        meaning_up: 'hope, renewal, inspiration, calm after chaos',
        meaning_rev: 'lost faith, discouragement, needing rest',
    },
    {
        name: 'The Moon',
        name_short: 'ar18',
        meaning_up: 'confusion, fear, dreams, things not being clear',
        meaning_rev: 'truth emerging, fear fading, illusions breaking',
    },
    {
        name: 'The Sun',
        name_short: 'ar19',
        meaning_up: 'joy, success, clarity, good vibes',
        meaning_rev: 'delayed happiness, overconfidence, temporary clouds',
    },
    {
        name: 'Judgement',
        name_short: 'ar20',
        meaning_up: 'awakening, reckoning, decisions, answering the call',
        meaning_rev: 'doubt, hesitation, avoiding the wake-up call',
    },
    {
        name: 'The World',
        name_short: 'ar21',
        meaning_up: 'completion, success, closure, reaching the next level',
        meaning_rev: 'unfinished business, delay, lack of closure',
    },
];

export const data = new SlashCommandBuilder()
    .setName('tarot')
    .setDescription('Do a mysterious tarot reading.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('Who should receive the tarot reading? Defaults to yourself.')
            .setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName('spread')
            .setDescription('Which tarot spread should be used?')
            .setRequired(false)
            .addChoices(
                {
                    name: 'Single Card',
                    value: 'single',
                },
                {
                    name: 'Two Card',
                    value: 'two_card',
                },
                {
                    name: 'Past, Present, Future',
                    value: 'past_present_future',
                },
                {
                    name: 'Five Card Spread',
                    value: 'five_card',
                },
                {
                    name: 'Celtic Cross',
                    value: 'celtic_cross',
                }
            )
    );

export async function execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('target') ?? interaction.user;
    const targetMember = interaction.options.getMember('target');
    const spreadId = interaction.options.getString('spread') ?? 'past_present_future';
    const spread = spreads[spreadId] ?? spreads.past_present_future;

    const targetName =
        targetMember?.displayName ??
        target.globalName ??
        target.username;

    const { cards, source } = await drawtarotCards(spread.cardCount);
    const imageCatalog = await fetchImageCatalogSafe();

    const cardsWithImages = cards.map((card, index) => ({
        ...card,
        position: spread.positions[index] ?? `Card ${index + 1}`,
        imageUrl: resolveCardImageUrl(card, imageCatalog),
    }));

    let collageAttachment = null;

    try {
        const collageBuffer = await createtarotCollage({
            cards: cardsWithImages,
            targetName,
            spread,
        });

        collageAttachment = new AttachmentBuilder(collageBuffer, {
            name: 'tarot-reading.png',
        });
    } catch (error) {
        console.error('Failed to create tarot collage:', error);
    }

    const embed = new EmbedBuilder()
        .setTitle('🔮 tarot Reading')
        .setDescription(`${target} receives a mysterious and probably questionable **${spread.label}** reading.`)
        .addFields(
            cardsWithImages.slice(0, 10).map((card) => ({
                name: `${card.position}: ${card.displayName}`,
                value: [
                    `**Meaning:** ${truncate(card.meaning, 350)}`,
                    `**Orientation:** ${card.reversed ? 'reversed' : 'upright'}`,
                ].join('\n'),
                inline: false,
            }))
        )
        .setFooter({
            text: `Reading for ${targetName}. Source: ${source}. For entertainment and chaos only.`,
        })
        .setTimestamp();

    if (collageAttachment) {
        embed.setImage('attachment://tarot-reading.png');
    }

    await interaction.editReply({
        embeds: [embed],
        files: collageAttachment ? [collageAttachment] : [],
        allowedMentions: {
            users: [target.id],
        },
    });
}

async function drawtarotCards(count) {
    try {
        const cards = await fetchTarotApiCards(count);

        return {
            cards: cards.map(normalizeApiCard),
            source: 'Tarot API + online card images',
        };
    } catch (error) {
        console.error('Tarot API failed, using fallback deck:', error);

        return {
            cards: drawFallbackCards(count),
            source: 'fallback deck + online card images',
        };
    }
}

async function fetchTarotApiCards(count) {
    const url = new URL(TAROT_API_BASE_URL);
    url.searchParams.set('n', String(count));

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data?.cards)) {
        throw new Error(`Unexpected Tarot API response: ${JSON.stringify(data)}`);
    }

    return data.cards.slice(0, count);
}

function normalizeApiCard(card) {
    const reversed = Math.random() < 0.35;

    const name = card.name ?? 'Unknown Card';
    const nameShort = card.name_short ?? null;

    const uprightMeaning =
        card.meaning_up ??
        card.desc ??
        'unclear upright energy';

    const reversedMeaning =
        card.meaning_rev ??
        `blocked or messy ${uprightMeaning}`;

    return {
        name,
        nameShort,
        reversed,
        displayName: reversed ? `${name} Reversed` : name,
        meaning: reversed ? reversedMeaning : uprightMeaning,
    };
}

function drawFallbackCards(count) {
    const shuffled = shuffle(fallbackCards);

    return shuffled.slice(0, count).map((card) => {
        const reversed = Math.random() < 0.35;

        return {
            name: card.name,
            nameShort: card.name_short,
            reversed,
            displayName: reversed ? `${card.name} Reversed` : card.name,
            meaning: reversed ? card.meaning_rev : card.meaning_up,
        };
    });
}

async function fetchImageCatalogSafe() {
    try {
        return await fetchImageCatalog();
    } catch (error) {
        console.error('Failed to fetch tarot image catalog:', error);
        return [];
    }
}

async function fetchImageCatalog() {
    const now = Date.now();

    if (
        imageCatalogCache.cards.length > 0 &&
        now - imageCatalogCache.fetchedAt < IMAGE_CATALOG_CACHE_MS
    ) {
        return imageCatalogCache.cards;
    }

    const response = await fetch(TAROT_IMAGE_CATALOG_URL);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Failed to fetch tarot image catalog: ${response.status}`);
    }

    const cards = Array.isArray(data)
        ? data
        : Array.isArray(data?.cards)
            ? data.cards
            : [];

    imageCatalogCache = {
        fetchedAt: now,
        cards,
    };

    return cards;
}

function resolveCardImageUrl(card, catalog) {
    const normalizedName = normalizeText(card.name);
    const normalizedShort = normalizeText(card.nameShort ?? '');

    const match = catalog.find((entry) => {
        const entryName = normalizeText(entry.name ?? '');
        const entryShort = normalizeText(entry.name_short ?? entry.nameShort ?? '');

        return (
            (entryName && entryName === normalizedName) ||
            (entryShort && normalizedShort && entryShort === normalizedShort)
        );
    });

    if (!match) {
        return null;
    }

    const rawValue =
        match.image ??
        match.img ??
        match.url ??
        match.image_url ??
        match.imageUrl ??
        match.file ??
        match.filename ??
        match.path ??
        match.src ??
        match?.images?.png ??
        match?.images?.jpg ??
        match?.images?.jpeg ??
        null;

    if (!rawValue) {
        return null;
    }

    if (isHttpUrl(rawValue)) {
        return rawValue;
    }

    return `${TAROT_IMAGE_BASE_URL}${String(rawValue).replace(/^\/+/, '')}`;
}

async function createtarotCollage({ cards, targetName, spread }) {
    const preparedCards = await Promise.all(
        cards.map(async (card) => {
            if (!card.imageUrl) {
                return {
                    ...card,
                    image: null,
                };
            }

            try {
                const response = await fetch(card.imageUrl);

                if (!response.ok) {
                    throw new Error(`Image fetch failed: ${response.status}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const image = await loadImage(Buffer.from(arrayBuffer));

                return {
                    ...card,
                    image,
                };
            } catch (error) {
                console.error(`Failed to load tarot image for ${card.name}:`, error);

                return {
                    ...card,
                    image: null,
                };
            }
        })
    );

    if (spread === spreads.celtic_cross) {
        return createCelticCrossImage({
            cards: preparedCards,
            targetName,
            spread,
        });
    }

    return createGridSpreadImage({
        cards: preparedCards,
        targetName,
        spread,
    });
}

function createGridSpreadImage({ cards, targetName, spread }) {
    const cardWidth = 220;
    const cardHeight = 377;
    const labelHeight = 72;
    const gap = 26;
    const outerPadding = 34;
    const headerHeight = 104;
    const footerHeight = 34;

    const columns = getColumnCount(cards.length);
    const rows = Math.ceil(cards.length / columns);

    const canvasWidth =
        outerPadding * 2 +
        columns * cardWidth +
        (columns - 1) * gap;

    const canvasHeight =
        outerPadding * 2 +
        headerHeight +
        rows * (cardHeight + labelHeight) +
        (rows - 1) * gap +
        footerHeight;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    drawMysticBackground(ctx, canvasWidth, canvasHeight);
    drawOrnateBorder(ctx, canvasWidth, canvasHeight);

    drawHeader(ctx, {
        width: canvasWidth,
        title: 'tarot Reading',
        subtitle: `${spread.label} for ${targetName}`,
    });

    cards.forEach((card, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);

        const x = outerPadding + column * (cardWidth + gap);
        const y = outerPadding + headerHeight + row * (cardHeight + labelHeight + gap);

        drawCardPanel(ctx, {
            x,
            y,
            cardWidth,
            cardHeight,
            labelHeight,
            card,
        });
    });

    return canvas.toBuffer('image/png');
}

function createCelticCrossImage({ cards, targetName, spread }) {
    const cardWidth = 150;
    const cardHeight = 257;
    const labelHeight = 62;
    const slotWidth = 200;
    const slotHeight = 340;

    const canvasWidth = 1180;
    const canvasHeight = 1020;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    drawMysticBackground(ctx, canvasWidth, canvasHeight);
    drawOrnateBorder(ctx, canvasWidth, canvasHeight);

    drawHeader(ctx, {
        width: canvasWidth,
        title: 'tarot Reading',
        subtitle: `${spread.label} for ${targetName}`,
    });

    const positions = [
        { x: 380, y: 390 },
        { x: 380, y: 390, rotated: true },
        { x: 380, y: 650 },
        { x: 170, y: 390 },
        { x: 380, y: 130 },
        { x: 590, y: 390 },
        { x: 850, y: 710 },
        { x: 850, y: 520 },
        { x: 850, y: 330 },
        { x: 850, y: 140 },
    ];

    cards.forEach((card, index) => {
        const position = positions[index];

        if (!position) {
            return;
        }

        drawCelticCardPanel(ctx, {
            x: position.x,
            y: position.y,
            slotWidth,
            slotHeight,
            cardWidth,
            cardHeight,
            labelHeight,
            card,
            rotated: position.rotated ?? false,
        });
    });

    return canvas.toBuffer('image/png');
}

function drawMysticBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1b1230');
    gradient.addColorStop(0.5, '#0f0a1b');
    gradient.addColorStop(1, '#2a153d');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.08;

    for (let i = 0; i < 140; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 2.2 + 0.8;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#d8b66a';
    ctx.lineWidth = 1;

    for (let i = 0; i < 7; i++) {
        const radius = 120 + i * 70;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawOrnateBorder(ctx, width, height) {
    ctx.save();

    ctx.strokeStyle = '#d8b66a';
    ctx.lineWidth = 4;
    roundRect(ctx, 14, 14, width - 28, height - 28, 28);
    ctx.stroke();

    ctx.strokeStyle = '#7d5b28';
    ctx.lineWidth = 2;
    roundRect(ctx, 24, 24, width - 48, height - 48, 22);
    ctx.stroke();

    drawCornerOrnament(ctx, 42, 42);
    drawCornerOrnament(ctx, width - 42, 42, Math.PI / 2);
    drawCornerOrnament(ctx, width - 42, height - 42, Math.PI);
    drawCornerOrnament(ctx, 42, height - 42, Math.PI * 1.5);

    ctx.restore();
}

function drawCornerOrnament(ctx, x, y, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.strokeStyle = '#d8b66a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(40, 0, 54, 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(0, 40, 30, 54);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(36, 36, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawHeader(ctx, { width, title, subtitle }) {
    ctx.save();

    ctx.textAlign = 'center';

    ctx.font = 'bold 38px Georgia, serif';
    ctx.fillStyle = '#f7efe2';
    ctx.fillText(title, width / 2, 58);

    ctx.font = '20px Arial, sans-serif';
    ctx.fillStyle = '#d8c7a7';
    ctx.fillText(subtitle, width / 2, 88);

    ctx.restore();
}

function drawCardPanel(ctx, options) {
    const {
        x,
        y,
        cardWidth,
        cardHeight,
        labelHeight,
        card,
    } = options;

    drawPanelBase(ctx, {
        x,
        y,
        width: cardWidth,
        height: cardHeight + labelHeight,
        radius: 18,
    });

    drawCardImage(ctx, {
        x,
        y,
        cardWidth,
        cardHeight,
        card,
    });

    drawCardLabel(ctx, {
        x,
        y: y + cardHeight,
        width: cardWidth,
        height: labelHeight,
        card,
    });
}

function drawCelticCardPanel(ctx, options) {
    const {
        x,
        y,
        slotWidth,
        slotHeight,
        cardWidth,
        cardHeight,
        labelHeight,
        card,
        rotated,
    } = options;

    const panelX = x;
    const panelY = y;
    const cardX = panelX + (slotWidth - cardWidth) / 2;
    const cardY = panelY + 8;

    drawPanelBase(ctx, {
        x: panelX,
        y: panelY,
        width: slotWidth,
        height: slotHeight,
        radius: 18,
    });

    if (rotated) {
        ctx.save();
        ctx.translate(panelX + slotWidth / 2, cardY + cardHeight / 2);
        ctx.rotate(Math.PI / 2);

        drawCardImage(ctx, {
            x: -cardWidth / 2,
            y: -cardHeight / 2,
            cardWidth,
            cardHeight,
            card,
        });

        ctx.restore();
    } else {
        drawCardImage(ctx, {
            x: cardX,
            y: cardY,
            cardWidth,
            cardHeight,
            card,
        });
    }

    drawCardLabel(ctx, {
        x: panelX + 10,
        y: panelY + slotHeight - labelHeight - 8,
        width: slotWidth - 20,
        height: labelHeight,
        card,
    });
}

function drawPanelBase(ctx, { x, y, width, height, radius }) {
    ctx.save();

    roundRect(ctx, x - 7, y - 7, width + 14, height + 14, radius + 4);
    ctx.fillStyle = 'rgba(9, 6, 18, 0.55)';
    ctx.fill();

    roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = '#2a1d46';
    ctx.fill();

    ctx.strokeStyle = '#d8b66a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

function drawCardImage(ctx, { x, y, cardWidth, cardHeight, card }) {
    ctx.save();

    roundRect(ctx, x, y, cardWidth, cardHeight, 12);
    ctx.fillStyle = '#eadfc7';
    ctx.fill();

    if (card.image) {
        ctx.save();
        roundRect(ctx, x, y, cardWidth, cardHeight, 12);
        ctx.clip();

        if (card.reversed) {
            ctx.translate(x + cardWidth / 2, y + cardHeight / 2);
            ctx.rotate(Math.PI);
            ctx.drawImage(card.image, -cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        } else {
            ctx.drawImage(card.image, x, y, cardWidth, cardHeight);
        }

        ctx.restore();
    } else {
        ctx.fillStyle = '#cfc5ad';
        ctx.fillRect(x, y, cardWidth, cardHeight);

        ctx.fillStyle = '#4a3d31';
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px Arial, sans-serif';
        wrapCenteredText(ctx, 'Image unavailable', x + cardWidth / 2, y + cardHeight / 2 - 18, cardWidth - 20, 26);

        ctx.font = '16px Arial, sans-serif';
        wrapCenteredText(ctx, card.name, x + cardWidth / 2, y + cardHeight / 2 + 24, cardWidth - 24, 22);
    }

    ctx.strokeStyle = '#1a102a';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, cardWidth, cardHeight, 12);
    ctx.stroke();

    ctx.restore();
}

function drawCardLabel(ctx, { x, y, width, height, card }) {
    ctx.save();

    ctx.fillStyle = '#f7efe2';
    ctx.textAlign = 'center';

    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.fillText(card.position, x + width / 2, y + 23);

    ctx.font = '15px Arial, sans-serif';
    ctx.fillStyle = '#d8c7a7';

    const orientationText = card.reversed ? 'Reversed' : 'Upright';

    wrapCenteredText(
        ctx,
        `${card.name} • ${orientationText}`,
        x + width / 2,
        y + 48,
        width - 12,
        18
    );

    ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function wrapCenteredText(ctx, text, centerX, startY, maxWidth, lineHeight) {
    const lines = wrapText(ctx, text, maxWidth);

    lines.forEach((line, index) => {
        ctx.fillText(line, centerX, startY + index * lineHeight);
    });
}

function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
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

        currentLine = word;
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length ? lines.slice(0, 3) : [''];
}

function getColumnCount(cardCount) {
    if (cardCount === 1) return 1;
    if (cardCount === 2) return 2;
    if (cardCount === 3) return 3;
    if (cardCount === 4) return 2;
    return 3;
}

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function truncate(text, maxLength) {
    const value = String(text);

    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
}

function shuffle(items) {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
    }

    return shuffled;
}