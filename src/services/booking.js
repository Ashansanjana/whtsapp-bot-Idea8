/**
 * Booking Service - Handles webhook integration and booking API operations
 */

const { generateBookingId, getPackageType, formatTranscript } = require('../utils/helpers');

/**
 * Send booking to webhook API
 */
async function sendBookingWebhook(bookingData, customerInfo, conversationHistory, config) {
  try {
    const {
      serviceIds,
      vehicleType,
      startDateTime,
      customerName,
      phoneNumber,
      email,
      vehicleNumber,
      serviceAddress
    } = bookingData;

    const serviceArray = Array.isArray(serviceIds) ? serviceIds : [serviceIds];

    if (!config.vehicleTypes[vehicleType]) {
      return { success: false, message: `Error: Invalid vehicle type '${vehicleType}'.` };
    }

    const vehicleTypeObj = config.vehicleTypes[vehicleType];
    const vehicleTypeName = vehicleTypeObj.display || vehicleTypeObj;
    const vehicleKey = vehicleTypeObj.key || vehicleType;
    const vehicleTypeId = vehicleType;

    let totalPrice = 0;
    const serviceNames = [];

    for (const serviceId of serviceArray) {
      const service = config.getServiceById ? config.getServiceById(serviceId) : null;

      if (!service) {
        return { success: false, message: `Error: Service '${serviceId}' not found.` };
      }

      const price = service.prices[vehicleKey];
      if (price === undefined) {
        return { success: false, message: `Error: No price found for ${service.name} with vehicle type ${vehicleTypeName}.` };
      }

      totalPrice += price;
      serviceNames.push(service.name);
    }

    let preferredDate, preferredTime;

    if (startDateTime.includes('T')) {
      const dt = new Date(startDateTime);
      preferredDate = dt.toISOString().split('T')[0];
      const hours = dt.getHours().toString().padStart(2, '0');
      const minutes = dt.getMinutes().toString().padStart(2, '0');
      preferredTime = `${hours}:${minutes}`;
    } else {
      preferredDate = startDateTime.split(' ')[0] || startDateTime;
      preferredTime = startDateTime.split(' ')[1] || '10:00';
    }

    const bookingId = generateBookingId();
    const primaryServiceName = serviceNames[0];
    const packageType = getPackageType(serviceArray[0], config);
    const serviceIdString = serviceArray.join(',');
    const finalCustomerName = customerName || 'Customer';
    const customerPhone = phoneNumber || 'Not provided';
    const transcript = conversationHistory ? formatTranscript(conversationHistory) : 'WhatsApp booking conversation';

    const payload = {
      name: finalCustomerName,
      phone: customerPhone,
      email: email || '',
      bookingDetails: {
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        service_name: primaryServiceName,
        service_id: serviceIdString,
        package_type: packageType,
        vehicle_type: vehicleTypeId,
        vehicle_number: vehicleNumber || '',
        service_address: serviceAddress || '',
        total_price: totalPrice
      },
      bookingId: bookingId,
      transcript: transcript
    };

    console.log('📤 Sending booking to webhook:', JSON.stringify(payload, null, 2));

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(config.aiBot.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.aiBot.webhook.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Webhook Error:', response.status, errorText);
      return {
        success: false,
        message: `Error: Webhook returned ${response.status}. ${errorText}`
      };
    }

    const result = await response.json();
    console.log('✅ Webhook Response:', result);

    const serviceList = serviceNames.join(', ');
    return {
      success: true,
      message: `✅ Booking confirmed successfully!\n\n📋 Booking ID: ${bookingId}\n👤 Customer: ${finalCustomerName}\n📞 Phone: ${customerPhone}\n📧 Email: ${email}\n🚗 Vehicle: ${vehicleTypeName} (${vehicleNumber})\n🛠️ Services: ${serviceList}\n📦 Package: ${packageType}\n📍 Address: ${serviceAddress}\n📅 Date: ${preferredDate}\n⏰ Time: ${preferredTime}\n💰 Total: Rs. ${totalPrice.toLocaleString()}\n\nYour booking has been sent to our system. We'll contact you shortly for confirmation!`,
      bookingId: bookingId
    };

  } catch (error) {
    console.error('❌ Webhook Booking Error:', error);
    return {
      success: false,
      message: `Error sending booking: ${error.message}`
    };
  }
}

