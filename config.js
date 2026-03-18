// Configuration file for BuildStart AI - WhatsApp Business Assistant
const getSystemPrompt = require("./prompts/system-prompt");

module.exports = {
	// Business Settings
	businessInfo: {
		name: "Ayubowan.dev",
		operatingHours: "24/7",
		operatingDays: "Daily",
		timezone: "Asia/Colombo",
	},

	// AI Agent settings (Gemini)
	aiBot: {
		enabled: true,
		model: "gemini-2.5-flash",

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
			"ආයුබෝවන් 🙏 මම Ayubowan.dev. ඔබේ business එකට WhatsApp එක හරහා 24/7 customer inquiries handle කරගන්න මම මෙතන ඉන්නවා. Type anything to start! 😊",
		useDefaultReply: true,
	},

	// Bot behavior settings
	bot: {
		ignoreGroups: false,
		ignoreBroadcast: true,
		ignoreOwnMessages: true,
		logMessages: true,
	},

	// Voice Transcription Settings (Gemini)
	voiceTranscription: {
		enabled: true,
		model: 'gemini-2.5-flash',
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
