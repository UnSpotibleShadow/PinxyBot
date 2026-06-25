import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

const FRANKFURTER_RATES_URL = 'https://api.frankfurter.dev/v2/rates';

const unitGroups = {
    length: {
        label: 'Length',
        baseUnit: 'm',
        units: {
            mm: { label: 'millimeters', factor: 0.001 },
            cm: { label: 'centimeters', factor: 0.01 },
            m: { label: 'meters', factor: 1 },
            km: { label: 'kilometers', factor: 1000 },
            in: { label: 'inches', factor: 0.0254 },
            ft: { label: 'feet', factor: 0.3048 },
            yd: { label: 'yards', factor: 0.9144 },
            mi: { label: 'miles', factor: 1609.344 },
            nmi: { label: 'nautical miles', factor: 1852 },
        },
    },
    speed: {
        label: 'Speed',
        baseUnit: 'm/s',
        units: {
            mps: { label: 'meters per second', factor: 1 },
            kmh: { label: 'kilometers per hour', factor: 1000 / 3600 },
            kph: { label: 'kilometers per hour', factor: 1000 / 3600 },
            mph: { label: 'miles per hour', factor: 1609.344 / 3600 },
            fps: { label: 'feet per second', factor: 0.3048 },
            knot: { label: 'knots', factor: 1852 / 3600 },
            knots: { label: 'knots', factor: 1852 / 3600 },
        },
    },
    weight: {
        label: 'Weight / Mass',
        baseUnit: 'kg',
        units: {
            mg: { label: 'milligrams', factor: 0.000001 },
            g: { label: 'grams', factor: 0.001 },
            kg: { label: 'kilograms', factor: 1 },
            t: { label: 'metric tons', factor: 1000 },
            oz: { label: 'ounces', factor: 0.028349523125 },
            lb: { label: 'pounds', factor: 0.45359237 },
            lbs: { label: 'pounds', factor: 0.45359237 },
            st: { label: 'stone', factor: 6.35029318 },
        },
    },
    volume: {
        label: 'Volume',
        baseUnit: 'l',
        units: {
            ml: { label: 'milliliters', factor: 0.001 },
            l: { label: 'liters', factor: 1 },
            liter: { label: 'liters', factor: 1 },
            m3: { label: 'cubic meters', factor: 1000 },
            tsp: { label: 'teaspoons', factor: 0.00492892159375 },
            tbsp: { label: 'tablespoons', factor: 0.01478676478125 },
            floz: { label: 'US fluid ounces', factor: 0.0295735295625 },
            cup: { label: 'US cups', factor: 0.2365882365 },
            pt: { label: 'US pints', factor: 0.473176473 },
            qt: { label: 'US quarts', factor: 0.946352946 },
            gal: { label: 'US gallons', factor: 3.785411784 },
        },
    },
    area: {
        label: 'Area',
        baseUnit: 'm²',
        units: {
            mm2: { label: 'square millimeters', factor: 0.000001 },
            cm2: { label: 'square centimeters', factor: 0.0001 },
            m2: { label: 'square meters', factor: 1 },
            km2: { label: 'square kilometers', factor: 1_000_000 },
            ft2: { label: 'square feet', factor: 0.09290304 },
            yd2: { label: 'square yards', factor: 0.83612736 },
            mi2: { label: 'square miles', factor: 2_589_988.110336 },
            acre: { label: 'acres', factor: 4046.8564224 },
            ha: { label: 'hectares', factor: 10_000 },
        },
    },
};

