// Configuration file for PizzaBot - Pizza Hut Sri Lanka WhatsApp Ordering Bot

const getSystemPrompt = require("./prompts/system-prompt");

module.exports = {
	// Pizza Hut Business Settings
	businessInfo: {
		name: "Pizza Hut Sri Lanka",
		operatingHours: "10:00 AM - 11:00 PM",
		operatingDays: "Daily",
		timezone: "Asia/Colombo",
	},

	// AI Agent settings (OpenAI)
	aiBot: {
		enabled: true,
		model: "gpt-4o",

		systemPrompt: getSystemPrompt(),

		fallbackToDefault: true,

		// Chat Memory Settings
		memory: {
			enabled: true,
			limit: 30,
		},
	},

	// Automatic message sending settings (disabled)
	autoSend: {
		enabled: false,
		messages: [],
	},

	// Auto-reply settings
	autoReply: {
		enabled: true,
		keywords: {},
		defaultReply:
			"Welcome to Pizza Hut Sri Lanka! 🍕 I'm PizzaBot, your AI ordering assistant. Type anything to get started!",
		useDefaultReply: true,
	},

	// Bot behavior settings
	bot: {
		ignoreGroups: false,
		ignoreBroadcast: true,
		ignoreOwnMessages: true,
		logMessages: true,
	},

	// Voice Transcription Settings (OpenAI Whisper)
	voiceTranscription: {
		enabled: true,
		model: 'whisper-1',
		language: undefined,
		tempDir: './temp_audio'
	},

	// WhatsApp client settings
	client: {
		puppeteerArgs: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-accelerated-2d-canvas",
			"--no-first-run",
			"--no-zygote",
			"--disable-gpu",
			'--single-process',
			'--disable-crashpad'
		],
		sessionPath: "./.wwebjs_auth",
		executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
	},
};
