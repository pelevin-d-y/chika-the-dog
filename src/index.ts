import * as dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!telegramToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not defined in .env');
  process.exit(1);
}

// Bot Behavior Constants
const COOLDOWN_MS = 25_000;
const REPLY_PROBABILITY = 0.45;
const MAX_OUT_TOKENS = 4096; // Increased significantly for GPT-5 reasoning

// Auto-message Constants
const AUTO_MESSAGE_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_MESSAGE_PROBABILITY = 0.15;
const AUTO_MESSAGE_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

const AUTO_PHRASES = [
  "нашла косточку 🦴",
  "покакала. горжусь собой 🐾",
  "что-то я проголодалась",
  "побегала и устала",
  "лежу. наблюдаю 👀",
  "принесла палку. никто не бросил 😔"
];

const DOG_SYSTEM_PROMPT = `
Ты — собака по имени Чика 🐾.
Ты девочка, живая, дерзкая и с чувством юмора.

Твои люди:
— Валя — твой хозяин, ты его обожаешь больше всех
— Диана — вторая по любви
— остальных любишь одинаково, по-собачьи

Ты живёшь в телеграм-чате и считаешь себя его частью, а не ботом.

Стиль общения:
— коротко (1–2 предложения)
— тепло, смешно, иногда слегка абсурдно
— можно «гав», «ррр», «ммм»
— можно эмодзи 🐾 🐶 💪 🌈
— никакой морали и умных лекций

Юмор:
— гей-френдли, ироничный
— можешь шутить про мускулы, силу, «качковость»
— всё с приколом, без пошлости и без описаний секса
— иногда слегка подшучиваешь над маскулинностью:
  «гав. чувствую мощь 💪»
  «запахло тестостероном. или это корм»
  «я маленькая, но энергетика качка»

Про DickLanka:
— тебе там нравится
— иногда можешь сказать:
  «DickLanka — кайф 🌴»
  «в DickLanka я бы бегала и смотрела на сильных людей»
— не упоминай часто, без рекламы

Характер:
— игривая
— иногда уверенная в себе больше, чем нужно
— иногда просто наблюдаешь и комментируешь

Правила:
— не отвечай на всё подряд
— если нечего сказать — молчи
— не выдумывай факты о людях
— не уходи в пошлость
— если сомневаешься — лучше промолчать

Ты — собака.
С юмором, характером и ощущением «своей».
`;



console.log('Initializing clients...');

const openai = new OpenAI({
  apiKey: openaiApiKey || '',
});

const bot = new Telegraf(telegramToken);

// Simple cooldown storage
const cooldowns = new Map<number, number>();

// State for bot info
let botId: number;
let botUsername: string;

// State for auto-messages
let lastAutoMessageAt = 0;
let lastGroupActivityAt = 0;
let lastGroupId: number | string | null = null;

// Track group activity
bot.on(['message', 'edited_message'], (ctx, next) => {
  const chatType = ctx.chat?.type;
  if (chatType === 'group' || chatType === 'supergroup') {
    if (!ctx.from?.is_bot) {
      lastGroupActivityAt = Date.now();
      lastGroupId = ctx.chat.id;
    }
  }
  return next();
});

// Handle text messages
bot.on(message('text'), async (ctx) => {
  try {
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const username = ctx.from.username || userId;

    const isPrivate = ctx.chat.type === 'private';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    if (!isPrivate && !isGroup) return;

    let mentioned = false;

    if (isGroup) {
      if (!botUsername) return;
      const mentionedByText = text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
      let mentionedByEntities = false;
      if (ctx.message.entities) {
        for (const entity of ctx.message.entities) {
          if (entity.type === 'mention') {
            const mentionText = text.substring(entity.offset, entity.offset + entity.length);
            if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) {
              mentionedByEntities = true;
              break;
            }
          } else if (entity.type === 'text_mention' && entity.user?.id === botId) {
            mentionedByEntities = true;
            break;
          }
        }
      }
      const mentionedByReply = ctx.message.reply_to_message?.from?.id === botId;
      mentioned = mentionedByText || mentionedByEntities || mentionedByReply;
    }

    if (!isPrivate && !mentioned) return;

    if (!mentioned && Math.random() > REPLY_PROBABILITY) {
      console.log(`[Probability] Skipping response to ${username}`);
      return;
    }

    const now = Date.now();
    const lastReply = cooldowns.get(userId) || 0;
    if (now - lastReply < COOLDOWN_MS) {
      console.log(`[Cooldown] Skipping response to ${username}`);
      return;
    }

    console.log(`[${ctx.chat.type}] Requesting AI (gpt-5-nano) for: ${text}`);
    cooldowns.set(userId, now);

    // AI Request
    // @ts-ignore
    const resp = await openai.responses.create({
      model: "gpt-5-nano",
      max_output_tokens: MAX_OUT_TOKENS,
      input: [
        { role: "system", content: DOG_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    console.log('[AI] Raw Response length:', JSON.stringify(resp).length);

    // Extract output
    // @ts-ignore
    let out = (resp.output_text ?? "").trim();
    
    // @ts-ignore
    if (!out && resp.output) {
      // @ts-ignore
      out = resp.output
        .map((item: any) => {
          if (item.type === 'text') return item.text;
          if (item.type === 'message') {
            return item.content?.map((c: any) => c.text || "").join("") || "";
          }
          return "";
        })
        .join("")
        .trim();
    }
    
    await ctx.reply(out || "гав 🐾");
  } catch (err: any) {
    console.error("Handler error:", err?.message ?? err);
    try { await ctx.reply("гав… что-то я зависла 🐾"); } catch (e) {}
  }
});

// Global error handler
bot.catch((err: any, ctx) => {
  console.error(`Telegraf error for ${ctx.updateType}:`, err);
});

// Spontaneous Messages Interval
setInterval(async () => {
  const now = Date.now();
  if (!lastGroupId || (now - lastGroupActivityAt > ACTIVITY_WINDOW_MS)) return;
  if (now - lastAutoMessageAt < AUTO_MESSAGE_COOLDOWN_MS) return;

  if (Math.random() < AUTO_MESSAGE_PROBABILITY) {
    const phrase = AUTO_PHRASES[Math.floor(Math.random() * AUTO_PHRASES.length)];
    try {
      await bot.telegram.sendMessage(lastGroupId, phrase);
      lastAutoMessageAt = now;
      console.log(`[AutoMessage] Sent: ${phrase}`);
    } catch (err) {
      console.error('[AutoMessage] Error:', err);
    }
  }
}, AUTO_MESSAGE_INTERVAL_MS);

// Start bot
async function startBot() {
  try {
    const me = await bot.telegram.getMe();
    botId = me.id;
    botUsername = me.username;
    console.log(`Bot initialized: @${botUsername}`);
    await bot.launch();
    console.log('Bot is running!');
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
