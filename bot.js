import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const token = process.env.BOT_TOKEN;
const DEVELOPER_ID = 8236813471;

// ========== إعدادات القنوات ==========
// أضف معرفات القنوات هنا (يمكنك إضافة عدة قنوات)
const CHANNELS = {
  MAIN: '@ta_w_hid_11',     // قناة رئيسية - غيرها إلى معرف قناتك
  // SECONDARY: '@your_second_channel',   
};

// قائمة القنوات للبث التلقائي
const CHANNELS_LIST = [
  CHANNELS.MAIN,
];

if (!token) {
  console.error('❌ خطأ: لم يتم العثور على BOT_TOKEN في ملف .env');
  process.exit(1);
}

// ========== إعدادات البوت ==========
const bot = new TelegramBot(token, { 
  polling: true,
  pollingOptions: {
    timeout: 30,
    retryTimeout: 5000,
    interval: 1000
  },
  request: {
    timeout: 60000,
    agentOptions: {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 10,
      maxFreeSockets: 5
    }
  }
});

// ========== تخزين المستخدمين ==========
const usersList = new Map();

// ========== دالة تنسيق الحديث ==========
function formatHadithMsg(hadith) {
  let msg = `📖 *${hadith.title || 'حديث نبوي'}*\n\n`;
  msg += `📝 *الحديث:*\n${hadith.hadeeth}\n\n`;
  
  if (hadith.explanation) {
    msg += `💡 *الشرح:*\n${hadith.explanation}\n\n`;
  }
  
  if (hadith.grade) {
    msg += `⭐ *صحة الحديث:* ${hadith.grade}\n`;
  }
  if (hadith.reference) {
    msg += `📜 *المصدر:* ${hadith.reference}\n`;
  }
  
  return msg;
}

// ========== دوال الإرسال إلى القناة (جديد) ==========

/**
 * إرسال رسالة إلى قناة محددة
 * @param {string} channelId - معرف القناة (@username أو -100...)
 * @param {string} message - نص الرسالة
 * @param {object} options - خيارات إضافية
 */
async function sendToChannel(channelId, message, options = {}) {
  try {
    const defaultOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };
    
    const result = await bot.sendMessage(channelId, message, { ...defaultOptions, ...options });
    console.log(`✅ تم الإرسال إلى القناة: ${channelId}`);
    return result;
  } catch (err) {
    console.error(`❌ فشل الإرسال إلى القناة ${channelId}: ${err.message}`);
    return null;
  }
}

/**
 * إرسال حديث عشوائي إلى قناة
 * @param {string} channelId - معرف القناة
 * @param {boolean} isPeriodic - هل هو حديث الفترة؟
 */
async function sendHadithToChannel(channelId, isPeriodic = false) {
  try {
    const endpoint = isPeriodic ? 'http://localhost:3000/api/periodic' : 'http://localhost:3000/api/random';
    const response = await axios.get(endpoint);
    
    const prefix = isPeriodic ? '📣 *تذكير بحديث الفترة!*\n\n' : '🌟 *حديث اليوم* 🌟\n\n';
    const msgBlock = prefix + formatHadithMsg(response.data);
    
    await sendToChannel(channelId, msgBlock);
    return true;
  } catch (err) {
    console.error(`❌ خطأ في جلب الحديث للقناة: ${err.message}`);
    return false;
  }
}

/**
 * بث حديث إلى جميع القنوات المسجلة
 * @param {boolean} isPeriodic - هل هو حديث الفترة؟
 */
async function broadcastToAllChannels(isPeriodic = false) {
  if (CHANNELS_LIST.length === 0) {
    console.log('⚠️ لا توجد قنوات مضافة للإرسال');
    return;
  }
  
  console.log(`\n🚀 بدء البث إلى ${CHANNELS_LIST.length} قناة...`);
  
  let successCount = 0;
  for (const channel of CHANNELS_LIST) {
    const success = await sendHadithToChannel(channel, isPeriodic);
    if (success) successCount++;
    await new Promise(resolve => setTimeout(resolve, 1000)); // تأخير ثانية بين القنوات
  }
  
  console.log(`✅ تم البث بنجاح إلى ${successCount}/${CHANNELS_LIST.length} قناة`);
}

