import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const API_URL = process.env.API_URL || 'https://sahih-hadith-app.vercel.app';
const token = process.env.BOT_TOKEN;
const DEVELOPER_ID = parseInt(process.env.DEVELOPER_ID) || 8236813471;

if (!token) {
    console.error('❌ خطأ: لم يتم العثور على BOT_TOKEN');
    process.exit(1);
}

const bot = new TelegramBot(token, { 
    polling: true,
    pollingOptions: {
        timeout: 30,
        retryTimeout: 5000
    }
});

// ========== قاعدة بيانات القنوات ==========
class ChannelDatabase {
    constructor() {
        this.filePath = path.join(__dirname, 'channels.json');
        this.channels = [];
    }

    async init() {
        await this.load();
    }

    async load() {
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            this.channels = JSON.parse(data);
            console.log(`📚 تم تحميل ${this.channels.length} قناة`);
        } catch (error) {
            this.channels = [];
            await this.save();
        }
    }

    async save() {
        try {
            const data = JSON.stringify(this.channels, null, 2);
            await fs.writeFile(this.filePath, data, 'utf8');
        } catch (error) {
            console.error('❌ خطأ في حفظ القنوات:', error.message);
        }
    }

    async addChannel(chatId, title, username, addedBy) {
        const existing = this.channels.find(ch => ch.chatId === chatId);
        if (existing) return false;
        
        this.channels.push({
            chatId: String(chatId),
            title: title || 'قناة بدون اسم',
            username: username || null,
            addedBy: addedBy,
            addedAt: new Date().toISOString(),
            isActive: true
        });
        await this.save();
        return true;
    }

    async removeChannel(chatId) {
        const index = this.channels.findIndex(ch => ch.chatId === String(chatId));
        if (index === -1) return false;
        this.channels.splice(index, 1);
        await this.save();
        return true;
    }

    getAllChannels() {
        return this.channels.filter(ch => ch.isActive === true);
    }

    getUserChannels(userId) {
        return this.channels.filter(ch => ch.addedBy === userId);
    }

    async channelExists(chatId) {
        return this.channels.some(ch => ch.chatId === String(chatId));
    }
}

// ========== قاعدة بيانات المستخدمين ==========
class UserDatabase {
    constructor() {
        this.filePath = path.join(__dirname, 'users.json');
        this.users = new Map();
    }

    async init() {
        await this.load();
    }

    async load() {
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(data);
            this.users = new Map(Object.entries(parsed));
        } catch (error) {
            this.users = new Map();
        }
    }

    async save() {
        const obj = Object.fromEntries(this.users);
        await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf8');
    }

    addUser(userId, userData) {
        if (!this.users.has(String(userId))) {
            this.users.set(String(userId), {
                ...userData,
                firstSeen: new Date().toISOString()
            });
        }
        const user = this.users.get(String(userId));
        user.lastActive = new Date().toISOString();
        this.users.set(String(userId), user);
    }

    getStats() {
        return this.users.size;
    }
}

const channelDB = new ChannelDatabase();
const userDB = new UserDatabase();

// ========== دوال مساعدة ==========
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1');
}

function formatHadithMsg(hadith) {
    const title = escapeMarkdown(hadith.title || 'حديث نبوي');
    const hadeeth = escapeMarkdown(hadith.hadeeth || '');
    const explanation = hadith.explanation ? escapeMarkdown(hadith.explanation) : null;
    const grade = hadith.grade ? escapeMarkdown(hadith.grade) : null;
    const reference = hadith.reference ? escapeMarkdown(hadith.reference) : null;

    let msg = `📖 *${title}*\n\n`;
    msg += `📝 *الحديث:*\n${hadeeth}\n\n`;
    if (explanation) msg += `💡 *الشرح:*\n${explanation}\n\n`;
    if (grade) msg += `⭐ *صحة الحديث:* ${grade}\n`;
    if (reference) msg += `📜 *المصدر:* ${reference}\n`;
    return msg;
}

