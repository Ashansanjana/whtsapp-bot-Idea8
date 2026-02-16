/**
 * Voice Service - Handles voice message transcription using OpenAI Whisper
 */

const fs = require('fs');
const path = require('path');

let openaiClient;

/**
 * Initialize voice service with OpenAI client
 */
function initialize(openai) {
    openaiClient = openai;
}

/**
 * Ensure temp directory exists
 */
function ensureTempDir(tempDir) {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('📁 Created temp audio directory');
    }
}

/**
 * Transcribe voice message to text using OpenAI Whisper
 */
async function transcribeVoiceMessage(message, config) {
    if (!openaiClient) {
        throw new Error('Voice service not initialized. OpenAI client is required.');
    }

    const tempDir = config.voiceTranscription?.tempDir || './temp_audio';
    ensureTempDir(tempDir);

    let tempFilePath = null;

    try {
        // Download the audio
        console.log('🎤 Downloading voice message...');
        const media = await message.downloadMedia();

        if (!media) {
            throw new Error('Failed to download voice message');
        }

        // Determine file extension based on mimetype
        const extension = getAudioExtension(media.mimetype);
        const timestamp = Date.now();
        tempFilePath = path.join(tempDir, `voice_${timestamp}.${extension}`);

        // Save to temporary file
        const buffer = Buffer.from(media.data, 'base64');
        fs.writeFileSync(tempFilePath, buffer);
        console.log(`💾 Saved audio to: ${tempFilePath}`);

        // Transcribe using OpenAI Whisper
        console.log('🔄 Transcribing audio...');
        const transcription = await openaiClient.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: config.voiceTranscription?.model || 'whisper-1',
            language: config.voiceTranscription?.language || undefined, // auto-detect if not specified
        });

        console.log(`✅ Transcription: "${transcription.text}"`);

        return {
            success: true,
            text: transcription.text,
            duration: media.filesize || 0
        };

    } catch (error) {
        console.error('❌ Error transcribing voice message:', error.message);
        return {
            success: false,
            error: error.message
        };
    } finally {
        // Clean up temporary file
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ Cleaned up temp audio file');
            } catch (cleanupError) {
                console.error('⚠️ Failed to cleanup temp file:', cleanupError.message);
            }
        }
    }
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
