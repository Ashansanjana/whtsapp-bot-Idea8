/**
 * Express API Service - Web interface server for bulk messaging
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const logger = require('../utils/logger');

const upload = multer({ storage: multer.memoryStorage() });

let app;
let whatsappService;

/**
 * Initialize Express server
 */
function initializeServer(whatsappSvc, config) {
  whatsappService = whatsappSvc;

  app = express();
  const API_PORT = process.env.API_PORT || 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.static('public'));

  setupRoutes();

  app.listen(API_PORT, () => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 Web Interface Server Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Server: http://localhost:${API_PORT}`);
    console.log(`📋 Web UI: http://localhost:${API_PORT}`);
    console.log(`🔌 API: http://localhost:${API_PORT}/api/send-bulk`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });

  return app;
}

/**
 * Setup API routes
 */
function setupRoutes() {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
      status: 'ok',
      whatsappReady: status.ready,
      connectedAs: status.info,
      reconnectAttempts: status.reconnectAttempts
    });
  });

  // Status endpoint
  app.get('/api/status', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
      ready: status.ready,
      info: status.info
    });
  });

  // Get logs endpoint
  app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json({
      success: true,
      logs: logger.getLogs(limit)
    });
  });

  // Get QR code endpoint
  app.get('/api/qr', (req, res) => {
    const qr = logger.getQRCode();
    if (qr) {
      res.json({
        success: true,
        qr: qr
      });
    } else {
      res.json({
        success: false,
        message: 'No QR code available'
      });
    }
  });

  // Server-Sent Events for real-time logs
  app.get('/api/logs/stream', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial logs
    const initialLogs = logger.getLogs(50);
    res.write(`data: ${JSON.stringify({ type: 'initial', logs: initialLogs })}\n\n`);

    // Listen for new logs
    const removeListener = logger.addListener((logEntry) => {
      res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    });

    // Clean up on close
    req.on('close', () => {
      removeListener();
    });
  });

  // Excel upload endpoint
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

          // Skip header row
          if (i === 0 && /phone|number|contact|mobile/i.test(phone)) {
            continue;
          }

          // Clean phone number
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

  // Bulk send endpoint
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

      const status = whatsappService.getStatus();
      if (!status.ready) {
        return res.status(503).json({
          success: false,
          error: 'WhatsApp client is not ready. Please wait and try again.'
        });
      }

      console.log(`📤 Bulk send request: ${phoneNumbers.length} recipients`);

      const results = [];
      const client = whatsappService.getClient();

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

        // Random delay between messages to avoid spam detection
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
}

module.exports = {
  initializeServer
};
