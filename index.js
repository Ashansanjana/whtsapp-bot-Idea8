/**
 * PizzaBot — Main Entry Point
 */

require('dotenv').config(); // Load environment variables FIRST

const config = require('./config');
const HistoryManager = require('./history');
const whatsappService = require('./src/services/whatsapp');
const openaiService = require('./src/services/openai');
const voiceService = require('./src/services/voice');
const expressService = require('./src/services/express');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🍕 PizzaBot — Pizza Hut Sri Lanka WhatsApp Assistant');
console.log(`   PID: ${process.pid}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Initialize Chat History Manager (with session timeout + smart trimming)
let historyManager;
if (config.aiBot.memory && config.aiBot.memory.enabled) {
  historyManager = new HistoryManager(config.aiBot.memory.limit);
  console.log(`💬 Session manager ready (limit: ${config.aiBot.memory.limit} msgs, timeout: 30 min)`);
}

// Initialize OpenAI service
if (config.aiBot && config.aiBot.enabled) {
  openaiService.initialize(process.env.OPENAI_API_KEY, historyManager);

  // Initialize voice service with OpenAI client (for Whisper API)
  if (config.voiceTranscription && config.voiceTranscription.enabled) {
    const openaiClient = openaiService.getClient();
    voiceService.initialize(openaiClient);
    console.log('🎤 Voice transcription enabled (Whisper API)');
  }
}

// Initialize WhatsApp client
console.log('⏳ Initializing WhatsApp client...\n');
const client = whatsappService.initializeClient(config);

// Setup graceful shutdown — also cleans up session manager timer
whatsappService.setupShutdownHandlers(() => {
  if (historyManager) {
    historyManager.destroy();
    console.log('💬 Session manager stopped');
  }
});

// Start WhatsApp client
client.initialize().catch(error => {
  console.error('❌ Failed to initialize client:', error);
  process.exit(1);
});

// Initialize Express API server
expressService.initializeServer(whatsappService, config);

console.log('✅ All services initialized successfully!\n');
