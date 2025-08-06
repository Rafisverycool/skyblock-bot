import { Client, GatewayIntentBits, REST, Routes, Partials, InteractionType, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const commands = [{
  name: 'skyblockstats',
  description: 'Get Hypixel SkyBlock stats for a user',
  options: [
    { name: 'ign', description: 'The Minecraft username', type: 3, required: true },
    { name: 'price', description: 'Price for this service', type: 3, required: true }
  ]
}];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const appId = (await client.application.fetch()).id;
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error('Failed to register slash command:', err);
  }
});

let currentOfferMessage = null;

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'skyblockstats') {
      const ign = interaction.options.getString('ign');
      const price = interaction.options.getString('price');

      const uuidRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
      if (!uuidRes.ok) return interaction.reply({ content: '❌ Invalid IGN.', ephemeral: true });

      const uuidData = await uuidRes.json();
      const uuid = uuidData.id;

      const hypixelRes = await fetch(`https://api.hypixel.net/skyblock/profiles?uuid=${uuid}&key=${process.env.HYPIXEL_API_KEY}`);
      const hypixelData = await hypixelRes.json();

      if (!hypixelData.success || !hypixelData.profiles?.length) {
        return interaction.reply({ content: '❌ No SkyBlock data found for this user.', ephemeral: true });
      }

      const profile = hypixelData.profiles[0];
      const stats = profile.members[uuid];

      const embed = new EmbedBuilder()
        .setTitle('📊 SkyBlock Stats')
        .addFields(
          { name: '❤️ Health', value: `${stats.health || 100}`, inline: true },
          { name: '💪 Strength', value: `${stats.strength || 0}`, inline: true },
          { name: '🎯 Crit Damage', value: `${stats.crit_damage || 0}`, inline: true }
        )
        .setFooter({ text: `💰 Price: ${price}` })
        .setColor(0x2f3136);

      const buyButton = new ButtonBuilder()
        .setCustomId(`buy_${interaction.id}`)
        .setLabel('🛒 Buy')
        .setStyle(ButtonStyle.Success);

      const offerButton = new ButtonBuilder()
        .setCustomId(`offer_${interaction.id}`)
        .setLabel('💸 Offer')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(buyButton, offerButton);

      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.isButton()) {
    const [action, id] = interaction.customId.split('_');

    if (action === 'buy') {
      const modal = new ModalBuilder()
        .setCustomId(`payment_${id}`)
        .setTitle('🧾 Enter Payment Method')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('paymentMethod')
              .setLabel('Your Payment Method')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
    }

    if (action === 'offer') {
      const modal = new ModalBuilder()
        .setCustomId(`offer_${id}`)
        .setTitle('💸 Submit Your Offer')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('offerAmount')
              .setLabel('Your Offer (e.g., $5)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId.startsWith('offer_')) {
      const offer = interaction.fields.getTextInputValue('offerAmount');

      if (currentOfferMessage) {
        try {
          await currentOfferMessage.delete();
        } catch (e) {}
      }

      currentOfferMessage = await interaction.channel.send(`📢 CURRENT OFFER: ${offer}`);
      await interaction.reply({ content: '✅ Offer submitted!', ephemeral: true });
    }

    if (interaction.customId.startsWith('payment_')) {
      const method = interaction.fields.getTextInputValue('paymentMethod');
      await interaction.reply({ content: `💳 Payment method selected: ${method}`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
