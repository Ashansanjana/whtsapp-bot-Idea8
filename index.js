require('dotenv').config(); // Load environment variables FIRST
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config'); // Now this can access process.env variables
const OpenAI = require('openai');
const HistoryManager = require('./history');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Initialize Chat History Manager
let historyManager;
if (config.aiBot.memory && config.aiBot.memory.enabled) {
  historyManager = new HistoryManager(config.aiBot.memory.limit);
}

// Map to track processed message IDs to prevent double replies
const processedMessages = new Set();
// Clean up cache every hour to prevent memory leaks
setInterval(() => processedMessages.clear(), 3600000);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Session management variables
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const SESSION_PATH = path.join(__dirname, '.wwebjs_auth');
let isClientReady = false;

// Ensure session directory exists with proper permissions
if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true, mode: 0o755 });
  console.log('📁 Created session directory');
}

// Helper: Clear session and restart
async function clearSessionAndRestart() {
  console.log('🔄 Clearing corrupted session...');
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      console.log('✅ Session cleared successfully');
    }

    // Recreate directory
    fs.mkdirSync(SESSION_PATH, { recursive: true, mode: 0o755 });

    // Wait a bit before reinitializing
    setTimeout(() => {
      console.log('🔄 Restarting bot...');
      process.exit(1); // Let process manager (PM2/nodemon) restart it
    }, 2000);
  } catch (error) {
    console.error('❌ Error clearing session:', error);
    process.exit(1);
  }
}

// Helper: Generate Unique Booking ID
function generateBookingId() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `BK-WA-${dateStr}-${randomNum}`;
}

// Helper: Determine Package Type from Service Category
function getPackageType(serviceId) {
  const service = config.services ? config.services[serviceId] : null;
  if (!service) return 'Standard';

  const categoryMap = {
    'standard': 'Standard',
    'autoglym': 'Premium',
    'additional': 'Additional'
  };

  return categoryMap[service.category] || 'Standard';
}

// Helper: Format conversation transcript
function formatTranscript(messages) {
  return messages
    .filter(msg => msg.role !== 'system' && msg.role !== 'tool')
    .map(msg => {
      if (msg.role === 'user') return `User: ${msg.content}`;
      if (msg.role === 'assistant') return `Bot: ${msg.content}`;
      return '';
    })
    .filter(line => line)
    .join('\n');
}

