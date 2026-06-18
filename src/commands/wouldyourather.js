import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUESTIONS_FILE = path.join(
    __dirname,
    '..',
    '..',
    'assets',
    'datafiles',
    'wyr-questions.json'
);

const WYR_API_URL = 'https://tinyfn.io/v1/fun/would-you-rather';

const fallbackQuestions = [
    'Would you rather be able to fly or turn invisible?',
    'Would you rather always be 10 minutes late or always be 20 minutes early?',
    'Would you rather talk to animals or speak every human language?',
];

export const data = new SlashCommandBuilder()
    .setName('wyr')
    .setDescription('Ask a Would You Rather question.')
    .addStringOption((option) =>
        option
            .setName('answer_a')
            .setDescription('Optional first answer.')
            .setRequired(false)
            .setMaxLength(250)
    )
    .addStringOption((option) =>
        option
            .setName('answer_b')
            .setDescription('Optional second answer.')
            .setRequired(false)
            .setMaxLength(250)
    );

export async function execute(interaction) {
    await interaction.deferReply();

    const answerA = interaction.options.getString('answer_a')?.trim();
    const answerB = interaction.options.getString('answer_b')?.trim();

    if ((answerA && !answerB) || (!answerA && answerB)) {
        await interaction.editReply({
            content: 'Please provide both `answer_a` and `answer_b`, or leave both empty for a random question.',
        });

        return;
    }

    const question = answerA && answerB
        ? createCustomQuestion(answerA, answerB)
        : await getWouldYouRatherQuestion();

    const embed = new EmbedBuilder()
        .setTitle('🤔 Would You Rather?')
        .setDescription(question)
        .addFields(
            {
                name: '🅰️ Option A',
                value: answerA || extractOptionA(question),
                inline: true,
            },
            {
                name: '🅱️ Option B',
                value: answerB || extractOptionB(question),
                inline: true,
            }
        )
        .setFooter({
            text: answerA && answerB
                ? `Asked by ${interaction.user.username}`
                : 'Random question',
            iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

    const message = await interaction.editReply({
        embeds: [embed],
    });

    await message.react('🅰️');
    await message.react('🅱️');
}

function createCustomQuestion(answerA, answerB) {
    return `Would you rather **${cleanAnswer(answerA)}** or **${cleanAnswer(answerB)}**?`;
}

async function getWouldYouRatherQuestion() {
    const apiQuestion = await getQuestionFromApi();

    if (apiQuestion) {
        return apiQuestion;
    }

    return getQuestionFromJson();
}

async function getQuestionFromApi() {
    try {
        if (!process.env.TINYFN_API_KEY) {
            return null;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        const response = await fetch(WYR_API_URL, {
            headers: {
                'X-API-Key': process.env.TINYFN_API_KEY,
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            console.log(`WYR API failed with status ${response.status}`);
            return null;
        }

        const data = await response.json();
        return extractQuestionFromApiResponse(data);
    } catch (error) {
        console.log('WYR API failed:', error.message);
        return null;
    }
}

function extractQuestionFromApiResponse(data) {
    if (typeof data === 'string') {
        return normalizeQuestion(data);
    }

    if (data && typeof data.question === 'string') {
        return normalizeQuestion(data.question);
    }

    if (data && typeof data.text === 'string') {
        return normalizeQuestion(data.text);
    }

    if (data && typeof data.prompt === 'string') {
        return normalizeQuestion(data.prompt);
    }

    const optionA =
        data?.optionA ??
        data?.option_a ??
        data?.optionOne ??
        data?.option_one ??
        data?.a;

    const optionB =
        data?.optionB ??
        data?.option_b ??
        data?.optionTwo ??
        data?.option_two ??
        data?.b;

    const textA = extractOptionText(optionA);
    const textB = extractOptionText(optionB);

    if (textA && textB) {
        return createCustomQuestion(textA, textB);
    }

    return null;
}

function extractOptionText(option) {
    if (typeof option === 'string') {
        return cleanAnswer(option);
    }

    if (option && typeof option.text === 'string') {
        return cleanAnswer(option.text);
    }

    if (option && typeof option.label === 'string') {
        return cleanAnswer(option.label);
    }

    if (option && typeof option.description === 'string') {
        return cleanAnswer(option.description);
    }

    return null;
}

async function getQuestionFromJson() {
    try {
        const raw = await fs.readFile(QUESTIONS_FILE, 'utf8');
        const questions = JSON.parse(raw);

        if (!Array.isArray(questions)) {
            return randomFrom(fallbackQuestions);
        }

        const validQuestions = questions.filter((question) =>
            typeof question === 'string' && question.trim().length > 0
        );

        if (validQuestions.length === 0) {
            return randomFrom(fallbackQuestions);
        }

        return normalizeQuestion(randomFrom(validQuestions));
    } catch (error) {
        console.error('Failed to load wyr-questions.json:', error);
        return randomFrom(fallbackQuestions);
    }
}

function normalizeQuestion(question) {
    const cleanQuestion = String(question)
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanQuestion) {
        return randomFrom(fallbackQuestions);
    }

    if (cleanQuestion.endsWith('?')) {
        return cleanQuestion;
    }

    return `${cleanQuestion}?`;
}

function cleanAnswer(answer) {
    return String(answer)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[?.!]+$/, '');
}

function extractOptionA(question) {
    const match = question.match(/would you rather\s+\*\*(.*?)\*\*\s+or\s+\*\*(.*?)\*\*/i);

    if (match) {
        return match[1];
    }

    return 'Option A';
}

function extractOptionB(question) {
    const match = question.match(/would you rather\s+\*\*(.*?)\*\*\s+or\s+\*\*(.*?)\*\*/i);

    if (match) {
        return match[2];
    }

    return 'Option B';
}

function randomFrom(items) {
    return items[Math.floor(Math.random() * items.length)];
}