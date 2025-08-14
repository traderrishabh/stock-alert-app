require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// --- IN-MEMORY DATABASE ---
// This array stores your active alerts. It will reset if the server restarts.
let alerts = [];

// --- MIDDLEWARE ---
app.use(express.json()); // Allows the server to understand JSON from the frontend
app.use(express.static(path.join(__dirname, 'public'))); // Serves your index.html page

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

// --- ENDPOINT FOR GITHUB ACTIONS TO CALL ---
app.get('/trigger-check', (req, res) => {
    console.log('Received request from external scheduler (GitHub Actions).');
    checkPrices(); // Run the main price check function
    res.status(200).json({ message: 'Price check triggered successfully.' });
});

// --- HELPER FUNCTIONS ---
async function checkPrices() {
    if (alerts.length === 0) {
        console.log('Scheduler Ran: No active alerts to check.');
        return;
    }
    console.log(`Scheduler Ran: Checking prices for ${alerts.length} active alert(s)...`);

    // Loop through all alerts to check their prices
    for (let i = alerts.length - 1; i >= 0; i--) {
        const alert = alerts[i];
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${alert.symbol}`;
        
        try {
            const response = await fetch(url, { headers: {'User-Agent': 'Mozilla/5.0'} });
            const data = await response.json();
            
            // Get the price from Yahoo's data structure
            const quote = data?.quoteResponse?.result?.[0];

            if (!quote) {
                console.warn(`No data returned from Yahoo Finance for ${alert.symbol}.`);
                continue; // Skip to the next alert
            }

            const currentPrice = quote.regularMarketPrice;
            console.log(`Checked ${alert.symbol}: Current Price is ₹${currentPrice}, Target is ₹${alert.target}`);

            // If the price hits the target, send a notification
            if (currentPrice >= alert.target) {
                console.log(`TRIGGERED: ${alert.symbol}`);
                const message = `📈 **Stock Alert** 📈\n\n**${alert.symbol}** has reached your target price!\n\nTarget: ₹${alert.target}\nCurrent: ₹${currentPrice}`;
                await sendTelegramMessage(message);
                
                // Remove the alert so it doesn't send again
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
        await fetch(url, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
        });
        console.log('Telegram message sent successfully!');
    } catch (error) {
        console.error('Error sending Telegram message:', error);
    }
}

// --- START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