// Helper: Send Booking to Webhook API
async function sendBookingWebhook(bookingData, customerInfo, conversationHistory) {
  try {
    const {
      serviceIds,
      vehicleType,
      startDateTime,
      customerName,
      phoneNumber,
      email,
      vehicleNumber,
      serviceAddress
    } = bookingData;

    const serviceArray = Array.isArray(serviceIds) ? serviceIds : [serviceIds];

    if (!config.vehicleTypes[vehicleType]) {
      return { success: false, message: `Error: Invalid vehicle type '${vehicleType}'.` };
    }

    const vehicleTypeObj = config.vehicleTypes[vehicleType];
    const vehicleTypeName = vehicleTypeObj.display || vehicleTypeObj;
    const vehicleKey = vehicleTypeObj.key || vehicleType;
    const vehicleTypeId = vehicleType;

    let totalPrice = 0;
    const serviceNames = [];

    for (const serviceId of serviceArray) {
      const service = config.getServiceById ? config.getServiceById(serviceId) : null;

      if (!service) {
        return { success: false, message: `Error: Service '${serviceId}' not found.` };
      }

      const price = service.prices[vehicleKey];
      if (price === undefined) {
        return { success: false, message: `Error: No price found for ${service.name} with vehicle type ${vehicleTypeName}.` };
      }

      totalPrice += price;
      serviceNames.push(service.name);
    }

    let preferredDate, preferredTime;

    if (startDateTime.includes('T')) {
      const dt = new Date(startDateTime);
      preferredDate = dt.toISOString().split('T')[0];
      const hours = dt.getHours().toString().padStart(2, '0');
      const minutes = dt.getMinutes().toString().padStart(2, '0');
      preferredTime = `${hours}:${minutes}`;
    } else {
      preferredDate = startDateTime.split(' ')[0] || startDateTime;
      preferredTime = startDateTime.split(' ')[1] || '10:00';
    }

    const bookingId = generateBookingId();
    const primaryServiceName = serviceNames[0];
    const packageType = getPackageType(serviceArray[0]);
    const serviceIdString = serviceArray.join(',');
    const finalCustomerName = customerName || 'Customer';
    const customerPhone = phoneNumber || 'Not provided';
    const transcript = conversationHistory ? formatTranscript(conversationHistory) : 'WhatsApp booking conversation';

    const payload = {
      name: finalCustomerName,
      phone: customerPhone,
      email: email || '',
      bookingDetails: {
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        service_name: primaryServiceName,
        service_id: serviceIdString,
        package_type: packageType,
        vehicle_type: vehicleTypeId,
        vehicle_number: vehicleNumber || '',
        service_address: serviceAddress || '',
        total_price: totalPrice
      },
      bookingId: bookingId,
      transcript: transcript
    };

    console.log('📤 Sending booking to webhook:', JSON.stringify(payload, null, 2));

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(config.aiBot.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.aiBot.webhook.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Webhook Error:', response.status, errorText);
      return {
        success: false,
        message: `Error: Webhook returned ${response.status}. ${errorText}`
      };
    }

    const result = await response.json();
    console.log('✅ Webhook Response:', result);

    const serviceList = serviceNames.join(', ');
    return {
      success: true,
      message: `✅ Booking confirmed successfully!\n\n📋 Booking ID: ${bookingId}\n👤 Customer: ${finalCustomerName}\n📞 Phone: ${customerPhone}\n📧 Email: ${email}\n🚗 Vehicle: ${vehicleTypeName} (${vehicleNumber})\n🛠️ Services: ${serviceList}\n📦 Package: ${packageType}\n📍 Address: ${serviceAddress}\n📅 Date: ${preferredDate}\n⏰ Time: ${preferredTime}\n💰 Total: Rs. ${totalPrice.toLocaleString()}\n\nYour booking has been sent to our system. We'll contact you shortly for confirmation!`,
      bookingId: bookingId
    };

  } catch (error) {
    console.error('❌ Webhook Booking Error:', error);
    return {
      success: false,
      message: `Error sending booking: ${error.message}`
    };
  }
}

