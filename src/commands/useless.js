import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('useless')
    .setDescription('Replies with a random useless fact.');

export async function execute(interaction) {
    await interaction.deferReply();


    const sender = interaction.user.id;

    const FranID = "1410897591977246822";
    const DatchID = "596645684757790739";

    if(sender === "1410897591977246822" || sender === "596645684757790739")
    {
        const chance = (Math.random() * 3) < 1;
        if(chance && sender === FranID)
        {
            await interaction.editReply("You are, on your own, very useless")
            return;
        }
        else if(chance && sender === DatchID)
        {
            await interaction.editReply("Francesca is, on her own, very useless")
            return;
        }

    }

    const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');

    if (!response.ok) {
        await interaction.editReply('I could not fetch a useless fact right now.');
        return;
    }

    const fact = await response.json();

    await interaction.editReply(fact.text);
}