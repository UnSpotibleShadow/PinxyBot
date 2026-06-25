import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BONKS_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'bonks.json'
);

const BONK_TIMEOUT_MS = 60_000;

// Configurable special chances.
// These are x out of 100.
// Example: 5 = 5% chance.
const LETHAL_BONK_CHANCE = 5;
const COUNTER_BONK_CHANCE = 5;

const DEFAULT_BONK_PROFILE = {
    templateFile: path.join(
        __dirname,
        '..',
        '..',
        'assets',
        'bonks',
        'bonk-template.jpg'
    ),
    layout: {
        leftName: {
            centerX: 88,
            centerY: 292,
            maxWidth: 130,
            maxFontSize: 24,
            minFontSize: 12,
            rotation: -0.04,
        },
        rightName: {
            centerX: 294,
            centerY: 303,
            maxWidth: 105,
            maxFontSize: 20,
            minFontSize: 11,
            rotation: 0.04,
        },
        reason: {
            centerX: 192,
            topY: 18,
            maxWidth: 300,
            maxFontSize: 20,
            minFontSize: 11,
            maxLines: 3,
        },
    },
};

const LETHAL_BONK_PROFILE = {
    templateFile: path.join(
        __dirname,
        '..',
        '..',
        'assets',
        'bonks',
        'bonk-template-lethal.png'
    ),
    layout: {
        leftName: {
            centerX: 260,
            centerY: 725,
            maxWidth: 210,
            maxFontSize: 34,
            minFontSize: 16,
            rotation: -0.04,
        },
        rightName: {
            centerX: 900,
            centerY: 965,
            maxWidth: 240,
            maxFontSize: 34,
            minFontSize: 16,
            rotation: 0.02,
        },
        reason: {
            centerX: 625,
            topY: 32,
            maxWidth: 650,
            maxFontSize: 34,
            minFontSize: 16,
            maxLines: 3,
        },
    },
};

const COUNTER_BONK_PROFILE = {
    templateFile: path.join(
        __dirname,
        '..',
        '..',
        'assets',
        'bonks',
        'bonk-template-counter.png'
    ),
    layout: {
        leftName: {
            centerX: 270,
            centerY: 820,
            maxWidth: 230,
            maxFontSize: 34,
            minFontSize: 16,
            rotation: -0.05,
        },
        rightName: {
            centerX: 910,
            centerY: 855,
            maxWidth: 240,
            maxFontSize: 34,
            minFontSize: 16,
            rotation: 0.03,
        },
        reason: {
            centerX: 625,
            topY: 34,
            maxWidth: 650,
            maxFontSize: 34,
            minFontSize: 16,
            maxLines: 3,
        },
    },
};

// Add special bonk profiles here.
// chance = x out of 100.
// Example: chance: 25 means 25/100 chance when that user uses /bonk.
const bonkerOverrides = [
    {
        bonkerId: '1410897591977246822',
        chance: 20,
        profile: {
            templateFile: path.join(
                __dirname,
                '..',
                '..',
                'assets',
                'bonks',
                'bonk-template-fran.jpg'
            ),
            layout: {
                leftName: {
                    centerX: 595,
                    centerY: 300,
                    maxWidth: 190,
                    maxFontSize: 34,
                    minFontSize: 16,
                    rotation: -0.18,
                },
                rightName: {
                    centerX: 930,
                    centerY: 275,
                    maxWidth: 210,
                    maxFontSize: 34,
                    minFontSize: 16,
                    rotation: 0.12,
                },
                reason: {
                    centerX: 700,
                    topY: 28,
                    maxWidth: 500,
                    maxFontSize: 28,
                    minFontSize: 14,
                    maxLines: 3,
                },
            },
        },
    },
    {
        bonkerId: '564230384389193751',
        chance: 20,
        profile: {
            templateFile: path.join(
                __dirname,
                '..',
                '..',
                'assets',
                'bonks',
                'bonk-template-bread.jpg'
            ),
            layout: {
                leftName: {
                    centerX: 145,
                    centerY: 250,
                    maxWidth: 145,
                    maxFontSize: 24,
                    minFontSize: 12,
                    rotation: -0.04,
                },
                rightName: {
                    centerX: 445,
                    centerY: 280,
                    maxWidth: 120,
                    maxFontSize: 22,
                    minFontSize: 11,
                    rotation: 0.04,
                },
                reason: {
                    centerX: 260,
                    topY: 16,
                    maxWidth: 320,
                    maxFontSize: 22,
                    minFontSize: 11,
                    maxLines: 2,
                },
            },
        },
    },
];