// Helper: Verify Booking ID via GET API
async function verifyBookingId(bookingId) {
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `${config.aiBot.bookingApi.getEndpoint}/${bookingId}`;

    console.log(`🔍 Verifying booking ID: ${bookingId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': config.aiBot.bookingApi.apiKey
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          message: `❌ Booking ID "${bookingId}" not found. Please check and try again.`
        };
      }
      const errorText = await response.text();
      return {
        success: false,
        message: `❌ Error verifying booking: ${response.status}. ${errorText}`
      };
    }

    const bookingData = await response.json();
    console.log('✅ Booking verified:', bookingData);

    const customerName = bookingData.name || bookingData.customer_name || bookingData.customerName || 'Valued Customer';

    return {
      success: true,
      message: `✅ Hello ${customerName}! Your booking has been verified.\n\n📋 Booking ID: ${bookingId}`,
      bookingData: bookingData,
      customerName: customerName
    };

  } catch (error) {
    console.error('❌ Booking Verification Error:', error);
    return {
      success: false,
      message: `Error verifying booking: ${error.message}`
    };
  }
}

// Helper: Update Booking via PATCH API
async function updateBooking(bookingId, updates) {
  try {
    const fetch = (await import('node-fetch')).default;

    console.log('🔍 Incoming updates object:', JSON.stringify(updates, null, 2));

    console.log('📥 Fetching existing booking data...');
    const verifyResult = await verifyBookingId(bookingId);

    if (!verifyResult.success) {
      return {
        success: false,
        message: `Cannot update: ${verifyResult.message}`
      };
    }

    const existingDetails = verifyResult.bookingData?.details || {};
    console.log('📋 Existing details:', JSON.stringify(existingDetails, null, 2));

    const mergedDetails = {
      ...existingDetails,
      ...updates
    };

    console.log('🔀 Merged details:', JSON.stringify(mergedDetails, null, 2));

    const payload = {
      bookingId: bookingId,
      bookingDetails: mergedDetails,
      transcript: "Booking updated via WhatsApp Bot"
    };

    console.log('📤 Full PATCH payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(config.aiBot.bookingApi.patchEndpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.aiBot.bookingApi.apiKey
      },
      body: JSON.stringify(payload)
    });

    console.log('📡 API Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Update Error:', response.status, errorText);
      return {
        success: false,
        message: `❌ Failed to update booking: ${response.status}. ${errorText}`
      };
    }

    const result = await response.json();
    console.log('✅ API Response Body:', JSON.stringify(result, null, 2));

    let updatesList = [];
    if (updates.preferred_date || updates.preferred_time) {
      updatesList.push(`📅 Date & Time: ${updates.preferred_date || 'unchanged'} ${updates.preferred_time || ''}`);
    }
    if (updates.service_address) {
      updatesList.push(`📍 Service Address: ${updates.service_address}`);
    }
    if (updates.vehicle_number) {
      updatesList.push(`🚗 Vehicle Number: ${updates.vehicle_number}`);
    }
    if (updates.email) {
      updatesList.push(`📧 Email: ${updates.email}`);
    }

    return {
      success: true,
      message: `✅ Booking updated successfully!\n\n📋 Booking ID: ${bookingId}\n${updatesList.join('\n')}\n\nYour changes have been saved.`
    };

  } catch (error) {
    console.error('❌ Booking Update Error:', error);
    return {
      success: false,
      message: `Error updating booking: ${error.message}`
    };
  }
}

// Initialize the WhatsApp client with improved configuration
const puppeteerConfig = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions'
  ]
};

if (config.client.executablePath) {
  puppeteerConfig.executablePath = config.client.executablePath;
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'washbot-session', // Unique identifier
    dataPath: SESSION_PATH
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018939634-alpha.html',
  },
  puppeteer: puppeteerConfig
});

// Store for scheduled message intervals
const scheduledMessages = new Map();

// Initialize the bot
console.log(`🤖 Starting WhatsApp Bot (PID: ${process.pid})...`);
console.log('📁 Session path:', SESSION_PATH);

// Generate QR Code for authentication
client.on('qr', (qr) => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 QR Code Generated! Scan with WhatsApp:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  qrcode.generate(qr, { small: true });
  console.log('\n⏳ Waiting for QR code scan...\n');
  reconnectAttempts = 0; // Reset on QR generation
});

// Client authenticated
client.on('authenticated', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 Authentication successful!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  reconnectAttempts = 0;
});

// Authentication failure
client.on('auth_failure', async (msg) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ Authentication failure:', msg);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await clearSessionAndRestart();
});

// Client is ready
client.on('ready', async () => {
  isClientReady = true;
  reconnectAttempts = 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ WhatsApp Bot is ready!');
  console.log('👤 Connected as:', client.info.pushname);
  console.log('📱 Phone:', client.info.wid.user);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Safety patch for the 'markedUnread' error
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
    console.log('✉️  Auto-reply is enabled');
  }

  console.log('\n📡 Bot is now listening for messages...\n');
});

// Handle disconnection with reconnection logic
client.on('disconnected', async (reason) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('❌ Client disconnected:', reason);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  isClientReady = false;

  // Clear scheduled messages
  scheduledMessages.forEach(interval => clearInterval(interval));
  scheduledMessages.clear();

  // Handle reconnection
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

// Loading screen progress
client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Loading... ${percent}% - ${message}`);
});

