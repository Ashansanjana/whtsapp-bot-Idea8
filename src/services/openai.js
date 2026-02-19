/**
 * OpenAI Service - Handles AI bot logic and conversation management for PizzaBot
 */

const OpenAI = require('openai');

let openai;
let historyManager;

/**
 * Initialize OpenAI client and history manager
 */
function initialize(apiKey, historyMgr) {
  openai = new OpenAI({ apiKey });
  historyManager = historyMgr;
}

/**
 * Process AI bot message (no tool calls — pure conversational AI)
 */
async function processMessage(message, customerInfo, config) {
  try {
    console.log('🤖 AI processing message... (OpenAI)');

    let messages = [];

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

    messages.push({ role: "system", content: systemPromptWithDate });

    // Add conversation history
    if (historyManager) {
      messages = messages.concat(conversationHistory);
    }

    // Add current user message
    const userMessage = { role: "user", content: message.body };
    messages.push(userMessage);

    // Call OpenAI (no tools — pure conversational)
    let response;
    try {
      response = await openai.chat.completions.create({
        model: config.aiBot.model,
        messages: messages,
      });
    } catch (err) {
      console.error('❌ OpenAI API Error:', err.message);
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

    const aiReply = responseMessage.content;

    if (aiReply) {
      messages.push({ role: "assistant", content: aiReply });
    }

    // Update history
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
 * Get OpenAI client instance
 */
function getClient() {
  return openai;
}

module.exports = {
  initialize,
  processMessage,
  getClient
};
