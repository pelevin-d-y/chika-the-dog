import * as dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!telegramToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not defined in .env');
  process.exit(1);
}

// Initialize OpenAI (not used for responses yet, but required)
const openai = new OpenAI({
  apiKey: openaiApiKey || '',
});

// Initialize Telegraf
const bot = new Telegraf(telegramToken);

import { message } from 'telegraf/filters';

// ... (previous imports and initialization)

// Handle text messages in private chats
bot.on(message('text'), async (ctx) => {
  // Only respond in private chats
  if (ctx.chat.type === 'private') {
    await ctx.reply('гав 🐾 я тут');
  }
});

// Start bot
bot.launch()
  .then(() => {
    console.log('Bot started');
  })
  .catch((err) => {
    console.error('Error starting bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