/**
 * Verify booking ID via GET API
 */
async function verifyBookingId(bookingId, config) {
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `${config.aiBot.bookingApi.getEndpoint}/${bookingId}`;

    console.log(`🔍 Verifying booking ID: ${bookingId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': config.aiBot.bookingApi.apiKey
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          message: `❌ Booking ID "${bookingId}" not found. Please check and try again.`
        };
      }
      const errorText = await response.text();
      return {
        success: false,
        message: `❌ Error verifying booking: ${response.status}. ${errorText}`
      };
    }

    const bookingData = await response.json();
    console.log('✅ Booking verified:', bookingData);

    const customerName = bookingData.name || bookingData.customer_name || bookingData.customerName || 'Valued Customer';

    return {
      success: true,
      message: `✅ Hello ${customerName}! Your booking has been verified.\n\n📋 Booking ID: ${bookingId}`,
      bookingData: bookingData,
      customerName: customerName
    };

  } catch (error) {
    console.error('❌ Booking Verification Error:', error);
    return {
      success: false,
      message: `Error verifying booking: ${error.message}`
    };
  }
}

/**
 * Update booking via PATCH API
 */
async function updateBooking(bookingId, updates, config) {
  try {
    const fetch = (await import('node-fetch')).default;

    console.log('🔍 Incoming updates object:', JSON.stringify(updates, null, 2));

    console.log('📥 Fetching existing booking data...');
    const verifyResult = await verifyBookingId(bookingId, config);

    if (!verifyResult.success) {
      return {
        success: false,
        message: `Cannot update: ${verifyResult.message}`
      };
    }

    const existingDetails = verifyResult.bookingData?.details || {};
    console.log('📋 Existing details:', JSON.stringify(existingDetails, null, 2));

    const mergedDetails = {
      ...existingDetails,
      ...updates
    };

    console.log('🔀 Merged details:', JSON.stringify(mergedDetails, null, 2));

    const payload = {
      bookingId: bookingId,
      bookingDetails: mergedDetails,
      transcript: "Booking updated via WhatsApp Bot"
    };

    console.log('📤 Full PATCH payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(config.aiBot.bookingApi.patchEndpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.aiBot.bookingApi.apiKey
      },
      body: JSON.stringify(payload)
    });

    console.log('📡 API Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Update Error:', response.status, errorText);
      return {
        success: false,
        message: `❌ Failed to update booking: ${response.status}. ${errorText}`
      };
    }

    const result = await response.json();
    console.log('✅ API Response Body:', JSON.stringify(result, null, 2));

    let updatesList = [];
    if (updates.preferred_date || updates.preferred_time) {
      updatesList.push(`📅 Date & Time: ${updates.preferred_date || 'unchanged'} ${updates.preferred_time || ''}`);
    }
    if (updates.service_address) {
      updatesList.push(`📍 Service Address: ${updates.service_address}`);
    }
    if (updates.vehicle_number) {
      updatesList.push(`🚗 Vehicle Number: ${updates.vehicle_number}`);
    }
    if (updates.email) {
      updatesList.push(`📧 Email: ${updates.email}`);
    }

    return {
      success: true,
      message: `✅ Booking updated successfully!\n\n📋 Booking ID: ${bookingId}\n${updatesList.join('\n')}\n\nYour changes have been saved.`
    };

  } catch (error) {
    console.error('❌ Booking Update Error:', error);
    return {
      success: false,
      message: `Error updating booking: ${error.message}`
    };
  }
}

module.exports = {
  sendBookingWebhook,
  verifyBookingId,
  updateBooking
};