export const data = new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert currencies, units, temperature, speed, weight, and more.')
    .addSubcommand((subcommand) =>
        subcommand
            .setName('currency')
            .setDescription('Convert currency using live exchange rates.')
            .addNumberOption((option) =>
                option
                    .setName('amount')
                    .setDescription('Amount to convert.')
                    .setRequired(true)
                    .setMinValue(0.000001)
            )
            .addStringOption((option) =>
                option
                    .setName('from')
                    .setDescription('Currency to convert from. Example: EUR, USD, GBP')
                    .setRequired(true)
                    .setMinLength(3)
                    .setMaxLength(3)
            )
            .addStringOption((option) =>
                option
                    .setName('to')
                    .setDescription('Currency to convert to. Example: USD, EUR, JPY')
                    .setRequired(true)
                    .setMinLength(3)
                    .setMaxLength(3)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('temperature')
            .setDescription('Convert temperature.')
            .addNumberOption((option) =>
                option
                    .setName('amount')
                    .setDescription('Temperature to convert.')
                    .setRequired(true)
            )
            .addStringOption((option) =>
                option
                    .setName('from')
                    .setDescription('Unit to convert from.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Celsius', value: 'c' },
                        { name: 'Fahrenheit', value: 'f' },
                        { name: 'Kelvin', value: 'k' }
                    )
            )
            .addStringOption((option) =>
                option
                    .setName('to')
                    .setDescription('Unit to convert to.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Celsius', value: 'c' },
                        { name: 'Fahrenheit', value: 'f' },
                        { name: 'Kelvin', value: 'k' }
                    )
            )
    )
    .addSubcommand((subcommand) =>
        addUnitOptions(
            subcommand
                .setName('length')
                .setDescription('Convert length.'),
            unitGroups.length
        )
    )
    .addSubcommand((subcommand) =>
        addUnitOptions(
            subcommand
                .setName('speed')
                .setDescription('Convert speed.'),
            unitGroups.speed
        )
    )
    .addSubcommand((subcommand) =>
        addUnitOptions(
            subcommand
                .setName('weight')
                .setDescription('Convert weight or mass.'),
            unitGroups.weight
        )
    )
    .addSubcommand((subcommand) =>
        addUnitOptions(
            subcommand
                .setName('volume')
                .setDescription('Convert volume.'),
            unitGroups.volume
        )
    )
    .addSubcommand((subcommand) =>
        addUnitOptions(
            subcommand
                .setName('area')
                .setDescription('Convert area.'),
            unitGroups.area
        )
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'currency') {
        await convertCurrency(interaction);
        return;
    }

    if (subcommand === 'temperature') {
        await convertTemperature(interaction);
        return;
    }

    if (unitGroups[subcommand]) {
        await convertUnit(interaction, unitGroups[subcommand]);
    }
}

async function convertCurrency(interaction) {
    await interaction.deferReply();

    const amount = interaction.options.getNumber('amount', true);
    const from = normalizeCurrencyCode(interaction.options.getString('from', true));
    const to = normalizeCurrencyCode(interaction.options.getString('to', true));

    if (!isValidCurrencyCode(from) || !isValidCurrencyCode(to)) {
        await interaction.editReply({
            content: 'Please use 3-letter currency codes, like `EUR`, `USD`, `GBP`, or `JPY`.',
        });

        return;
    }

    if (from === to) {
        await interaction.editReply({
            embeds: [
                createResultEmbed({
                    title: 'Currency Conversion',
                    input: `${formatNumber(amount)} ${from}`,
                    output: `${formatNumber(amount)} ${to}`,
                    extra: 'Same currency, same amount.',
                }),
            ],
        });

        return;
    }

    let conversion;

    try {
        conversion = await fetchCurrencyConversion({
            amount,
            from,
            to,
        });
    } catch (error) {
        console.error('Currency conversion failed:', error);

        await interaction.editReply({
            content: [
                'I could not fetch the exchange rate right now.',
                '',
                'Make sure the currency codes are valid. Example: `/convert currency amount:10 from:EUR to:USD`',
            ].join('\n'),
        });

        return;
    }

    await interaction.editReply({
        embeds: [
            createResultEmbed({
                title: 'Currency Conversion',
                input: `${formatNumber(amount)} ${from}`,
                output: `${formatNumber(conversion.converted)} ${to}`,
                extra: [
                    `Rate: 1 ${from} = ${formatNumber(conversion.rate)} ${to}`,
                    conversion.date ? `Rate date: ${conversion.date}` : null,
                    'Source: Frankfurter',
                ].filter(Boolean).join('\n'),
            }),
        ],
    });
}

async function convertTemperature(interaction) {
    const amount = interaction.options.getNumber('amount', true);
    const from = interaction.options.getString('from', true);
    const to = interaction.options.getString('to', true);

    const result = convertTemperatureValue(amount, from, to);

    if (result === null) {
        await interaction.reply({
            content: 'Invalid temperature conversion.',
            ephemeral: true,
        });

        return;
    }

    await interaction.reply({
        embeds: [
            createResultEmbed({
                title: 'Temperature Conversion',
                input: `${formatNumber(amount)} ${formatTemperatureUnit(from)}`,
                output: `${formatNumber(result)} ${formatTemperatureUnit(to)}`,
            }),
        ],
    });
}

