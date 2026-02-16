/**
 * OpenAI Service - Handles AI bot logic, tool calling, and conversation management
 */

const OpenAI = require('openai');
const bookingService = require('./booking');

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
 * Build OpenAI tools definitions based on config
 */
function buildTools(config) {
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

  return [
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
    },
    {
      type: "function",
      function: {
        name: "get_service_list",
        description: "Get all available services with correct prices for a specific vehicle type. Always call this before showing prices to the customer. Returns services organized by brand (Standard and AutoGlym).",
        parameters: {
          type: "object",
          properties: {
            vehicle_type: {
              type: "string",
              enum: Object.keys(config.vehicleTypes),
              description: "The vehicle type ID (car_minivan, crossover, suv, or van)"
            }
          },
          required: ["vehicle_type"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_service_price",
        description: "Get the exact price of a single service for a specific vehicle type. Use this when user asks about a specific service price.",
        parameters: {
          type: "object",
          properties: {
            service_id: {
              type: "string",
              enum: allServiceIds,
              description: "The service ID (e.g., 'wash_vacuum', 'leather_treatment_autoglym')"
            },
            vehicle_type: {
              type: "string",
              enum: Object.keys(config.vehicleTypes),
              description: "The vehicle type ID (car_minivan, crossover, suv, or van)"
            }
          },
          required: ["service_id", "vehicle_type"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "calculate_booking_total",
        description: "Calculate the total price for one or more selected services for a specific vehicle type. Returns each service with its price and the total sum. ALWAYS use this tool instead of calculating prices manually.",
        parameters: {
          type: "object",
          properties: {
            service_ids: {
              type: "array",
              items: {
                type: "string",
                enum: allServiceIds
              },
              description: "Array of service IDs selected by the customer"
            },
            vehicle_type: {
              type: "string",
              enum: Object.keys(config.vehicleTypes),
              description: "The vehicle type ID (car_minivan, crossover, suv, or van)"
            }
          },
          required: ["service_ids", "vehicle_type"]
        }
      }
    }
  ];
}

/**
 * Execute a tool call
 */
async function executeTool(fnName, args, customerInfo, messages, config) {
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

    const result = await bookingService.sendBookingWebhook(bookingData, customerInfo, messages, config);
    return result.success ? result.message : result.message;
  }

  else if (fnName === 'verify_booking') {
    const result = await bookingService.verifyBookingId(args.booking_id, config);
    return result.message;
  }

  else if (fnName === 'update_appointment') {
    const updates = {};
    if (args.preferred_date) updates.preferred_date = args.preferred_date;
    if (args.preferred_time) updates.preferred_time = args.preferred_time;
    if (args.service_address) updates.service_address = args.service_address;
    if (args.vehicle_number) updates.vehicle_number = args.vehicle_number;
    if (args.email) updates.email = args.email;

    const result = await bookingService.updateBooking(args.booking_id, updates, config);
    return result.message;
  }

  else if (fnName === 'get_service_list') {
    const vehicleTypeObj = config.vehicleTypes[args.vehicle_type];
    if (!vehicleTypeObj) {
      return JSON.stringify({ error: `Invalid vehicle type: ${args.vehicle_type}` });
    }

    const vehicleKey = vehicleTypeObj.key;
    const standardServices = config.packages.Standard.map((s, i) => ({
      index: i + 1,
      id: s.id,
      name: s.name,
      price: s.prices[vehicleKey],
      brand: 'Standard'
    }));
    const autoglymServices = config.packages.AutoGlym.map((s, i) => ({
      index: i + 10,
      id: s.id,
      name: s.name,
      price: s.prices[vehicleKey],
      brand: 'AutoGlym'
    }));
    return JSON.stringify({
      vehicle_type: vehicleTypeObj.display,
      vehicle_key: vehicleKey,
      standard_services: standardServices,
      autoglym_services: autoglymServices
    });
  }

  else if (fnName === 'get_service_price') {
    const vehicleTypeObj = config.vehicleTypes[args.vehicle_type];
    if (!vehicleTypeObj) {
      return JSON.stringify({ error: `Invalid vehicle type: ${args.vehicle_type}` });
    }

    const service = config.getServiceById(args.service_id);
    if (!service) {
      return JSON.stringify({ error: `Service not found: ${args.service_id}` });
    }

    const vehicleKey = vehicleTypeObj.key;
    return JSON.stringify({
      service_id: service.id,
      service_name: service.name,
      vehicle_type: vehicleTypeObj.display,
      price: service.prices[vehicleKey]
    });
  }

  else if (fnName === 'calculate_booking_total') {
    const vehicleTypeObj = config.vehicleTypes[args.vehicle_type];
    if (!vehicleTypeObj) {
      return JSON.stringify({ error: `Invalid vehicle type: ${args.vehicle_type}` });
    }

    const vehicleKey = vehicleTypeObj.key;
    const services = [];
    let total = 0;
    for (const serviceId of args.service_ids) {
      const service = config.getServiceById(serviceId);
      if (service) {
        const price = service.prices[vehicleKey];
        services.push({ id: service.id, name: service.name, price: price });
        total += price;
      } else {
        services.push({ id: serviceId, name: 'Unknown', price: 0, error: 'Service not found' });
      }
    }
    return JSON.stringify({
      vehicle_type: vehicleTypeObj.display,
      services: services,
      total: total
    });
  }

  return "Unknown tool";
}

/**
 * Process AI bot message
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

IMPORTANT: Use this current date/time to validate that booking dates and times are NOT in the past.

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

    // Build tools
    const tools = buildTools(config);

    // AI response loop
    let loopCount = 0;
    const MAX_LOOPS = 5;
    let finalReplySent = false;
    let aiReply = null;

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

      // Handle tool calls
      if (responseMessage.tool_calls) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          const fnName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          const toolResult = await executeTool(fnName, args, customerInfo, messages, config);

          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: fnName,
            content: toolResult,
          });
        }
      } else {
        // Final response from AI
        aiReply = responseMessage.content;
        if (aiReply) {
          messages.push({ role: "assistant", content: aiReply });
        }
        finalReplySent = true;
      }
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