// ========== حدث أول دخول للبوت ==========
bot.on('my_chat_member', async (update) => {
  const oldStatus = update.old_chat_member?.status;
  const newStatus = update.new_chat_member?.status;
  const userId = update.from.id;
  const username = update.from.username || update.from.first_name;
  const chatId = update.chat.id;
  
  if (oldStatus === 'left' && newStatus === 'member') {
    const now = new Date();
    
    usersList.set(userId, {
      username: username,
      firstEntry: now,
      lastActive: now,
      fullName: update.from.first_name + (update.from.last_name ? ' ' + update.from.last_name : '')
    });
    
    console.log(`\n👤 مستخدم جديد: ${update.from.first_name} (${userId})`);
    
    const options = {
      reply_markup: {
        keyboard: [
          ['📖 حديث عشوائي', '♻️ حديث الفترة'],
          ['ℹ️ معلومات', '📞 تواصل'],
          ['❌ إغلاق']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    
    await bot.sendMessage(chatId, 
      `🎉 *مرحباً بك يا ${update.from.first_name}!* 🎉\n\n` +
      `أنا بوت الأحاديث النبوية، اختر أحد الخيارات من القائمة 👇`,
      { parse_mode: 'Markdown', ...options }
    );
  }
  
  if (oldStatus === 'kicked' && newStatus === 'member') {
    console.log(`🔄 عودة: ${username} (${userId})`);
    const options = {
      reply_markup: {
        keyboard: [
          ['📖 حديث عشوائي', '♻️ حديث الفترة'],
          ['ℹ️ معلومات', '📞 تواصل'],
          ['❌ إغلاق']
        ],
        resize_keyboard: true
      }
    };
    await bot.sendMessage(chatId, `👋 مرحباً بعودتك يا ${update.from.first_name}!`, options);
  }
});

// ========== أمر /start ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  
  if (usersList.has(userId)) {
    const userData = usersList.get(userId);
    userData.lastActive = new Date();
    usersList.set(userId, userData);
    console.log(`🔄 عودة: ${username} (${userId})`);
  } else {
    usersList.set(userId, {
      username: username,
      firstEntry: new Date(),
      lastActive: new Date(),
      fullName: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '')
    });
    console.log(`👤 جديد: ${username} (${userId})`);
  }

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📖 حديث عشوائي', callback_data: 'get_random_hadith' }],
        [{ text: '♻️ حديث الفترة', callback_data: 'get_periodic_hadith' }],
        [{ text: '📢 قناة البوت', url: 'https://t.me/your_channel_username' }], // رابط قناتك
        [{ text: 'ℹ️ معلومات', callback_data: 'get_info' }],
        [{ text: '📞 تواصل', callback_data: 'get_contact' }],
        [{ text: '❌ إغلاق', callback_data: 'close_keyboard' }]
      ]
    }
  };
  
  await bot.sendMessage(chatId, `مرحباً بك مجدداً ${msg.from.first_name}! 👋\nاختر من القائمة أدناه:`, options);
});

// ========== أوامر المطور للتحكم بالقناة (جديد) ==========

// أمر لإرسال حديث عشوائي إلى القناة
bot.onText(/\/send_to_channel/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== DEVELOPER_ID) {
    await bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمطور فقط');
    return;
  }
  
  await bot.sendMessage(chatId, '🔄 جاري إرسال الحديث إلى القناة...');
  const success = await sendHadithToChannel(CHANNELS.MAIN, false);
  
  if (success) {
    await bot.sendMessage(chatId, '✅ تم إرسال الحديث إلى القناة بنجاح');
  } else {
    await bot.sendMessage(chatId, '❌ فشل إرسال الحديث إلى القناة');
  }
});

