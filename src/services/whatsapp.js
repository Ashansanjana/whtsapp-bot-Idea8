/**
 * WhatsApp Service - Handles WhatsApp client initialization and event management
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const geminiService = require('./gemini');
const voiceService = require('./voice');
const logger = require('../utils/logger');

// Session management
const SESSION_PATH = path.join(__dirname, '../../.wwebjs_auth');
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let isClientReady = false;
let client;
let config;

// Message processing cache
const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 3600000); // Clean up every hour

// Scheduled messages store
const scheduledMessages = new Map();

/**
 * Ensure session directory exists
 */
function ensureSessionDirectory() {
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true, mode: 0o755 });
    console.log('📁 Created session directory');
  }
}

/**
 * Clear session and restart
 */
async function clearSessionAndRestart() {
  console.log('🔄 Clearing corrupted session...');
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      console.log('✅ Session cleared successfully');
    }

    fs.mkdirSync(SESSION_PATH, { recursive: true, mode: 0o755 });

    setTimeout(() => {
      console.log('🔄 Restarting bot...');
      process.exit(1); // Let process manager restart it
    }, 2000);
  } catch (error) {
    console.error('❌ Error clearing session:', error);
    process.exit(1);
  }
}

/**
 * Initialize WhatsApp client
 */
function initializeClient(configuration) {
  config = configuration;

  ensureSessionDirectory();

  const puppeteerConfig = {
    headless: true,
    args: config.client.puppeteerArgs
  };

  if (config.client.executablePath) {
    puppeteerConfig.executablePath = config.client.executablePath;
  }

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'buildstart-session',
      dataPath: SESSION_PATH
    }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018939634-alpha.html',
    },
    puppeteer: puppeteerConfig
  });

  setupEventHandlers();

  return client;
}

/**
 * Setup event handlers for WhatsApp client
 */
function setupEventHandlers() {
  // QR Code generation
  client.on('qr', async (qr) => {
    const timestamp = new Date().toISOString();
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`📱 QR Code Generated! Scan with WhatsApp [${timestamp}]`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Store QR for web UI (wait for image generation)
    await logger.setQRCode(qr);

    // Also show in terminal
    qrcode.generate(qr, { small: true });
    console.log(`\n⏳ Waiting for QR code scan... [${timestamp}]\n`);
    reconnectAttempts = 0;
  });

  // Authentication success
  client.on('authenticated', () => {
    logger.success('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.success('🔐 Authentication successful!');
    logger.success('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.clearQRCode(); // Clear QR after successful auth
    reconnectAttempts = 0;
  });

  // Authentication failure
  client.on('auth_failure', async (msg) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Authentication failure:', msg);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await clearSessionAndRestart();
  });

  // Client ready
  client.on('ready', async () => {
    isClientReady = true;
    reconnectAttempts = 0;

    logger.success('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.success('✅ WhatsApp Bot is ready!');
    logger.success(`👤 Connected as: ${client.info.pushname}`);
    logger.success(`📱 Phone: ${client.info.wid.user}`);
    logger.success('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Apply safety patch for sendSeen error
    try {
      await client.pupPage.evaluate(() => {
        if (window.WWebJS && window.WWebJS.sendSeen) {
          const originalSendSeen = window.WWebJS.sendSeen;
          window.WWebJS.sendSeen = async (chatId) => {
            try {
              return await originalSendSeen(chatId);
            } catch (e) {
              return true;
            }
          };
        }
      });
    } catch (patchError) {
      console.warn('⚠️ Could not apply sendSeen patch:', patchError.message);
    }

    if (config.autoSend.enabled) {
      startAutoSend();
    }

    if (config.autoReply.enabled) {
      logger.info('✉️  Auto-reply is enabled');
    }

    logger.info('📡 Bot is now listening for messages...');
  });

  // Disconnected handler
  client.on('disconnected', async (reason) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ Client disconnected:', reason);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    isClientReady = false;

    scheduledMessages.forEach(interval => clearInterval(interval));
    scheduledMessages.clear();

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

      setTimeout(async () => {
        try {
          console.log('🔄 Reinitializing client...');
          await client.initialize();
        } catch (error) {
          console.error('❌ Reconnection failed:', error.message);
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log('❌ Max reconnection attempts reached. Clearing session...');
            await clearSessionAndRestart();
          }
        }
      }, 5000);
    } else {
      console.log('❌ Max reconnection attempts reached');
      await clearSessionAndRestart();
    }
  });

  // Loading screen
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading... ${percent}% - ${message}`);
  });

  // Message handler
  client.on('message', handleMessage);
}

/**
 * Handle incoming messages
 */
async function handleMessage(message) {
  // Prevent duplicate processing
  if (processedMessages.has(message.id._serialized)) return;
  processedMessages.add(message.id._serialized);

  try {
    const chat = await message.getChat();
    const contact = await message.getContact();
    const customerInfo = {
      name: contact.name || contact.pushname || 'Customer',
      number: message.from.split('@')[0]
    };

    if (config.bot.logMessages) {
      logger.info(`📨 Message from ${customerInfo.name} (${message.from}): ${message.body}`);
    }

    if (!config.autoReply.enabled) return;
    if (config.bot.ignoreOwnMessages && message.fromMe) return;
    if (config.bot.ignoreBroadcast && message.from === 'status@broadcast') return;

    // Group message handling
    if (message.from.endsWith('@g.us')) {
      if (config.bot.ignoreGroups) return;

      const mentions = await message.getMentions();
      const isMentioned = mentions.some(contact => contact.id._serialized === client.info.wid._serialized);

      let isReplyingToBot = false;
      if (message.hasQuotedMsg) {
        const quotedMsg = await message.getQuotedMessage();
        if (quotedMsg.author === client.info.wid._serialized || quotedMsg.fromMe) {
          isReplyingToBot = true;
        }
      }

      if (!isMentioned && !isReplyingToBot) {
        return;
      }

      console.log('🔔 Bot mentioned or replied to in group. Processing...');
    }

    // Check if this is a voice message and transcription is enabled
    if (config.voiceTranscription && config.voiceTranscription.enabled && voiceService.isVoiceMessage(message)) {
      console.log('🎤 Voice message detected, transcribing...');

      const transcriptionResult = await voiceService.transcribeVoiceMessage(message, config);

      if (transcriptionResult.success) {
        // Replace message body with transcribed text
        message.body = transcriptionResult.text;
        console.log(`✅ Voice transcribed: "${message.body}"`);
      } else {
        console.error('❌ Voice transcription failed:', transcriptionResult.error);
        // Send error message to user
        try {
          await chat.sendMessage('Sorry, I couldn\'t transcribe your voice message. Please try again or send a text message.');
        } catch (err) {
          console.error('❌ Error sending transcription error message:', err.message);
        }
        return; // Don't process further if transcription failed
      }
    }

    // Handle Location Messages
    if (message.type === 'location') {
      try {
        const { latitude, longitude } = message.location;
        console.log(`📍 Location received: ${latitude}, ${longitude}`);
        // Convert location object to text for the AI
        message.body = `[User sent Current Location: https://www.google.com/maps?q=${latitude},${longitude}]`;
      } catch (locError) {
        console.error('❌ Error processing location:', locError);
      }
    } else if (message.type === 'live_location') {
      // AI cannot track live location, inform it so it can tell the user
      message.body = `[User sent Live Location (Not Supported). Prompt user to send 'Current Location' instead.]`;
    }

    const messageBody = message.body.toLowerCase();
    let replied = false;

    // AI Auto-Reply Logic
    if (config.aiBot && config.aiBot.enabled) {
      const result = await geminiService.processMessage(message, customerInfo, config);

      if (result.success && result.reply) {
        try {
          await chat.sendMessage(result.reply);
          console.log('✅ AI replied:', result.reply);
          replied = true;
        } catch (sendError) {
          console.error('❌ Error sending AI reply, trying client fallback:', sendError.message);
          await client.sendMessage(message.from, result.reply);
          replied = true;
        }
      } else if (!config.aiBot.fallbackToDefault) {
        return;
      }
    }

    // Keyword-based replies
    if (!replied) {
      for (const [keyword, response] of Object.entries(config.autoReply.keywords)) {
        if (messageBody.includes(keyword.toLowerCase())) {
          try {
            await chat.sendMessage(response);
            console.log(`✅ Auto-replied with keyword: "${keyword}"`);
          } catch (sendError) {
            console.error('❌ Error sending keyword reply:', sendError.message);
            await client.sendMessage(message.from, response);
          }
          replied = true;
          break;
        }
      }
    }

    // Default reply
    if (!replied && config.autoReply.useDefaultReply) {
      try {
        await chat.sendMessage(config.autoReply.defaultReply);
        console.log('✅ Auto-replied with default message');
      } catch (sendError) {
        console.error('❌ Error sending default reply:', sendError.message);
        await client.sendMessage(message.from, config.autoReply.defaultReply);
      }
    }

  } catch (error) {
    console.error('❌ Error handling message:', error);
  }
}