export const data = new SlashCommandBuilder()
    .setName('bonk')
    .setDescription('Bonk someone and keep count.')
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('The person to bonk.')
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName('reason')
            .setDescription('Why are they being bonked?')
            .setRequired(false)
            .setMaxLength(200)
    );

export async function execute(interaction) {
    const target = interaction.options.getUser('target', true);
    const targetMember = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason')?.trim();

    if (interaction.user.id === target.id) {
        await interaction.reply({
            content: `🔨 ${interaction.user} tried to bonk themselves...`,
            allowedMentions: {
                users: [interaction.user.id],
            },
        });

        return;
    }

    const bonkerName =
        interaction.member?.displayName ??
        interaction.user.globalName ??
        interaction.user.username;

    const targetName =
        targetMember?.displayName ??
        target.globalName ??
        target.username;

    const specialBonk = getSpecialBonkEvent();

    const bonkProfile = specialBonk
        ? getSpecialBonkProfile(specialBonk)
        : getBonkProfile(interaction.user.id);

    const bonks = await loadBonks();

    const countedUserId = specialBonk === 'counter'
        ? interaction.user.id
        : target.id;

    bonks[countedUserId] = (bonks[countedUserId] ?? 0) + 1;
    await saveBonks(bonks);

    const count = bonks[countedUserId];

    const renderedImage = await renderBonkImage({
        templatePath: bonkProfile.templateFile,
        leftName: bonkerName,
        rightName: targetName,
        reason,
        layout: bonkProfile.layout,
    });

    const attachment = new AttachmentBuilder(renderedImage, {
        name: 'bonk.png',
    });

    const timeoutResult = await applySpecialTimeout({
        interaction,
        targetMember,
        specialBonk,
        reason,
    });

    const content = createBonkMessage({
        interaction,
        target,
        reason,
        count,
        specialBonk,
        timeoutResult,
    });

    const embed = new EmbedBuilder()
        .setImage('attachment://bonk.png');

    await interaction.reply({
        content,
        embeds: [embed],
        files: [attachment],
        allowedMentions: {
            users: [interaction.user.id, target.id],
        },
    });
}

function getSpecialBonkEvent() {
    const lethalChance = clampChance(LETHAL_BONK_CHANCE);
    const counterChance = clampChance(COUNTER_BONK_CHANCE);
    const totalChance = Math.min(100, lethalChance + counterChance);

    if (totalChance <= 0) {
        return null;
    }

    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= lethalChance) {
        return 'lethal';
    }

    if (roll <= lethalChance + counterChance) {
        return 'counter';
    }

    return null;
}

function getSpecialBonkProfile(specialBonk) {
    if (specialBonk === 'lethal') {
        return LETHAL_BONK_PROFILE;
    }

    if (specialBonk === 'counter') {
        return COUNTER_BONK_PROFILE;
    }

    return DEFAULT_BONK_PROFILE;
}

async function applySpecialTimeout({ interaction, targetMember, specialBonk, reason }) {
    if (specialBonk === 'lethal') {
        return tryTimeoutMember({
            member: targetMember,
            timeoutReason: createTimeoutReason({
                actor: interaction.user,
                reason,
                type: 'Lethal bonk',
            }),
            successMessage: `${targetMember?.user ?? 'The target'} was timed out for 60 seconds.`,
            failMessage: 'I could not timeout the target. I may need **Moderate Members**, or my role may be too low.',
        });
    }

    if (specialBonk === 'counter') {
        return tryTimeoutMember({
            member: interaction.member,
            timeoutReason: createTimeoutReason({
                actor: interaction.user,
                reason,
                type: 'Counter bonk',
            }),
            successMessage: `${interaction.user} was counter-bonked and timed out for 60 seconds.`,
            failMessage: 'I could not timeout the bonker. I may need **Moderate Members**, or my role may be too low.',
        });
    }

    return null;
}