// أمر لإرسال حديث الفترة إلى القناة
bot.onText(/\/send_periodic_to_channel/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== DEVELOPER_ID) {
    await bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمطور فقط');
    return;
  }
  
  await bot.sendMessage(chatId, '🔄 جاري إرسال حديث الفترة إلى القناة...');
  const success = await sendHadithToChannel(CHANNELS.MAIN, true);
  
  if (success) {
    await bot.sendMessage(chatId, '✅ تم إرسال حديث الفترة إلى القناة');
  } else {
    await bot.sendMessage(chatId, '❌ فشل الإرسال');
  }
});

// أمر لإرسال رسالة مخصصة إلى القناة
bot.onText(/\/channel_msg (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const customMessage = match[1];
  
  if (userId !== DEVELOPER_ID) {
    await bot.sendMessage(chatId, '⛔ هذا الأمر للمطور فقط');
    return;
  }
  
  await sendToChannel(CHANNELS.MAIN, customMessage);
  await bot.sendMessage(chatId, '✅ تم إرسال الرسالة المخصصة إلى القناة');
});

// أمر لبث حديث لجميع القنوات
bot.onText(/\/broadcast/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId !== DEVELOPER_ID) {
    await bot.sendMessage(chatId, '⛔ هذا الأمر للمطور فقط');
    return;
  }
  
  await bot.sendMessage(chatId, '🔄 جاري البث لجميع القنوات...');
  await broadcastToAllChannels(false);
  await bot.sendMessage(chatId, '✅ تم البث لجميع القنوات');
});

// ========== إحصائيات المستخدمين ==========
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userId === DEVELOPER_ID) {
    if (usersList.size === 0) {
      await bot.sendMessage(chatId, '📊 لا يوجد مستخدمين حتى الآن');
      return;
    }
    
    let statsMessage = `📊 *إحصائيات المستخدمين*\n\n👥 المجموع: ${usersList.size}\n\n`;
    let counter = 1;
    for (const [id, user] of usersList) {
      statsMessage += `${counter}. ${user.fullName}\n   🆔 \`${id}\`\n`;
      counter++;
      if (counter > 20) break;
    }
    
    if (usersList.size > 20) statsMessage += `\n... و ${usersList.size - 20} مستخدم آخر`;
    
    await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمطور فقط');
  }
});

// ========== معالجة الأزرار ==========
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = message.chat.id;
  
  if (data === 'get_another_hadith' || data === 'get_random_hadith') {
    try {
      const waitMsg = await bot.sendMessage(chatId, '🔄 جاري جلب حديث...');
      const response = await axios.get('http://localhost:3000/api/random');
      const msgBlock = formatHadithMsg(response.data);
      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '♻️ حديث آخر', callback_data: 'get_another_hadith' }]]
        }
      };
      await bot.sendMessage(chatId, msgBlock, options);
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    } catch (err) {
      bot.sendMessage(chatId, '❌ حدث خطأ في جلب الحديث');
    }
  } else if (data === 'get_periodic_hadith') {
    try {
      const waitMsg = await bot.sendMessage(chatId, '🔄 جاري جلب حديث الفترة...');
      const response = await axios.get('http://localhost:3000/api/periodic');
      const msgBlock = `📣 *تذكير بحديث الفترة!*\n\n` + formatHadithMsg(response.data);
      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '♻️ حديث آخر', callback_data: 'get_another_hadith' }]]
        }
      };
      await bot.sendMessage(chatId, msgBlock, options);
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    } catch (err) {
      bot.sendMessage(chatId, '❌ حدث خطأ');
    }
  } else if (data === 'get_info') {
    bot.sendMessage(chatId, '🤖 *بوت الأحاديث النبوية*\n\n📊 *المستخدمين:* ' + usersList.size, { parse_mode: 'Markdown' });
  } else if (data === 'get_contact') {
    bot.sendMessage(chatId, '📞 *للتواصل:* @ALFAHED_000', { parse_mode: 'Markdown' });
  } else if (data === 'close_keyboard') {
    bot.deleteMessage(chatId, message.message_id).catch(() => {});
  }
  
  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
});