/**
 * Send a message
 */
async function sendMessage(to, message) {
  try {
    await client.sendMessage(to, message);
    console.log(`✅ Message sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending message to ${to}:`, error);
    return false;
  }
}

/**
 * Start automatic message sending
 */
function startAutoSend() {
  console.log('\n🚀 Starting automatic message sending...');

  config.autoSend.messages.forEach((msgConfig, index) => {
    const { to, message, schedule } = msgConfig;

    if (schedule.immediate) {
      setTimeout(() => {
        sendMessage(to, message);
      }, 1000);
    }

    if (schedule.delay > 0 || !schedule.immediate) {
      setTimeout(() => {
        sendMessage(to, message);

        if (schedule.interval > 0) {
          const intervalId = setInterval(() => {
            sendMessage(to, message);
          }, schedule.interval);

          scheduledMessages.set(`msg_${index}`, intervalId);
          console.log(`⏰ Scheduled message ${index + 1} to repeat every ${schedule.interval}ms`);
        }
      }, schedule.delay);
    }
  });
}

/**
 * Graceful shutdown
 */
function setupShutdownHandlers(onShutdown) {
  const shutdown = async (signal) => {
    console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);

    scheduledMessages.forEach(interval => clearInterval(interval));
    scheduledMessages.clear();

    // Call optional cleanup callback (e.g. historyManager.destroy())
    if (typeof onShutdown === 'function') {
      try { onShutdown(); } catch (e) { /* ignore */ }
    }

    try {
      await client.destroy();
      console.log('✅ Client destroyed successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Get client status
 */
function getStatus() {
  return {
    ready: isClientReady,
    info: client && client.info ? {
      name: client.info.pushname,
      phone: client.info.wid.user
    } : null,
    reconnectAttempts
  };
}

/**
 * Get client instance
 */
function getClient() {
  return client;
}

module.exports = {
  initializeClient,
  sendMessage,
  getStatus,
  getClient,
  setupShutdownHandlers
};
