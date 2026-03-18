/**
 * Gemini Service - Handles AI bot logic and conversation management for the Bot
 */

const { GoogleGenAI } = require('@google/genai');

let ai;
let historyManager;

/**
 * Initialize Gemini client and history manager
 */
function initialize(apiKey, historyMgr) {
  ai = new GoogleGenAI({ apiKey });
  historyManager = historyMgr;
}

/**
 * Process AI bot message 
 */
async function processMessage(message, customerInfo, config) {
  try {
    console.log('🤖 AI processing message... (Gemini)');

    // Build system prompt with current date/time
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

    // Check for session reset (inactivity timeout or reset keyword)
    if (historyManager) {
      const wasReset = historyManager.checkAndReset(message.from, message.body);
      if (wasReset) {
        console.log(`🔄 Session reset for ${message.from} — starting fresh`);
      }
    }

    // Check conversation history
    let conversationHistory = [];
    let isNewConversation = true;

    if (historyManager) {
      conversationHistory = historyManager.getMessages(message.from);
      isNewConversation = conversationHistory.length < 2;
    }

    const conversationStatus = isNewConversation
      ? "🆕 CONVERSATION STATUS: This is a NEW conversation (no prior history). You MUST show the language selection prompt."
      : "🔄 CONVERSATION STATUS: This is a CONTINUING conversation. DO NOT show language selection unless explicitly requested.";

    const systemPromptWithDate = `CURRENT DATE AND TIME: ${currentDateTime} (Sri Lanka Time)

IMPORTANT: Use this current date/time to check operating hours (10:00 AM – 11:00 PM).

${conversationStatus}

${config.aiBot.systemPrompt}`;

    const systemInstruction = systemPromptWithDate;

    // Convert OpenAI history format to Gemini format
    const contents = [];
    
    // Add conversation history
    for (const msg of conversationHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message.body }]
    });

    // Call Gemini API
    let response;
    try {
      response = await ai.models.generateContent({
        model: config.aiBot.model,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
        }
      });
    } catch (err) {
      console.error('❌ Gemini API Error:', err.message);
      throw new Error(`Gemini API failed: ${err.message}`);
    }

    if (!response || !response.text) {
      console.error('❌ Invalid Gemini response structure:', JSON.stringify(response));
      throw new Error('Invalid or empty response from Gemini API');
    }

    const aiReply = response.text;

    // Update history using the original 'assistant' and 'user' string formats that 
    // the historyManager might be expecting from OpenAI days, or we can just stick 
    // to them to maintain compatibility with other parts of the codebase if any.
    if (historyManager) {
      // Add the user message and assistant reply to history
      historyManager.addMessage(message.from, { role: 'user', content: message.body });
      historyManager.addMessage(message.from, { role: 'assistant', content: aiReply });
    }

    return {
      success: true,
      reply: aiReply
    };

  } catch (aiError) {
    console.error('❌ AI Error:', aiError.message);
    return {
      success: false,
      error: aiError.message
    };
  }
}

/**
 * Get Gemini client instance
 */
function getClient() {
  return ai;
}

module.exports = {
  initialize,
  processMessage,
  getClient
};