// Handle incoming messages
client.on('message', async (message) => {
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
      console.log(`📨 Message from ${customerInfo.name} (${message.from}): ${message.body}`);
    }

    if (!config.autoReply.enabled) return;
    if (config.bot.ignoreOwnMessages && message.fromMe) return;
    if (config.bot.ignoreBroadcast && message.from === 'status@broadcast') return;

    // Group Message Handling
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

    const messageBody = message.body.toLowerCase();
    let replied = false;

    // AI Auto-Reply Logic
    if (config.aiBot && config.aiBot.enabled) {
      try {
        console.log('🤖 AI processing message... (OpenAI)');

        let messages = [];

        const now = new Date();
        const currentDateTime = now.toLocaleString('en-US', {
          timeZone: 'Asia/Colombo',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        // Check conversation history length to determine if this is a new conversation
        let conversationHistory = [];
        let isNewConversation = true;

        if (historyManager) {
          conversationHistory = historyManager.getMessages(message.from);
          // Consider it a new conversation if there are fewer than 2 messages in history
          isNewConversation = conversationHistory.length < 2;
        }

        const conversationStatus = isNewConversation
          ? "🆕 CONVERSATION STATUS: This is a NEW conversation (no prior history). You MUST show the language selection prompt."
          : "🔄 CONVERSATION STATUS: This is a CONTINUING conversation. DO NOT show language selection unless explicitly requested.";

        const systemPromptWithDate = `CURRENT DATE AND TIME: ${currentDateTime} (Sri Lanka Time)

IMPORTANT: Use this current date/time to validate that booking dates and times are NOT in the past.

${conversationStatus}

${config.aiBot.systemPrompt}`;

        messages.push({ role: "system", content: systemPromptWithDate });

        if (historyManager) {
          messages = messages.concat(conversationHistory);
        }

        const userMessage = { role: "user", content: message.body };
        messages.push(userMessage);

        const allServiceIds = [];
        if (config.packages) {
          if (config.packages.Standard) {
            allServiceIds.push(...config.packages.Standard.map(s => s.id));
          }
          if (config.packages.AutoGlym) {
            allServiceIds.push(...config.packages.AutoGlym.map(s => s.id));
          }
        } else if (config.services) {
          allServiceIds.push(...Object.keys(config.services));
        }

        const tools = [
          {
            type: "function",
            function: {
              name: "book_appointment",
              description: "Book a car wash appointment with one or more services for a specific vehicle type. This will send the booking to the backend API.",
              parameters: {
                type: "object",
                properties: {
                  service_ids: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: allServiceIds
                    },
                    description: "Array of service IDs to book (e.g., ['wash_vacuum', 'engine_bay_clean']). Can also be a single service ID string."
                  },
                  vehicle_type: {
                    type: "string",
                    enum: Object.keys(config.vehicleTypes),
                    description: "The vehicle type ID (car_minivan, crossover, suv, or van)"
                  },
                  start_date_time: {
                    type: "string",
                    description: "ISO 8601 start time (e.g., 2026-01-30T10:30:00+05:30) or formatted as 'YYYY-MM-DD HH:MM'"
                  },
                  customer_name: {
                    type: "string",
                    description: "Customer's full name"
                  },
                  phone_number: {
                    type: "string",
                    description: "Customer mobile/phone number (e.g., 0771234567 or +94771234567)"
                  },
                  email: {
                    type: "string",
                    description: "Customer email address (optional - will default to empty string if not provided)"
                  },
                  vehicle_number: {
                    type: "string",
                    description: "Vehicle registration number (e.g., ABC-1234)"
                  },
                  service_address: {
                    type: "string",
                    description: "Customer service/pickup address"
                  },
                },
                required: ["service_ids", "vehicle_type", "start_date_time", "customer_name", "phone_number", "vehicle_number", "service_address"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "verify_booking",
              description: "Verify if a booking ID exists in the system. Call this when user wants to reschedule/update their appointment.",
              parameters: {
                type: "object",
                properties: {
                  booking_id: {
                    type: "string",
                    description: "The booking ID to verify (e.g., 'BK-WA-20260119-123' or 'PCW-20260119-CUR4PU')"
                  }
                },
                required: ["booking_id"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "update_appointment",
              description: "Update an existing booking with new details. Only call this after collecting all updates from the user and getting their final confirmation.",
              parameters: {
                type: "object",
                properties: {
                  booking_id: {
                    type: "string",
                    description: "The booking ID to update"
                  },
                  preferred_date: {
                    type: "string",
                    description: "New preferred date in YYYY-MM-DD format (optional)"
                  },
                  preferred_time: {
                    type: "string",
                    description: "New preferred time in HH:MM format (optional)"
                  },
                  service_address: {
                    type: "string",
                    description: "New service/pickup address (optional)"
                  },
                  vehicle_number: {
                    type: "string",
                    description: "New vehicle registration number (optional)"
                  },
                  email: {
                    type: "string",
                    description: "New email address (optional)"
                  }
                },
                required: ["booking_id"]
              }
            }
          }
        ];

        let loopCount = 0;
        const MAX_LOOPS = 5;
        let finalReplySent = false;

        while (loopCount < MAX_LOOPS && !finalReplySent) {
          loopCount++;

          let response;
          try {
            response = await openai.chat.completions.create({
              model: config.aiBot.model,
              messages: messages,
              tools: tools,
              tool_choice: "auto",
            });
          } catch (err) {
            console.error('❌ OpenAI API Error:', err.message);
            if (err.response) {
              console.error('API Response Status:', err.response.status);
              console.error('API Response Data:', err.response.data);
            }
            throw new Error(`OpenAI API failed: ${err.message}`);
          }

          if (!response || !response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
            console.error('❌ Invalid OpenAI response structure:', JSON.stringify(response));
            throw new Error('Invalid or empty response from OpenAI API');
          }

          const responseMessage = response.choices[0].message;

          if (!responseMessage) {
            console.error('❌ No message in OpenAI response');
            throw new Error('No message object in OpenAI response');
          }

          if (responseMessage.tool_calls) {
            messages.push(responseMessage);

            for (const toolCall of responseMessage.tool_calls) {
              const fnName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments);
              let toolResult;

              console.log(`🛠️ Executing tool: ${fnName}`);

              if (fnName === 'book_appointment') {
                const bookingData = {
                  serviceIds: args.service_ids,
                  vehicleType: args.vehicle_type,
                  startDateTime: args.start_date_time,
                  customerName: args.customer_name,
                  phoneNumber: args.phone_number,
                  email: args.email,
                  vehicleNumber: args.vehicle_number,
                  serviceAddress: args.service_address
                };

                const result = await sendBookingWebhook(bookingData, customerInfo, messages);
                toolResult = result.success ? result.message : result.message;
              } else if (fnName === 'verify_booking') {
                const result = await verifyBookingId(args.booking_id);
                toolResult = result.message;
              } else if (fnName === 'update_appointment') {
                const updates = {};
                if (args.preferred_date) updates.preferred_date = args.preferred_date;
                if (args.preferred_time) updates.preferred_time = args.preferred_time;
                if (args.service_address) updates.service_address = args.service_address;
                if (args.vehicle_number) updates.vehicle_number = args.vehicle_number;
                if (args.email) updates.email = args.email;

                const result = await updateBooking(args.booking_id, updates);
                toolResult = result.message;
              } else {
                toolResult = "Unknown tool";
              }

              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: fnName,
                content: toolResult,
              });
            }
          } else {
            const aiReply = responseMessage.content;
            if (aiReply) {
              try {
                await chat.sendMessage(aiReply);
                console.log('✅ AI replied:', aiReply);
              } catch (sendError) {
                console.error('❌ Error sending AI reply, trying client fallback:', sendError.message);
                await client.sendMessage(message.from, aiReply);
              }
              messages.push({ role: "assistant", content: aiReply });
              replied = true;
            }
            finalReplySent = true;
          }
        }

        if (historyManager) {
          const historyLen = historyManager.getMessages(message.from).length;
          const newContent = messages.slice(1 + historyLen);

          for (const msg of newContent) {
            if (msg.role === 'user' || (msg.role === 'assistant' && msg.content)) {
              const cleanMsg = {
                role: msg.role,
                content: msg.content
              };
              historyManager.addMessage(message.from, cleanMsg);
            }
          }
        }

        replied = true;
      } catch (aiError) {
        console.error('❌ AI Error:', aiError.message);
        console.log('⚠️ Falling back to keyword/default reply...');
        if (!config.aiBot.fallbackToDefault) return;
      }
    }

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
});