async function tryTimeoutMember({ member, timeoutReason, successMessage, failMessage }) {
    if (!member || typeof member.timeout !== 'function') {
        return failMessage;
    }

    if (!member.moderatable) {
        return failMessage;
    }

    try {
        await member.timeout(BONK_TIMEOUT_MS, timeoutReason);
        return successMessage;
    } catch (error) {
        console.error('Failed to apply bonk timeout:', error);
        return failMessage;
    }
}

function createTimeoutReason({ actor, reason, type }) {
    return [
        `${type} by ${actor.tag ?? actor.username}`,
        reason ? `Reason: ${reason}` : null,
    ].filter(Boolean).join(' | ').slice(0, 512);
}

function createBonkMessage({ interaction, target, reason, count, specialBonk, timeoutResult }) {
    if (specialBonk === 'lethal') {
        return [
            `💀 ${interaction.user} lands a **LETHAL BONK** on ${target}!`,
            reason ? `**Reason:** ${reason}` : null,
            '',
            `${target} has now been bonked **${count}** time${count === 1 ? '' : 's'}.`,
            timeoutResult ? `⏱️ ${timeoutResult}` : null,
        ].filter(Boolean).join('\n');
    }

    if (specialBonk === 'counter') {
        return [
            `🛡️ ${target} **brought a bigger bat against** ${interaction.user}'s bonk!`,
            reason ? `**Original reason:** ${reason}` : null,
            '',
            `${interaction.user} has now been bonked **${count}** time${count === 1 ? '' : 's'}.`,
            timeoutResult ? `⏱️ ${timeoutResult}` : null,
        ].filter(Boolean).join('\n');
    }

    return [
        `🔨 ${interaction.user} bonks ${target}!`,
        reason ? `**Reason:** ${reason}` : null,
        '',
        `${target} has now been bonked **${count}** time${count === 1 ? '' : 's'}.`,
    ].filter(Boolean).join('\n');
}

async function renderBonkImage({ templatePath, leftName, rightName, reason, layout }) {
    const image = await loadImage(templatePath);

    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    drawNameTag(ctx, {
        text: leftName,
        ...layout.leftName,
    });

    drawNameTag(ctx, {
        text: rightName,
        ...layout.rightName,
    });

    if (reason) {
        drawReasonBox(ctx, {
            text: reason,
            ...layout.reason,
        });
    }

    return canvas.toBuffer('image/png');
}

function getBonkProfile(bonkerId) {
    const override = getTriggeredBonkerOverride(bonkerId);

    if (!override) {
        return DEFAULT_BONK_PROFILE;
    }

    return {
        templateFile: override.profile?.templateFile ?? DEFAULT_BONK_PROFILE.templateFile,
        layout: {
            leftName: {
                ...DEFAULT_BONK_PROFILE.layout.leftName,
                ...override.profile?.layout?.leftName,
            },
            rightName: {
                ...DEFAULT_BONK_PROFILE.layout.rightName,
                ...override.profile?.layout?.rightName,
            },
            reason: {
                ...DEFAULT_BONK_PROFILE.layout.reason,
                ...override.profile?.layout?.reason,
            },
        },
    };
}

function getTriggeredBonkerOverride(bonkerId) {
    const matchingOverrides = bonkerOverrides.filter((override) =>
        override.bonkerId === bonkerId
    );

    for (const override of matchingOverrides) {
        const chance = clampChance(override.chance);
        const roll = Math.floor(Math.random() * 100) + 1;

        if (roll <= chance) {
            return override;
        }
    }

    return null;
}

function clampChance(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.max(0, Math.min(100, Math.round(number)));
}

