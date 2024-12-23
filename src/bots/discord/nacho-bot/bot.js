require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

// Initialize Discord bot client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Your bot token (use environment variable for security)
const token = process.env.DISCORD_BOT_TOKEN;

// The channel ID where the floor price updates will be reflected in the name
const channelId = '1285774928645324831'; // Replace with your actual channel ID

// The channel ID where the market cap updates will be reflected in the name
const marketCapChannelId = '1286908343482585169'; // Channel ID for market cap updates

// Function to get the current timestamp (seconds since Epoch)
const getTimestamp = () => {
    return Math.floor(Date.now() / 1000);
};

// Function to fetch NACHO floor price from the API with retries
async function getFloorPrice(retries = 3) {
    const timestamp = getTimestamp();
    const apiUrl = `https://storage.googleapis.com/kspr-api-v1/marketplace/marketplace.json?t=${timestamp}`;

    console.log('Fetching floor price from API...'); // Log when fetching starts

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await axios.get(apiUrl);
            const data = response.data;

            // Extract the NACHO floor price from the data
            const nachoData = data.NACHO;
            const floorPrice = nachoData ? nachoData.floor_price.toFixed(5) : null; // Format to 5 decimal places

            console.log(`Fetched floor price: ${floorPrice} KAS`); // Log the fetched price
            return floorPrice;
        } catch (error) {
            console.error('Error fetching NACHO floor price:', error.message); // Log specific error message
            if (attempt < retries - 1) {
                console.log(`Retrying... (${attempt + 1})`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retrying
            }
        }
    }

    return null; // Return null if all attempts fail
}

// Function to fetch Nacho market cap from the API
async function getMarketCap() {
    const apiUrl = 'https://api-v2-do.kas.fyi/market';  // Fetch from the /prices endpoint
    try {
        const response = await axios.get(apiUrl);
        const data = response.data;

        if (data && data.price) {
            const floorPrice = await getFloorPrice();
            if (floorPrice !== null) {
                const marketCap = floorPrice * 287000000000 * data.price;
                const formattedMarketCap = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(marketCap);
                return formattedMarketCap;
            } else {
                console.error('Failed to fetch floor price.');
                return null;
            }
        } else {
            console.error('No price data found in the /market response');
            return null;
        }
    } catch (error) {
        console.error('Error fetching market cap from /market API:', error);
        return null;
    }
}

// Function to update the channel name with the NACHO floor price
async function updateChannelName() {
    const floorPrice = await getFloorPrice();

    console.log('Attempting to update channel name...'); // Log this line

    if (floorPrice !== null) {
        const channel = await client.channels.fetch(channelId);
        const newChannelName = `Floor: ${floorPrice} KAS`;

        console.log(`New channel name will be: ${newChannelName}`); // Log the new channel name

        // Set the new channel name
        try {
            await channel.setName(newChannelName);
            console.log(`Channel name updated to: ${newChannelName}`);
        } catch (error) {
            console.error('Error updating channel name:', error.message); // Log specific error message
        }
    } else {
        console.log('No floor price available to update the channel name.'); // Log when price is not available
    }
}

// Function to update the market cap channel name
async function updateMarketCapChannelName() {
    const marketCap = await getMarketCap();

    console.log('Attempting to update market cap channel name...'); // Log this line

    if (marketCap !== null) {
        const channel = await client.channels.fetch(marketCapChannelId);
        const newChannelName = `MC: ${marketCap} USD`;  

        console.log(`New market cap channel name will be: ${newChannelName}`); // Log the new channel name

        try {
            await channel.setName(newChannelName);
            console.log(`Market cap channel name updated to: ${newChannelName}`);
        } catch (error) {
            console.error('Error updating market cap channel name:', error.message); // Log specific error message
        }
    } else {
        console.log('No market cap available to update the channel name.');
    }
}

// Set an interval to update the market cap channel name every 15 seconds
client.once('ready', () => {
    console.log('Bot is ready!');

    // Update the floor price channel name immediately, then every 15 minutes
    updateChannelName();
    setInterval(updateChannelName, 900000); // 15 minutes

    // Update the market cap channel name every 15 minutes
    updateMarketCapChannelName();
    setInterval(updateMarketCapChannelName, 900000); // 15 minutes
});

// Log in to Discord with the bot's token
client.login(token)
    .then(() => console.log('Bot logged in successfully.'))
    .catch(error => console.error('Failed to log in:', error.message)); // Log any login errors
