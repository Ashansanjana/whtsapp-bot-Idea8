# 🚀 How to Use the WhatsApp Bulk Message Sender

## Quick Start

### 1. Start the Bot

```bash
node index.js
```

This will:
- ✅ Start the WhatsApp client (AI chatbot)
- ✅ Start the web server on port 3000
- ✅ Display QR code (if not already authenticated)

### 2. Open Web Interface

Open your browser and go to:
```
http://localhost:3000
```

### 3. Send Bulk Messages

1. **Enter phone numbers** (one per line, with country code):
   ```
   94775986195
   94750329795
   94712345678
   ```

2. **Type your message**

3. **Click "Send Messages"**

4. **View results** - See which messages were sent successfully

## 📱 Phone Number Format

✅ **Correct:** `94775986195` (country code + number, no + sign)

❌ **Wrong:** `+94775986195` or `0775986195`

## 🎯 Features

- 🌐 **Web Interface** - Easy-to-use form
- 📊 **Real-time Results** - See success/failure for each number
- 🔄 **Concurrent Sending** - Fast bulk message delivery
- 🤖 **AI Chatbot** - Continues working alongside bulk sender
- 📱 **Single Session** - One WhatsApp connection for everything

## ⚠️ Important Notes

- The web interface runs on the **same** WhatsApp session as your AI chatbot
- You can use **both** the AI chatbot AND the bulk sender simultaneously
- Just start `node index.js` - no need to run multiple servers

## 🐛 Troubleshooting

**Problem:** Can't access http://localhost:3000

**Solution:** Make sure `index.js` is running. Check the console for the "Web Interface Server" message.

**Problem:** "WhatsApp client is not ready"

**Solution:** Wait for the WhatsApp client to connect (check console for "WhatsApp Bot is ready!")

**Problem:** Messages not sending

**Solution:** Verify phone numbers are in correct format and registered on WhatsApp

## 📝 Example Usage

### Sending to Multiple Numbers:
```
94775986195
94750329795
94712345678
94789012345
```

### Message Example:
```
Hello! This is a test message from the WhatsApp bulk sender.
```

## 🎉 That's It!

You now have a **fully integrated** system with:
- AI Chatbot for customer support
- Web interface for bulk messaging
- All running from one command: `node index.js`

Enjoy! 🚀