// ========== أوامر النصوص ==========
bot.onText(/📞 تواصل/, (msg) => {
  bot.sendMessage(msg.chat.id, '📞 *للتواصل:* @ALFAHED_000', { parse_mode: 'Markdown' });
});

bot.onText(/ℹ️ معلومات/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 *بوت الأحاديث النبوية*\n\n📊 *المستخدمين:* ' + usersList.size, { parse_mode: 'Markdown' });
});

bot.onText(/❌ إغلاق/, (msg) => {
  bot.sendMessage(msg.chat.id, 'تم إغلاق القائمة. أرسل /start لإظهارها', {
    reply_markup: { remove_keyboard: true }
  });
});

bot.onText(/📖 حديث عشوائي/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const waitMsg = await bot.sendMessage(chatId, '🔄 جاري جلب الحديث...');
    const response = await axios.get('http://localhost:3000/api/random');
    const msgBlock = formatHadithMsg(response.data);
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '♻️ حديث آخر', callback_data: 'get_another_hadith' }]]
      }
    };
    await bot.sendMessage(chatId, msgBlock, options);
    bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
  } catch(e) {
    bot.sendMessage(chatId, '❌ حدث خطأ');
  }
});

bot.onText(/♻️ حديث الفترة/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const waitMsg = await bot.sendMessage(chatId, '🔄 جاري جلب حديث الفترة...');
    const response = await axios.get('http://localhost:3000/api/periodic');
    const msgBlock = `📣 *تذكير بحديث الفترة!*\n\n` + formatHadithMsg(response.data);
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '♻️ حديث آخر', callback_data: 'get_another_hadith' }]]
      }
    };
    await bot.sendMessage(chatId, msgBlock, options);
    bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
  } catch(e) {
    bot.sendMessage(chatId, '❌ حدث خطأ');
  }
});

// ========== بث تلقائي إلى القنوات كل 5 ساعات (جديد) ==========
setInterval(async () => {
  console.log('\n⏰ بدء البث التلقائي إلى القنوات...');
  await broadcastToAllChannels(false);
}, 5 * 60 * 60 * 1000); // كل 5 ساعات

// ========== بث تلقائي للمستخدمين كل 3 ساعات ==========
setInterval(async () => {
  if (usersList.size === 0) return;
  
  console.log(`\n🚀 بث تلقائي لـ ${usersList.size} مستخدم...`);
  
  try {
    const response = await axios.get('http://localhost:3000/api/random');
    const msgBlock = `📣 *حديث الفترة (بث تلقائي)*\n\n` + formatHadithMsg(response.data);
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '♻️ حديث آخر', callback_data: 'get_another_hadith' }]]
      }
    };
    
    let success = 0;
    for (const [userId] of usersList) {
      try {
        await bot.sendMessage(userId, msgBlock, options);
        success++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error(`❌ فشل الإرسال للمستخدم ${userId}`);
      }
    }
    
    console.log(`✅ تم البث لـ ${success} مستخدم`);
  } catch (err) {
    console.error('❌ خطأ في البث:', err.message);
  }
}, 3 * 60 * 60 * 1000); // كل 3 ساعات

// ========== معالجة الأخطاء ==========
bot.on('polling_error', (error) => {
  if (error.code !== 'EFATAL') return;
});

process.on('uncaughtException', (error) => {
  if (error.code !== 'ECONNRESET') console.error('خطأ:', error.message);
});

process.on('unhandledRejection', (reason) => {
  if (reason?.code !== 'ECONNRESET') console.error('خطأ غير معالج:', reason?.message);
});

// ========== إحصائيات دورية ==========
setInterval(() => {
  console.log(`\n📊 إحصائيات: ${usersList.size} مستخدم | ${new Date().toLocaleString('ar-EG')}\n`);
}, 3600000);

console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║   🚀 البوت يعمل بنجاح                     ║
║   👥 جاهز لاستقبال المستخدمين            ║
║   📢 إرسال للقنوات: مفعل                 ║
║   ⏰ بث تلقائي كل 5 ساعات للقنوات        ║
║                                          ║
╚══════════════════════════════════════════╝
`);