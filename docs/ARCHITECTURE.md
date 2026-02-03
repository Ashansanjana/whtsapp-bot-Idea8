# WhatsApp Bot Architecture

## Overview

This WhatsApp bot is built using a modular architecture following SOLID principles for better maintainability, testability, and scalability.

## Project Structure

```
wbot-test/
├── index.js                    # Main entry point (orchestrator)
├── config.js                   # Configuration management
├── history.js                  # Chat history manager
├── src/
│   ├── services/              # Business logic services
│   │   ├── whatsapp.js       # WhatsApp client management
│   │   ├── openai.js         # AI bot logic & tool calling
│   │   ├── booking.js        # Booking API integration
│   │   └── express.js        # Web API server
│   └── utils/                 # Utility functions
│       └── helpers.js        # Helper functions
├── prompts/
│   └── system-prompt.js      # AI system prompt
└── public/                    # Web interface assets
```

## Module Responsibilities

### index.js (Main Entry Point)
- **Size**: ~43 lines (reduced from 1278 lines)
- **Purpose**: Application orchestration and initialization
- **Responsibilities**:
  - Load environment variables
  - Initialize all services
  - Setup graceful shutdown handlers
  - Start the application

### src/services/whatsapp.js
- **Purpose**: WhatsApp client lifecycle management
- **Responsibilities**:
  - Client initialization with Puppeteer config
  - Session management and recovery
  - Event handlers (QR, auth, ready, disconnect)
  - Message routing and processing
  - Auto-send scheduled messages
  - Group message handling

### src/services/openai.js
- **Purpose**: AI conversation management
- **Responsibilities**:
  - OpenAI API integration
  - Tool/function calling (booking, pricing, etc.)
  - Conversation history management
  - Tool execution orchestration
  - Multi-turn conversation loops

### src/services/booking.js
- **Purpose**: Booking system integration
- **Responsibilities**:
  - Send booking to webhook API
  - Verify booking IDs
  - Update existing bookings
  - Price calculations
  - Data formatting for API

### src/services/express.js
- **Purpose**: Web interface server
- **Responsibilities**:
  - Express server initialization
  - REST API endpoints (health, status, bulk-send)
  - Excel file upload & parsing
  - Bulk WhatsApp messaging
  - CORS and security middleware

### src/utils/helpers.js
- **Purpose**: Utility functions
- **Responsibilities**:
  - Generate booking IDs
  - Determine package types
  - Format conversation transcripts
  - Other reusable utilities

## Design Patterns & Principles

### 1. **Single Responsibility Principle (SRP)**
Each module has one clear purpose:
- WhatsApp service → Client management
- OpenAI service → AI logic
- Booking service → API integration
- Express service → Web server

### 2. **Dependency Injection**
Services receive their dependencies as parameters:
```javascript
// Instead of requiring config internally
function sendBookingWebhook(bookingData, customerInfo, messages, config)

// Dependencies are passed from index.js
expressService.initializeServer(whatsappService, config);
```

### 3. **Separation of Concerns**
- **Presentation**: Express API routes
- **Business Logic**: Services (whatsapp, openai, booking)
- **Data**: Config, history manager
- **Utilities**: Helpers

### 4. **Module Pattern**
Each service exports only public functions:
```javascript
module.exports = {
  initializeClient,
  sendMessage,
  getStatus
  // Internal functions remain private
};
```

## Data Flow

### Incoming Message Flow
```
WhatsApp Message
    ↓
whatsapp.js (handleMessage)
    ↓
openai.js (processMessage)
    ↓
Tool Execution → booking.js
    ↓
Response to User
```

### Booking Flow
```
User Message
    ↓
OpenAI Tool Call
    ↓
booking.js (sendBookingWebhook)
    ↓
External API
    ↓
Response to User
```

### Bulk Message Flow
```
Web Interface Upload
    ↓
express.js (/api/upload-excel)
    ↓
Parse Excel → Extract Numbers
    ↓
express.js (/api/send-bulk)
    ↓
whatsapp.js (sendMessage)
    ↓
WhatsApp Messages Sent
```

## Benefits of This Architecture

### Maintainability
- **Small, focused files**: Each service is 200-300 lines instead of 1278
- **Clear boundaries**: Easy to locate and fix bugs
- **Independent testing**: Each module can be tested in isolation

### Scalability
- **Easy to add features**: Add new services without touching existing code
- **Plugin architecture**: New tools can be added to OpenAI service
- **Horizontal scaling**: Services can be moved to microservices

### Readability
- **Self-documenting**: File names clearly indicate purpose
- **Consistent structure**: All services follow the same pattern
- **Reduced complexity**: Main index.js is now trivial to understand

## Migration Notes

### Before Refactoring
- **index.js**: 1278 lines, 5+ responsibilities
- **Coupling**: All logic tightly coupled
- **Testing**: Nearly impossible to unit test
- **Maintenance**: Changes affect unrelated code

### After Refactoring
- **index.js**: 43 lines, single responsibility (orchestration)
- **Coupling**: Loose coupling via dependency injection
- **Testing**: Each service can be tested independently
- **Maintenance**: Changes are isolated to relevant modules

## Future Improvements

### Potential Enhancements
1. **TypeScript Migration**: Add type safety
2. **Dependency Injection Container**: Use inversify or awilix
3. **Event Bus**: Decouple services with events
4. **Configuration Validation**: Add Joi/Zod schemas
5. **Error Handling Middleware**: Centralized error handling
6. **Logging Service**: Structured logging with Winston/Pino
7. **Testing**: Add unit and integration tests
8. **Docker Multi-Stage**: Optimize container size
9. **Health Checks**: Add liveness and readiness probes
10. **Metrics**: Add Prometheus metrics

## Development Workflow

### Adding a New Feature
1. Identify which service owns the feature
2. Add logic to that service module
3. Expose via module.exports if needed by other services
4. Update index.js only if new service initialization required

### Debugging
1. Identify the affected service from error logs
2. Review only that service's code
3. Check dependencies passed to that service
4. Test service in isolation if possible

### Testing Strategy
```javascript
// Example: Testing booking service
const bookingService = require('./src/services/booking');
const mockConfig = { /* test config */ };

test('sendBookingWebhook validates vehicle type', async () => {
  const result = await bookingService.sendBookingWebhook(
    { vehicleType: 'invalid' },
    {},
    [],
    mockConfig
  );
  expect(result.success).toBe(false);
});
```

## Security Considerations

### API Keys
- Stored in `.env` file (never committed)
- Passed via environment variables
- Not exposed in logs or responses

### Session Management
- WhatsApp session stored in `.wwebjs_auth/`
- Added to `.gitignore`
- Auto-recovery on corruption

### Input Validation
- Phone numbers sanitized before use
- Excel uploads validated for type
- Message content length checked

### Rate Limiting
- Random delays between bulk messages (3-7 seconds)
- Prevents WhatsApp spam detection
- Configurable in future

## Performance Optimization

### Current Optimizations
1. **Message deduplication**: Set-based cache with hourly cleanup
2. **Conversation history**: Limited to last 15 messages
3. **Async operations**: All I/O operations are non-blocking
4. **Connection pooling**: Single WhatsApp client reused

### Future Optimizations
1. **Redis for state**: Move session/history to Redis
2. **Queue system**: Use Bull for background jobs
3. **Caching layer**: Add response caching
4. **Load balancing**: Distribute across multiple instances