// Function to send a message
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

// Function to start automatic message sending
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down bot gracefully...');

  scheduledMessages.forEach(interval => clearInterval(interval));
  scheduledMessages.clear();

  try {
    await client.destroy();
    console.log('✅ Client destroyed successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Received SIGTERM, shutting down...');

  scheduledMessages.forEach(interval => clearInterval(interval));
  scheduledMessages.clear();

  try {
    await client.destroy();
    console.log('✅ Client destroyed successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }

  process.exit(0);
});

// Start the client
console.log('⏳ Initializing WhatsApp client...\n');
client.initialize().catch(error => {
  console.error('❌ Failed to initialize client:', error);
  clearSessionAndRestart();
});

// ========================================
// EXPRESS API SERVER FOR WEB INTERFACE
// ========================================

const app = express();
const API_PORT = process.env.API_PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsappReady: isClientReady,
    connectedAs: client.info ? {
      name: client.info.pushname,
      phone: client.info.wid.user
    } : null,
    reconnectAttempts: reconnectAttempts
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    ready: isClientReady,
    info: client.info ? {
      name: client.info.pushname,
      phone: client.info.wid.user
    } : null
  });
});

app.post('/api/upload-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const fileExt = req.file.originalname.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(fileExt)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Please upload .xlsx or .xls file'
      });
    }

    console.log('📊 Processing Excel file:', req.file.originalname);

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const phoneNumbers = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row && row[0]) {
        let phone = String(row[0]).trim();

        if (i === 0 && /phone|number|contact|mobile/i.test(phone)) {
          continue;
        }

        phone = phone.replace(/[^\d+]/g, '');

        if (phone.length >= 10) {
          phoneNumbers.push(phone);
        }
      }
    }

    console.log(`✅ Extracted ${phoneNumbers.length} phone numbers`);

    res.json({
      success: true,
      phoneNumbers: phoneNumbers,
      count: phoneNumbers.length
    });

  } catch (error) {
    console.error('❌ Excel upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process Excel file: ' + error.message
    });
  }
});

