const Discord = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ApplicationCommandOptionType
} = Discord;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const listings = new Map();
const offers = new Map();

const HYPIXEL_API_KEY = process.env.HYPIXEL_API_KEY;
const HYPIXEL_API_BASE = 'https://api.hypixel.net';

const PAYMENT_METHODS = [
    'PayPal',
    'Cashapp',
    'Venmo',
    'Zelle',
    'Bitcoin',
    'Ethereum',
    'In-game coins'
];

class SkyblockBot {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        client.once('ready', () => {
            console.log(`✅ Bot is online as ${client.user.tag}`);
            this.registerSlashCommands();
        });

        client.on('interactionCreate', async (interaction) => {
            if (interaction.isCommand()) {
                await this.handleSlashCommand(interaction);
            } else if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await this.handleSelectMenu(interaction);
            } else if (interaction.isModalSubmit()) {
                await this.handleModalSubmit(interaction);
            }
        });
    }

    async registerSlashCommands() {
        const commands = [
            {
                name: 'list',
                description: 'Create a new Skyblock item listing',
                options: [
                    {
                        name: 'ign',
                        description: 'Your Minecraft IGN',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: 'item',
                        description: 'Item name/description',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: 'price',
                        description: 'Starting price',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: 'description',
                        description: 'Additional item details',
                        type: ApplicationCommandOptionType.String,
                        required: false
                    }
                ]
            }
        ];

        try {
            await client.application.commands.set(commands);
            console.log('✅ Slash commands registered successfully');
        } catch (error) {
            console.error('❌ Error registering slash commands:', error);
        }
    }

    async getHypixelData(ign) {
        try {
            const mojangResponse = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
            const uuid = mojangResponse.data.id;

            const hypixelResponse = await axios.get(`${HYPIXEL_API_BASE}/player`, {
                params: {
                    key: HYPIXEL_API_KEY,
                    uuid: uuid
                }
            });

            const player = hypixelResponse.data.player;
            const skyblockData = player?.stats?.SkyBlock || {};

            return {
                uuid,
                skyblockLevel: this.calculateSkyblockLevel(skyblockData),
                networth: skyblockData.networth || 'Unknown',
                skillAverage: this.calculateSkillAverage(skyblockData),
                playtime: skyblockData.playtime || 'Unknown'
            };
        } catch (error) {
            console.error('Error fetching Hypixel data:', error);
            return null;
        }
    }

    calculateSkyblockLevel(data) {
        const xp = data.experience || 0;
        return Math.floor(xp / 100000) + 1;
    }

    calculateSkillAverage(data) {
        const skills = ['farming', 'mining', 'combat', 'foraging', 'fishing', 'enchanting', 'alchemy', 'carpentry', 'runecrafting', 'taming'];
        let total = 0;
        let count = 0;

        skills.forEach(skill => {
            if (data[skill + '_xp']) {
                total += Math.floor(data[skill + '_xp'] / 10000);
                count++;
            }
        });

        return count > 0 ? (total / count).toFixed(1) : 'Unknown';
    }

    async handleSlashCommand(interaction) {
        if (interaction.commandName === 'list') {
            await this.createListing(interaction);
        }
    }

    async createListing(interaction) {
        await interaction.deferReply();

        const ign = interaction.options.getString('ign');
        const item = interaction.options.getString('item');
        const price = interaction.options.getString('price');
        const description = interaction.options.getString('description') || 'No additional description';

        const hypixelData = await this.getHypixelData(ign);

        if (!hypixelData) {
            return interaction.editReply('❌ Could not fetch Hypixel data. Please check the IGN and try again.');
        }

        const listingId = Date.now().toString();

        listings.set(listingId, {
            sellerId: interaction.user.id,
            sellerTag: interaction.user.tag,
            ign,
            item,
            price,
            description,
            hypixelData,
            createdAt: new Date(),
            offers: []
        });

        const embed = new EmbedBuilder()
            .setTitle(`🏪 Skyblock Item Listing`)
            .setColor(0x00AE86)
            .addFields(
                { name: '📦 Item', value: item, inline: true },
                { name: '💰 Price', value: price, inline: true },
                { name: '📝 Description', value: description, inline: false },
                { name: '🏆 Skyblock Level', value: hypixelData.skyblockLevel.toString(), inline: true },
                { name: '📊 Skill Average', value: hypixelData.skillAverage.toString(), inline: true },
                { name: '💎 Networth', value: hypixelData.networth.toString(), inline: true },
                { name: '🆔 Listing ID', value: listingId, inline: false }
            )
            .setFooter({ text: `Listed by ${interaction.user.tag}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`buy_${listingId}`)
                .setLabel('💳 Buy Now')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`offer_${listingId}`)
                .setLabel('💰 Make Offer')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    }

    async handleButtonInteraction(interaction) {
        const [action, listingId] = interaction.customId.split('_');
        const listing = listings.get(listingId);

        if (!listing) {
            return interaction.reply({
                content: '❌ This listing no longer exists.',
                ephemeral: true
            });
        }

        if (action === 'buy') {
            await this.handleBuyButton(interaction, listing, listingId);
        } else if (action === 'offer') {
            await this.handleOfferButton(interaction, listing, listingId);
        }
    }

    async handleBuyButton(interaction, listing, listingId) {
        if (interaction.user.id === listing.sellerId) {
            return interaction.reply({
                content: '❌ You cannot buy your own listing.',
                ephemeral: true
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`payment_${listingId}`)
            .setPlaceholder('Select your payment method')
            .addOptions(
                PAYMENT_METHODS.map(method => ({
                    label: method,
                    value: method.toLowerCase().replace(/ /g, '_'),
                    description: `Pay with ${method}`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `💳 **Purchase Request for:** ${listing.item}\n💰 **Price:** ${listing.price}\n\nPlease select your preferred payment method:`,
            components: [row],
            ephemeral: true
        });
    }

    async handleOfferButton(interaction, listing, listingId) {
        if (interaction.user.id === listing.sellerId) {
            return interaction.reply({
                content: '❌ You cannot make an offer on your own listing.',
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`offer_modal_${listingId}`)
            .setTitle('Make an Offer');

        const offerInput = new TextInputBuilder()
            .setCustomId('offer_amount')
            .setLabel('Your Offer Amount')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your offer (e.g., 50m, $25)')
            .setRequired(true);

        const messageInput = new TextInputBuilder()
            .setCustomId('offer_message')
            .setLabel('Additional Message (Optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Any additional details about your offer...')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(offerInput),
            new ActionRowBuilder().addComponents(messageInput)
        );

        await interaction.showModal(modal);
    }

    async handleSelectMenu(interaction) {
        const [type, listingId] = interaction.customId.split('_');

        if (type === 'payment') {
            const listing = listings.get(listingId);
            const paymentMethod = interaction.values[0];

            try {
                const seller = await client.users.fetch(listing.sellerId);
                const buyer = interaction.user;

                const purchaseEmbed = new EmbedBuilder()
                    .setTitle('🛒 New Purchase Request')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '👤 Buyer', value: buyer.tag, inline: true },
                        { name: '📦 Item', value: listing.item, inline: true },
                        { name: '💰 Price', value: listing.price, inline: true },
                        { name: '💳 Payment Method', value: paymentMethod.replace(/_/g, ' '), inline: true }
                    )
                    .setTimestamp();

                await seller.send({ embeds: [purchaseEmbed] });

                await interaction.update({
                    content: `✅ **Purchase request sent!**\n\nThe seller has been notified of your interest in purchasing:\n📦 **Item:** ${listing.item}\n💰 **Price:** ${listing.price}\n💳 **Payment Method:** ${paymentMethod.replace(/_/g, ' ')}\n\nThey will contact you shortly to arrange the transaction.`,
                    components: []
                });
            } catch (error) {
                console.error('Error sending purchase notification:', error);
                await interaction.update({
                    content: '❌ Error processing purchase request. Please try contacting the seller directly.',
                    components: []
                });
            }
        }
    }

    async handleModalSubmit(interaction) {
        const [type, subtype, listingId] = interaction.customId.split('_');

        if (type === 'offer' && subtype === 'modal') {
            const listing = listings.get(listingId);
            const offerAmount = interaction.fields.getTextInputValue('offer_amount');
            const offerMessage = interaction.fields.getTextInputValue('offer_message') || 'No additional message';

            listing.offers.push({
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                amount: offerAmount,
                message: offerMessage,
                timestamp: new Date()
            });

            const currentOffer = offerAmount;

            try {
                const seller = await client.users.fetch(listing.sellerId);

                const offerEmbed = new EmbedBuilder()
                    .setTitle('💰 New Offer Received')
                    .setColor(0xFFD700)
                    .addFields(
                        { name: '👤 Buyer', value: interaction.user.tag, inline: true },
                        { name: '📦 Item', value: listing.item, inline: true },
                        { name: '💵 Offer Amount', value: currentOffer, inline: true },
                        { name: '📝 Message', value: offerMessage, inline: false },
                        { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp();

                await seller.send({ embeds: [offerEmbed] });

                // Attempt to update original message embed (if exists)
                try {
                    if (interaction.message && interaction.message.edit) {
                        const originalEmbed = interaction.message.embeds[0];
                        if (originalEmbed) {
                            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                                .spliceFields(-1, 1, { name: '💵 Current Offer (C/O)', value: currentOffer, inline: true });
                            await interaction.message.edit({ embeds: [updatedEmbed] });
                        }
                    }
                } catch {}

                await interaction.reply({
                    content: `✅ **Offer submitted successfully!**\n\n💰 **Your offer:** ${currentOffer}\n📦 **For item:** ${listing.item}\n\nThe seller has been notified and will respond if interested.`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error processing offer:', error);
                await interaction.reply({
                    content: '❌ Error submitting offer. Please try again later.',
                    ephemeral: true
                });
            }
        }
    }
}

const bot = new SkyblockBot();

client.login(process.env.DISCORD_BOT_TOKEN);

module.exports = { SkyblockBot, client };
