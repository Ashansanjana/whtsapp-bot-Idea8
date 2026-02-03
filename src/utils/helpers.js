/**
 * Helper utility functions for the WhatsApp bot
 */

/**
 * Generate a unique booking ID
 * Format: BK-WA-YYYYMMDD-XXX
 */
function generateBookingId() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `BK-WA-${dateStr}-${randomNum}`;
}

/**
 * Determine package type from service category
 */
function getPackageType(serviceId, config) {
  const service = config.services ? config.services[serviceId] : null;
  if (!service) return 'Standard';

  const categoryMap = {
    'standard': 'Standard',
    'autoglym': 'Premium',
    'additional': 'Additional'
  };

  return categoryMap[service.category] || 'Standard';
}

/**
 * Format conversation transcript for display
 */
function formatTranscript(messages) {
  return messages
    .filter(msg => msg.role !== 'system' && msg.role !== 'tool')
    .map(msg => {
      if (msg.role === 'user') return `User: ${msg.content}`;
      if (msg.role === 'assistant') return `Bot: ${msg.content}`;
      return '';
    })
    .filter(line => line)
    .join('\n');
}

module.exports = {
  generateBookingId,
  getPackageType,
  formatTranscript
};
