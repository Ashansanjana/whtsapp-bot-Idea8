/**
 * Voice Service - Handles voice message transcription using Gemini
 */

let aiClient;

/**
 * Initialize voice service with Gemini client
 */
function initialize(ai) {
    aiClient = ai;
}

/**
 * Transcribe voice message to text using Gemini
 */
async function transcribeVoiceMessage(message, config) {
    if (!aiClient) {
        throw new Error('Voice service not initialized. Gemini client is required.');
    }

    try {
        // Download the audio
        console.log('🎤 Downloading voice message...');
        const media = await message.downloadMedia();

        if (!media) {
            throw new Error('Failed to download voice message');
        }

        console.log('🔄 Transcribing audio with Gemini...');

        // Gemini supports inlineData with base64 encoded media
        const response = await aiClient.models.generateContent({
            model: config.voiceTranscription?.model || 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                data: media.data,
                                mimeType: media.mimetype
                            }
                        },
                        { text: 'Please transcribe the speech in this audio exactly as it is without adding commentary.' }
                    ]
                }
            ]
        });

        const transcription = response.text || '';

        console.log(`✅ Transcription: "${transcription}"`);

        return {
            success: true,
            text: transcription,
            duration: media.filesize || 0
        };

    } catch (error) {
        console.error('❌ Error transcribing voice message:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Check if message is a voice/audio message
 */
function isVoiceMessage(message) {
    return message.hasMedia && (message.type === 'ptt' || message.type === 'audio');
}

/**
 * Get audio file extension from mimetype
 */
function getAudioExtension(mimetype) {
    const mimeMap = {
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/x-wav': 'wav',
        'audio/aac': 'aac',
        'audio/mp4': 'mp4',
        'audio/x-m4a': 'm4a'
    };

    return mimeMap[mimetype] || 'ogg'; // Default to ogg for WhatsApp PTT
}

/**
 * Check if message is a voice/audio message
 */
function isVoiceMessage(message) {
    return message.hasMedia && (message.type === 'ptt' || message.type === 'audio');
}

module.exports = {
    initialize,
    transcribeVoiceMessage,
    isVoiceMessage
};