app.post('/api/send-bulk', async (req, res) => {
  try {
    const { phoneNumbers, message } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Phone numbers array is required and must not be empty'
      });
    }

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    if (!isClientReady) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client is not ready. Please wait and try again.'
      });
    }

    console.log(`📤 Bulk send request: ${phoneNumbers.length} recipients`);

    const results = [];

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      const chatId = `${cleanNumber}@c.us`;

      try {
        await client.sendMessage(chatId, message);
        console.log(`✅ Sent to +${cleanNumber} (${i + 1}/${phoneNumbers.length})`);
        results.push({
          phoneNumber: cleanNumber,
          success: true,
          status: 'sent'
        });
      } catch (error) {
        console.error(`❌ Failed to send to +${cleanNumber}:`, error.message);
        results.push({
          phoneNumber: cleanNumber,
          success: false,
          status: 'failed',
          error: error.message
        });
      }

      if (i < phoneNumbers.length - 1) {
        const delay = 3000 + Math.random() * 4000;
        console.log(`⏳ Waiting ${Math.round(delay / 1000)}s before next message...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`📊 Summary: ${successful} successful, ${failed} failed`);

    res.json({
      success: true,
      summary: {
        total: phoneNumbers.length,
        successful,
        failed
      },
      results
    });

  } catch (error) {
    console.error('❌ Bulk send error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(API_PORT, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 Web Interface Server Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${API_PORT}`);
  console.log(`📋 Web UI: http://localhost:${API_PORT}`);
  console.log(`🔌 API: http://localhost:${API_PORT}/api/send-bulk`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});