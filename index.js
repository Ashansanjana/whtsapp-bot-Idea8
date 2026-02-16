/**
 * WhatsApp Bot - Main Entry Point
 * Refactored for better modularity and maintainability
 */

require('dotenv').config(); // Load environment variables FIRST

const config = require('./config');
const HistoryManager = require('./history');
const whatsappService = require('./src/services/whatsapp');
const openaiService = require('./src/services/openai');
const voiceService = require('./src/services/voice');
const expressService = require('./src/services/express');

console.log(`🤖 Starting WhatsApp Bot (PID: ${process.pid})...`);

// Initialize Chat History Manager
let historyManager;
if (config.aiBot.memory && config.aiBot.memory.enabled) {
  historyManager = new HistoryManager(config.aiBot.memory.limit);
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

// Setup graceful shutdown handlers
whatsappService.setupShutdownHandlers();

// Initialize WhatsApp client
client.initialize().catch(error => {
  console.error('❌ Failed to initialize client:', error);
  process.exit(1);
});

// Initialize Express API server
expressService.initializeServer(whatsappService, config);

console.log('✅ All services initialized successfully!\n');