async function convertUnit(interaction, group) {
    const amount = interaction.options.getNumber('amount', true);
    const from = interaction.options.getString('from', true);
    const to = interaction.options.getString('to', true);

    const fromUnit = group.units[from];
    const toUnit = group.units[to];

    if (!fromUnit || !toUnit) {
        await interaction.reply({
            content: `Invalid ${group.label.toLowerCase()} unit.`,
            ephemeral: true,
        });

        return;
    }

    const baseValue = amount * fromUnit.factor;
    const result = baseValue / toUnit.factor;

    await interaction.reply({
        embeds: [
            createResultEmbed({
                title: `${group.label} Conversion`,
                input: `${formatNumber(amount)} ${from}`,
                output: `${formatNumber(result)} ${to}`,
                extra: `${from} = ${fromUnit.label}\n${to} = ${toUnit.label}`,
            }),
        ],
    });
}

async function fetchCurrencyConversion({ amount, from, to }) {
    const url = new URL(FRANKFURTER_RATES_URL);

    url.searchParams.set('base', from);
    url.searchParams.set('quotes', to);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Frankfurter returned ${response.status}: ${JSON.stringify(data)}`);
    }

    const rateInfo = parseFrankfurterRate(data, from, to);

    if (!rateInfo || !Number.isFinite(rateInfo.rate)) {
        throw new Error(`Could not parse exchange rate: ${JSON.stringify(data)}`);
    }

    return {
        rate: rateInfo.rate,
        converted: amount * rateInfo.rate,
        date: rateInfo.date,
    };
}

function parseFrankfurterRate(data, from, to) {
    if (Array.isArray(data)) {
        const directMatch = data.find((item) =>
            normalizeCurrencyCode(item.base) === from &&
            normalizeCurrencyCode(item.quote) === to &&
            Number.isFinite(Number(item.rate))
        );

        if (directMatch) {
            return {
                rate: Number(directMatch.rate),
                date: directMatch.date ?? null,
            };
        }
    }

    if (data?.rates && Number.isFinite(Number(data.rates[to]))) {
        return {
            rate: Number(data.rates[to]),
            date: data.date ?? null,
        };
    }

    if (Number.isFinite(Number(data?.rate))) {
        return {
            rate: Number(data.rate),
            date: data.date ?? null,
        };
    }

    return null;
}

function convertTemperatureValue(amount, from, to) {
    if (from === to) {
        return amount;
    }

    let celsius;

    if (from === 'c') {
        celsius = amount;
    } else if (from === 'f') {
        celsius = (amount - 32) * 5 / 9;
    } else if (from === 'k') {
        celsius = amount - 273.15;
    } else {
        return null;
    }

    if (to === 'c') {
        return celsius;
    }

    if (to === 'f') {
        return celsius * 9 / 5 + 32;
    }

    if (to === 'k') {
        return celsius + 273.15;
    }

    return null;
}

function addUnitOptions(subcommand, group) {
    return subcommand
        .addNumberOption((option) =>
            option
                .setName('amount')
                .setDescription('Amount to convert.')
                .setRequired(true)
        )
        .addStringOption((option) => {
            option
                .setName('from')
                .setDescription(`Unit to convert from.`)
                .setRequired(true);

            addUnitChoices(option, group);

            return option;
        })
        .addStringOption((option) => {
            option
                .setName('to')
                .setDescription(`Unit to convert to.`)
                .setRequired(true);

            addUnitChoices(option, group);

            return option;
        });
}

function addUnitChoices(option, group) {
    for (const [value, unit] of Object.entries(group.units).slice(0, 25)) {
        option.addChoices({
            name: `${value} — ${unit.label}`.slice(0, 100),
            value,
        });
    }
}

function createResultEmbed({ title, input, output, extra = null }) {
    const embed = new EmbedBuilder()
        .setTitle(`🔁 ${title}`)
        .addFields(
            {
                name: 'Input',
                value: input,
                inline: true,
            },
            {
                name: 'Output',
                value: output,
                inline: true,
            }
        )
        .setTimestamp();

    if (extra) {
        embed.addFields({
            name: 'Details',
            value: extra,
            inline: false,
        });
    }

    return embed;
}

function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return String(value);
    }

    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 8,
    }).format(number);
}

function formatTemperatureUnit(unit) {
    if (unit === 'c') {
        return '°C';
    }

    if (unit === 'f') {
        return '°F';
    }

    return 'K';
}

function normalizeCurrencyCode(code) {
    return String(code)
        .trim()
        .toUpperCase();
}

function isValidCurrencyCode(code) {
    return /^[A-Z]{3}$/.test(code);
}