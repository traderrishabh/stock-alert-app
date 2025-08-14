// Load environment variables for security
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cron = require('node-cron');
const path = require('path');

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;

// --- IN-MEMORY DATABASE ---
// A simple array to store alerts. This will reset if the server restarts.
let alerts = [];

// --- MIDDLEWARE ---
app.use(express.json()); // To parse JSON from the frontend
app.use(express.static(path.join(__dirname, 'public'))); // To serve the HTML file

// --- API ENDPOINT TO SET AN ALERT ---
app.post('/set-alert', (req, res) => {
    const { stockSymbol, targetPrice } = req.body;
    if (!stockSymbol || !targetPrice) {
        return res.status(400).json({ message: 'Stock symbol and target price are required.' });
    }
    const newAlert = {
        id: Date.now(), // a unique ID for the alert
        symbol: stockSymbol.toUpperCase(),
        target: parseFloat(targetPrice),
        status: 'active'
    };
    alerts.push(newAlert);
    console.log('New alert set:', newAlert);
    res.status(201).json({ message: `Alert set for ${newAlert.symbol} at ₹${newAlert.target}` });
});

// --- HELPER FUNCTIONS ---
async function checkPrices() {
    if (alerts.length === 0) {
        console.log('No active alerts to check.');
        return;
    }
    console.log(`Checking prices for ${alerts.length} active alert(s)...`);

    for (let i = alerts.length - 1; i >= 0; i--) {
        const alert = alerts[i];
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${alert.symbol}&apikey=${ALPHA_VANTAGE_KEY}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            const quote = data['Global Quote'];

            if (!quote || Object.keys(quote).length === 0) {
                console.warn(`Could not fetch data for ${alert.symbol}. It might be an invalid symbol.`);
                continue; // Skip to the next alert
            }

            const currentPrice = parseFloat(quote['05. price']);
            console.log(`Checked ${alert.symbol}: Current Price is ₹${currentPrice}, Target is ₹${alert.target}`);

            if (currentPrice >= alert.target) {
                console.log(`TRIGGERED: ${alert.symbol}`);
                const message = `📈 **Stock Alert** 📈\n\n**${alert.symbol}** has reached your target price!\n\nTarget: ₹${alert.target}\nCurrent: ₹${currentPrice}`;
                await sendTelegramMessage(message);
                // Remove the alert from the array so it doesn't trigger again
                alerts.splice(i, 1);
            }
        } catch (error) {
            console.error('Error fetching stock price:', error);
        }
    }
}

async function sendTelegramMessage(text) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = {
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.ok) {
            console.log('Telegram message sent successfully!');
        } else {
            console.error('Failed to send Telegram message:', result);
        }
    } catch (error) {
        console.error('Error sending Telegram message:', error);
    }
}

// --- SCHEDULED TASK (CRON JOB) ---
// Runs every 2 minutes. You can adjust the schedule. '*/2 * * * *'
// Note: The free Alpha Vantage API has limits, so don't run this too frequently.
cron.schedule('*/2 * * * *', checkPrices);

// --- START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Stock alerter is active. Waiting for alerts to be set.');
});