async function sendToChannel(channelId, message) {
    try {
        await bot.sendMessage(channelId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        console.log(`✅ أرسل إلى: ${channelId}`);
        return true;
    } catch (err) {
        console.error(`❌ فشل الإرسال: ${err.message}`);
        return false;
    }
}

async function sendHadithToChannel(channelId, isPeriodic = false) {
    try {
        const endpoint = isPeriodic 
            ? `${API_URL}/api/periodic` 
            : `${API_URL}/api/random`;
        
        const response = await axios.get(endpoint, { timeout: 15000 });
        const prefix = isPeriodic 
            ? '📣 *تذكير بحديث الفترة!*\n\n' 
            : '🌟 *حديث اليوم* 🌟\n\n';
        
        return await sendToChannel(channelId, prefix + formatHadithMsg(response.data));
    } catch (err) {
        console.error(`❌ خطأ في جلب الحديث: ${err.message}`);
        return false;
    }
}

// ========== أوامر البوت ==========

// بدء البوت
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || 'صديقي';
    
    userDB.addUser(userId, {
        username: msg.from.username,
        firstName: firstName
    });
    
    const welcomeMessage = `
🎉 *مرحباً يا ${escapeMarkdown(firstName)}!* 🎉

🤖 *بوت صحيح - الأحاديث النبوية*

📚 يمكنني إرسال الأحاديث إلى قناتك تلقائياً!

*📢 طريقة الإضافة:*
1️⃣ أضف البوت إلى قناتك كمشرف
2️⃣ أرسل: \`/add -1001234567890\`

*📋 الأوامر:*
/start - بدء البوت
/add - إضافة قناة
/mychannels - قنواتك
/remove - إزالة قناة
/hadith - حديث عشوائي
/periodic - حديث الفترة
/stats - الإحصائيات (للمطور)
    `;
    
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📖 حديث عشوائي', callback_data: 'hadith_random' }],
                [{ text: '📣حديث الفترة', callback_data: 'hadith_periodic' }],
                [{ text: '➕ إضافة قناة', callback_data: 'add_channel_btn' }],
                [{ text: '📋 قنواتي', callback_data: 'my_channels_btn' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', ...options });
});

// إضافة قناة - الطريقة الجديدة
bot.onText(/\/add (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const channelInput = match[1].trim();
    
    // التحقق من صحة المعرف
    let channelId = channelInput;
    let chatUsername = null;
    
    if (channelInput.startsWith('@')) {
        channelId = channelInput;
    } else if (channelInput.startsWith('-100')) {
        channelId = channelInput;
    } else {
        await bot.sendMessage(chatId, 
            '❌ *معرف القناة غير صحيح!*\n\n' +
            'يجب أن يكون:\n' +
            '• `-1001234567890` (رقمي)\n' +
            '• `@channelusername` (عام)\n\n' +
            'مثال: `/add -1001234567890`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await bot.sendMessage(chatId, '🔄 جاري التحقق من القناة...');
    
    try {
        let chat;
        try {
            chat = await bot.getChat(channelId);
        } catch (err) {
            await bot.sendMessage(chatId,
                '❌ *لا يمكن الوصول للقناة!*\n\n' +
                'تأكد من:\n' +
                '1️⃣ البوت مضاف كمشرف\n' +
                '2️⃣ المعرف صحيح (يبدأ بـ -100)\n' +
                '3️⃣ البوت لديه صلاحية الإرسال',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const chatType = chat.type;
        if (chatType !== 'channel') {
            await bot.sendMessage(chatId, 
                '❌ هذا ليس قناة!\n' +
                'أرسل معرف قناة (يبدأ بـ -100)',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // التحقق من صلاحيات البوت
        try {
            const botMember = await bot.getChatMember(chat.id, bot.botInfo.id);
            if (!botMember.can_post_messages) {
                await bot.sendMessage(chatId,
                    '❌ *لا توجد صلاحية الإرسال!*\n\n' +
                    'تأكد أن البوت مشرف مع:\n' +
                    '✓ إرسال الرسائل',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
        } catch (err) {
            console.log('تحقق الصلاحيات:', err.message);
        }
        
        const added = await channelDB.addChannel(
            chat.id, 
            chat.title, 
            chat.username, 
            userId
        );
        
        if (added) {
            await bot.sendMessage(chatId,
                `✅ *تمت إضافة القناة!*\n\n` +
                `📢 ${escapeMarkdown(chat.title)}\n` +
                `🆔 \`${chat.id}\`\n\n` +
                `⏰ البث كل 5 ساعات\n\n` +
                `🔧 لإزالة:\n\`/remove ${chat.id}\``,
                { parse_mode: 'Markdown' }
            );
            
            // إرسال أول حديث
            setTimeout(async () => {
                await sendHadithToChannel(chat.id, false);
            }, 2000);
            
            // إشعار للمطور
            if (userId !== DEVELOPER_ID) {
                bot.sendMessage(DEVELOPER_ID,
                    `➕ *قناة جديدة*\n` +
                    `📢 ${escapeMarkdown(chat.title)}\n` +
                    `👤 ${escapeMarkdown(msg.from.first_name)}\n` +
                    `🆔 \`${chat.id}\``,
                    { parse_mode: 'Markdown' }
                ).catch(() => {});
            }
        } else {
            await bot.sendMessage(chatId, 'ℹ️ القناة مسجلة مسبقاً', { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error('خطأ في إضافة القناة:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ، حاول لاحقاً');
    }
});

// إزالة قناة
bot.onText(/\/remove (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const channelId = match[1].trim();
    
    const userChannels = channelDB.getUserChannels(userId);
    const isOwner = userChannels.some(ch => ch.chatId === channelId);
    const isDev = userId === DEVELOPER_ID;
    
    if (!isOwner && !isDev) {
        await bot.sendMessage(chatId, '❌ لا يمكنك إزالة هذه القناة', { parse_mode: 'Markdown' });
        return;
    }
    
    const removed = await channelDB.removeChannel(channelId);
    
    if (removed) {
        await bot.sendMessage(chatId, '🗑️ *تم إزالة القناة*', { parse_mode: 'Markdown' });
    } else {
        await bot.sendMessage(chatId, '❌ القناة غير موجودة', { parse_mode: 'Markdown' });
    }
});

// عرض قنوات المستخدم
bot.onText(/\/mychannels/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userChannels = channelDB.getUserChannels(userId);
    const allChannels = channelDB.getAllChannels();
    
    // المستخدم يرى قنواته + المطور يرى كل القنوات
    const channels = (userId === DEVELOPER_ID) ? allChannels : userChannels;
    
    if (channels.length === 0) {
        await bot.sendMessage(chatId,
            '📭 *ليس لديك قنوات*\n\n' +
            'لإضافة:\n' +
            '`/add -1001234567890`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    let message = `📋 *${userId === DEVELOPER_ID ? 'كل' : ''} القنوات (${channels.length})*\n\n`;
    channels.forEach((ch, i) => {
        message += `${i+1}. ${escapeMarkdown(ch.title)}\n`;
        message += `   🆔: \`${ch.chatId}\`\n`;
        message += `   📅: ${new Date(ch.addedAt).toLocaleDateString('ar-SA')}\n\n`;
    });
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// حديث عشوائي
bot.onText(/\/hadith/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get(API_URL + '/api/random');
        await bot.sendMessage(chatId, formatHadithMsg(response.data), {
            parse_mode: 'Markdown'
        });
    } catch (err) {
        bot.sendMessage(chatId, '❌ حدث خطأ في جلب الحديث');
    }
});

// حديث الفترة
bot.onText(/\/periodic/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get(API_URL + '/api/periodic');
        await bot.sendMessage(chatId, '📣 *حديث الفترة*\n\n' + formatHadithMsg(response.data), {
            parse_mode: 'Markdown'
        });
    } catch (err) {
        bot.sendMessage(chatId, '❌ حدث خطأ');
    }
});

// ========== معالج الأزرار ==========
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = message.chat.id;
    const userId = callbackQuery.from.id;
    
    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    
    try {
        if (data === 'hadith_random') {
            const response = await axios.get(API_URL + '/api/random');
            await bot.sendMessage(chatId, formatHadithMsg(response.data), {
                parse_mode: 'Markdown'
            });
        }
        else if (data === 'hadith_periodic') {
            const response = await axios.get(API_URL + '/api/periodic');
            await bot.sendMessage(chatId, '📣 *حديث الفترة*\n\n' + formatHadithMsg(response.data), {
                parse_mode: 'Markdown'
            });
        }
        else if (data === 'add_channel_btn') {
            bot.sendMessage(chatId,
                '➕ *إضافة قناة:*\n\n' +
                'أرسل معرف القناة:\n`/add -1001234567890`\n\n' +
                'أو استخدم @username:\n`/add @channelname`',
                { parse_mode: 'Markdown' }
            );
        }
        else if (data === 'my_channels_btn') {
            const channels = userId === DEVELOPER_ID 
                ? channelDB.getAllChannels() 
                : channelDB.getUserChannels(userId);
            
            if (channels.length === 0) {
                bot.sendMessage(chatId, '📭 لا توجد قنوات');
            } else {
                let msg = '📋 *القنوات:*\n\n';
                channels.forEach((ch, i) => {
                    msg += `${i+1}. ${escapeMarkdown(ch.title)}\n`;
                    msg += `\`${ch.chatId}\`\n\n`;
                });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ حدث خطأ');
    }
});

// ========== أوامر المطور ==========
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== DEVELOPER_ID) {
        await bot.sendMessage(chatId, '⛔ للمطور فقط');
        return;
    }
    
    const allChannels = channelDB.getAllChannels();
    const stats = `📊 *إحصائيات البوت*\n\n` +
                  `👥 المستخدمين: ${userDB.getStats()}\n` +
                  `📢 القنوات: ${allChannels.length}`;
    
    await bot.sendMessage(chatId, stats, { parse_mode: 'Markdown' });
});

// إرسال حديث للقناة
bot.onText(/\/send (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== DEVELOPER_ID) {
        await bot.sendMessage(chatId, '⛔ للمطور فقط');
        return;
    }
    
    const channelId = match[1].trim();
    await bot.sendMessage(chatId, '🔄 جاري الإرسال...');
    
    const success = await sendHadithToChannel(channelId, false);
    
    if (success) {
        await bot.sendMessage(chatId, '✅ تم الإرسال');
    } else {
        await bot.sendMessage(chatId, '❌ فشل الإرسال');
    }
});

// ========== البث التلقائي ==========
setInterval(async () => {
    console.log('\n⏰ بدء البث التلقائي...');
    const channels = channelDB.getAllChannels();
    
    for (const channel of channels) {
        const success = await sendHadithToChannel(channel.chatId, false);
        if (success) {
            console.log(`✅ أرسل إلى ${channel.title}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ انتهى البث لـ ${channels.length} قناة`);
}, 5 * 60 * 60 * 1000);

// حفظ بيانات كل دقيقة
setInterval(async () => {
    try {
        await userDB.save();
    } catch (err) {}
}, 60000);

// إحصائيات كل ساعة
setInterval(() => {
    console.log(`📊 ${userDB.getStats()} مستخدم | ${channelDB.getAllChannels().length} قناة`);
}, 3600000);

// معالجة الأخطاء
bot.on('polling_error', (error) => {
    if (error.code !== 'EFATAL') {
        console.error('Polling error:', error.message);
    }
});

process.on('uncaughtException', (error) => {
    if (error.code !== 'ECONNRESET') {
        console.error('خطأ:', error.message);
    }
});

// ========== بدء البوت ==========
async function startBot() {
    await channelDB.init();
    await userDB.init();
    
    console.log(`
╔════════════════════════════════════════╗
║   🚀 البوت يعمل بنجاح                   ║
║   📢 /add -100... لإضافة قناة          ║
║   ⏰ بث تلقائي كل 5 ساعات             ║
╚════════════════════════════════════════╝
    `);
}

startBot();