function drawNameTag(ctx, options) {
    const {
        text,
        centerX,
        centerY,
        maxWidth,
        maxFontSize,
        minFontSize,
        rotation = 0,
    } = options;

    const safeText = sanitizeName(text) || 'Unknown';
    const fontSize = getBestFontSize(ctx, safeText, maxWidth, maxFontSize, minFontSize);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);

    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(safeText).width;
    const boxWidth = Math.min(textWidth + 18, maxWidth + 18);
    const boxHeight = fontSize + 12;

    roundRect(
        ctx,
        -boxWidth / 2,
        -boxHeight / 2,
        boxWidth,
        boxHeight,
        10
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fill();

    roundRect(
        ctx,
        -boxWidth / 2,
        -boxHeight / 2,
        boxWidth,
        boxHeight,
        10
    );
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillStyle = 'rgba(20, 20, 20, 1)';
    ctx.strokeText(safeText, 0, 1);
    ctx.fillText(safeText, 0, 1);

    ctx.restore();
}

function drawReasonBox(ctx, options) {
    const {
        text,
        centerX,
        topY,
        maxWidth,
        maxFontSize,
        minFontSize,
        maxLines,
    } = options;

    const safeText = sanitizeReason(text);
    const fitted = getWrappedTextLayout(
        ctx,
        safeText,
        maxWidth,
        maxFontSize,
        minFontSize,
        maxLines
    );

    const paddingX = 12;
    const paddingY = 10;
    const lineGap = 4;

    const lineHeight = fitted.fontSize + lineGap;
    const boxWidth = fitted.width + paddingX * 2;
    const boxHeight =
        fitted.lines.length * lineHeight - lineGap + paddingY * 2;

    const x = centerX - boxWidth / 2;
    const y = topY;

    roundRect(ctx, x, y, boxWidth, boxHeight, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    roundRect(ctx, x, y, boxWidth, boxHeight, 12);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.stroke();

    ctx.font = `bold ${fitted.fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(20, 20, 20, 1)';

    let currentY = y + paddingY;

    for (const line of fitted.lines) {
        ctx.fillText(line, centerX, currentY);
        currentY += lineHeight;
    }
}

function getWrappedTextLayout(ctx, text, maxWidth, startSize, minSize, maxLines) {
    for (let fontSize = startSize; fontSize >= minSize; fontSize--) {
        ctx.font = `bold ${fontSize}px Arial`;

        const lines = wrapText(ctx, text, maxWidth);

        if (lines.length <= maxLines) {
            const width = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);

            return {
                fontSize,
                lines,
                width,
            };
        }
    }

    ctx.font = `bold ${minSize}px Arial`;
    const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);

    if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];

        if (!lastLine.endsWith('...')) {
            lines[lines.length - 1] = trimToWidth(ctx, `${lastLine}...`, maxWidth);
        }
    }

    return {
        fontSize: minSize,
        lines,
        width: Math.max(...lines.map((line) => ctx.measureText(line).width), 0),
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
        } else {
            if (currentLine) {
                lines.push(currentLine);
            }

            if (ctx.measureText(word).width <= maxWidth) {
                currentLine = word;
            } else {
                currentLine = trimToWidth(ctx, word, maxWidth);
            }
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
}

function trimToWidth(ctx, text, maxWidth) {
    let trimmed = text;

    while (trimmed.length > 0 && ctx.measureText(trimmed).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }

    return trimmed;
}

function getBestFontSize(ctx, text, maxWidth, startSize, minSize) {
    for (let size = startSize; size >= minSize; size--) {
        ctx.font = `bold ${size}px Arial`;

        if (ctx.measureText(text).width <= maxWidth) {
            return size;
        }
    }

    return minSize;
}

function sanitizeName(text) {
    return String(text)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 18);
}

function sanitizeReason(text) {
    return String(text)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
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

async function loadBonks() {
    try {
        const raw = await fs.readFile(BONKS_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return {};
        }

        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }

        console.error('Failed to load bonks.json:', error);
        return {};
    }
}

async function saveBonks(bonks) {
    await fs.mkdir(path.dirname(BONKS_FILE), { recursive: true });
    await fs.writeFile(BONKS_FILE, JSON.stringify(bonks, null, 4), 'utf8');
}