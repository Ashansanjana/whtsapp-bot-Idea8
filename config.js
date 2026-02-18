// Configuration file for WhatsApp Bot - Car Wash System
// CORRECTED VERSION - Fixed service selection, pricing, and validation issues

const getSystemPrompt = require("./prompts/system-prompt");

module.exports = {
	// Car Wash Business Settings
	businessInfo: {
		name: "Premium Car Wash",
		operatingHours: "8:00 AM - 6:00 PM",
		operatingDays: "Daily",
		timezone: "Asia/Colombo",
		appointmentDuration: 60, // minutes (1 hour per booking)
	},

	// Vehicle Types Configuration
	vehicleTypes: {
		car_minivan: {
			id: "car_minivan",
			key: "carMiniVan",
			display: "Car/Mini Van",
			description: "Sedans, Hatchbacks, Mini Vans",
		},
		crossover: {
			id: "crossover",
			key: "crossover",
			display: "Crossover",
			description: "Compact SUVs, Crossovers",
		},
		suv: {
			id: "suv",
			key: "suv",
			display: "SUV",
			description: "Full-size SUVs, Jeeps",
		},
		van: {
			id: "van",
			key: "van",
			display: "Van",
			description: "Large Vans",
		},
	},

	// Service Brands/Categories
	brands: ["Standard", "AutoGlym"],

	// Complete Service Packages with Pricing
	packages: {
		// STANDARD PACKAGES
		Standard: [
			{
				id: "wash_vacuum",
				name: "Wash + Vacuum",
				category: "standard",
				duration: 60,
				prices: {
					carMiniVan: 2500,
					crossover: 2700,
					suv: 2800,
					van: 2800,
				},
			},
			{
				id: "wash_vacuum_meguiars",
				name: "Wash & Vacuum (Meguiar's PH balanced Shampoo for coated Vehicles)",
				category: "standard",
				duration: 60,
				prices: {
					carMiniVan: 2700,
					crossover: 2800,
					suv: 2900,
					van: 2900,
				},
			},
			{
				id: "wash_vacuum_wax",
				name: "Wash + Vacuum + Wax",
				category: "standard",
				duration: 60,
				prices: {
					carMiniVan: 3900,
					crossover: 4100,
					suv: 4500,
					van: 4500,
				},
			},
			{
				id: "wash_vacuum_machine_wax",
				name: "Wash + Vacuum + Machine Wax",
				category: "standard",
				duration: 60,
				prices: {
					carMiniVan: 4700,
					crossover: 4900,
					suv: 5300,
					van: 5300,
				},
			},
			{
				id: "leather_treatment",
				name: "Leather Treatment",
				category: "standard",
				duration: 60,
				prices: {
					carMiniVan: 3900,
					crossover: 4400,
					suv: 4900,
					van: 5900,
				},
			},
			{
				id: "water_spot_remover",
				name: "Water Spot Remover and Glass Polish",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 15000,
					crossover: 16500,
					suv: 18000,
					van: 18500,
				},
			},
			{
				id: "alloy_wheel_standard",
				name: "Alloy Wheel Detailing",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 2100,
					crossover: 2100,
					suv: 2100,
					van: 2100,
				},
			},
			{
				id: "engine_bay_clean",
				name: "Engine Bay Degrease & Clean",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 1600,
					crossover: 1600,
					suv: 1600,
					van: 1600,
				},
			},
			{
				id: "headlight_polish",
				name: "Headlight Polish",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 3000,
					crossover: 3000,
					suv: 3500,
					van: 3500,
				},
			},
		],

		// AUTOGLYM PREMIUM PACKAGES
		AutoGlym: [
			{
				id: "wash_vacuum_autoglym",
				name: "Wash + Vacuum (AutoGlym)",
				category: "autoglym",
				duration: 60,
				prices: {
					carMiniVan: 2800,
					crossover: 3000,
					suv: 3100,
					van: 3100,
				},
			},
			{
				id: "wash_vacuum_wax_autoglym",
				name: "Wash + Vacuum + Wax (AutoGlym)",
				category: "autoglym",
				duration: 60,
				prices: {
					carMiniVan: 4200,
					crossover: 4400,
					suv: 4800,
					van: 4800,
				},
			},
			{
				id: "wash_vacuum_machine_wax_autoglym",
				name: "Wash + Vacuum + Machine Wax (AutoGlym)",
				category: "autoglym",
				duration: 60,
				prices: {
					carMiniVan: 5000,
					crossover: 5200,
					suv: 5600,
					van: 5600,
				},
			},
			{
				id: "leather_treatment_autoglym",
				name: "Leather Treatment (AutoGlym)",
				category: "autoglym",
				duration: 60,
				prices: {
					carMiniVan: 4500,
					crossover: 5000,
					suv: 5500,
					van: 6500,
				},
			},
			{
				id: "water_spot_remover_autoglym",
				name: "Water Spot Remover and Glass Polish (AutoGlym)",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 15000,
					crossover: 16500,
					suv: 18000,
					van: 18500,
				},
			},
			{
				id: "alloy_wheel_autoglym",
				name: "Alloy Wheel Detailing (AutoGlym)",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 2800,
					crossover: 2800,
					suv: 2800,
					van: 2800,
				},
			},
			{
				id: "engine_bay_clean_autoglym",
				name: "Engine Bay Degrease and Clean (AutoGlym)",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 1600,
					crossover: 1600,
					suv: 1600,
					van: 1600,
				},
			},
			{
				id: "headlight_polish_autoglym",
				name: "Headlight Polish (AutoGlym)",
				category: "additional",
				duration: 60,
				prices: {
					carMiniVan: 3000,
					crossover: 3000,
					suv: 3500,
					van: 3500,
				},
			},
		],
	},

	// Helper function to get service price by vehicle type
	getServicePrice: function (serviceId, vehicleKey) {
		// Search in Standard packages
		let service = this.packages.Standard.find((s) => s.id === serviceId);

		// If not found, search in AutoGlym packages
		if (!service) {
			service = this.packages.AutoGlym.find((s) => s.id === serviceId);
		}

		if (service && service.prices[vehicleKey]) {
			return service.prices[vehicleKey];
		}

		return null;
	},

	// Helper function to get service by ID
	getServiceById: function (serviceId) {
		// Search in Standard packages
		let service = this.packages.Standard.find((s) => s.id === serviceId);

		// If not found, search in AutoGlym packages
		if (!service) {
			service = this.packages.AutoGlym.find((s) => s.id === serviceId);
		}

		return service || null;
	},

	// Helper function to get service by index and vehicle type
	getServiceByIndex: function (index, vehicleKey, brand = null) {
		const allServices = brand
			? this.packages[brand]
			: [...this.packages.Standard, ...this.packages.AutoGlym];

		if (index >= 1 && index <= allServices.length) {
			return allServices[index - 1];
		}

		return null;
	},

	// Helper function to calculate total price for multiple services
	calculateTotal: function (serviceIds, vehicleKey) {
		let total = 0;

		serviceIds.forEach((serviceId) => {
			const price = this.getServicePrice(serviceId, vehicleKey);
			if (price) {
				total += price;
			}
		});

		return total;
	},

	// Helper function to get all services for a specific vehicle type
	getServicesForVehicle: function (vehicleKey, brand = null) {
		const services = [];
		const packages = brand
			? [this.packages[brand]]
			: [this.packages.Standard, this.packages.AutoGlym];

		packages.forEach((packageList) => {
			packageList.forEach((service, index) => {
				services.push({
					index: services.length + 1,
					id: service.id,
					name: service.name,
					price: service.prices[vehicleKey],
					category: service.category,
					brand:
						packageList === this.packages.Standard
							? "Standard"
							: "AutoGlym",
				});
			});
		});

		return services;
	},

	// Auto-reply settings
	autoReply: {
		enabled: true,
		keywords: {},
		defaultReply:
			"Thanks for contacting our Car Wash! I'm WashBot, your AI assistant. I can help you with pricing and appointments.",
		useDefaultReply: true,
	},

	// AI Agent settings (OpenAI)
	aiBot: {
		enabled: true,
		model: "gpt-4o",

		// Webhook Integration for Booking
		webhook: {
			enabled: true,
			url: process.env.WEBHOOK_URL,
			apiKey: process.env.WEBHOOK_API_KEY,
		},

		// Booking API for Reschedule/Update
		bookingApi: {
			getEndpoint:
				"https://call-center.idea8.cloud/api/v1/tenant/public/booking",
			patchEndpoint:
				"https://call-center.idea8.cloud/api/v1/bookings/with-customer",
			apiKey: process.env.WEBHOOK_API_KEY,
		},

		systemPrompt: getSystemPrompt(),

		fallbackToDefault: true,

		// Chat Memory Settings
		memory: {
			enabled: true,
			limit: 30, // Increased for better context retention in complex booking conversations
		},
	},

	// Automatic message sending settings
	autoSend: {
		enabled: false,
		messages: [],
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
		enabled: true, // Enable/disable voice message transcription
		model: 'whisper-1', // Whisper model to use
		language: undefined, // Language code (e.g., 'en', 'si') or undefined for auto-detect
		tempDir: './temp_audio' // Temporary directory for audio files
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
		// Chrome/Chromium executable path (auto-detected from env in Docker)
		executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
	},
};
