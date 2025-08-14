// UPDATED server.js

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
// We no longer need node-cron in this file
// const cron = require('node-cron'); 
const path = require('path');

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;

// --- IN-MEMORY DATABASE ---
let alerts = [];

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINT TO SET AN ALERT ---
app.post('/set-alert', (req, res) => {
    const { stockSymbol, targetPrice } = req.body;
    if (!stockSymbol || !targetPrice) {
        return res.status(400).json({ message: 'Stock symbol and target price are required.' });
    }
    const newAlert = {
        id: Date.now(),
        symbol: stockSymbol.toUpperCase(),
        target: parseFloat(targetPrice),
        status: 'active'
    };
    alerts.push(newAlert);
    console.log('New alert set:', newAlert);
    res.status(201).json({ message: `Alert set for ${newAlert.symbol} at ₹${newAlert.target}` });
});

// --- NEW ENDPOINT FOR THE CRON JOB TO CALL ---
app.get('/trigger-check', (req, res) => {
    console.log('Received request from external Cron Job.');
    checkPrices(); // Run the price check function
    res.status(200).json({ message: 'Price check triggered successfully.' });
});

// --- HELPER FUNCTIONS ---
async function checkPrices() {
    if (alerts.length === 0) {
        console.log('Cron Job Ran: No active alerts to check.');
        return;
    }
    console.log(`Cron Job Ran: Checking prices for ${alerts.length} active alert(s)...`);

    for (let i = alerts.length - 1; i >= 0; i--) {
        const alert = alerts[i];
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${alert.symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            const quote = data['Global Quote'];
            if (!quote || Object.keys(quote).length === 0) {
                console.warn(`Could not fetch data for ${alert.symbol}.`);
                continue;
            }
            const currentPrice = parseFloat(quote['05. price']);
            console.log(`Checked ${alert.symbol}: Current Price is ₹${currentPrice}, Target is ₹${alert.target}`);
            if (currentPrice >= alert.target) {
                console.log(`TRIGGERED: ${alert.symbol}`);
                const message = `📈 **Stock Alert** 📈\n\n**${alert.symbol}** has reached your target price!\n\nTarget: ₹${alert.target}\nCurrent: ₹${currentPrice}`;
                await sendTelegramMessage(message);
                alerts.splice(i, 1);
            }
        } catch (error) {
            console.error('Error fetching stock price:', error);
        }
    }
}

async function sendTelegramMessage(text) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = { chat_id: CHAT_ID, text: text, parse_mode: 'Markdown' };
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

// --- REMOVED THE OLD SCHEDULE ---
// We removed the cron.schedule() line from here.

// --- START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
