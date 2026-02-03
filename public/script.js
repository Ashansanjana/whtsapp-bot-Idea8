// DOM Elements
const form = document.getElementById('bulkMessageForm');
const phoneNumbersTextarea = document.getElementById('phoneNumbers');
const messageTextarea = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
const statusElement = document.getElementById('status');
const numberCountElement = document.getElementById('numberCount');
const charCountElement = document.getElementById('charCount');
const resultsCard = document.getElementById('resultsCard');
const statsElement = document.getElementById('stats');
const resultsListElement = document.getElementById('resultsList');
const qrCard = document.getElementById('qrCard');
const qrContainer = document.getElementById('qrContainer');
const logsContainer = document.getElementById('logsContainer');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const autoScrollCheck = document.getElementById('autoScrollCheck');

// API Base URL
const API_BASE = window.location.origin;

// SSE for logs
let logsEventSource = null;

// Check WhatsApp status on load
async function checkStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        const data = await response.json();

        if (data.ready) {
            statusElement.classList.add('ready');
            statusElement.querySelector('.status-text').textContent =
                `Connected: ${data.info?.name || 'Ready'}`;
        } else {
            statusElement.classList.add('error');
            statusElement.querySelector('.status-text').textContent = 'Not Ready';
        }
    } catch (error) {
        statusElement.classList.add('error');
        statusElement.querySelector('.status-text').textContent = 'Connection Error';
    }
}

// Excel Upload Handling
const uploadBtn = document.getElementById('uploadBtn');
const excelFileInput = document.getElementById('excelFile');

// Trigger file picker when upload button is clicked
uploadBtn.addEventListener('click', () => {
    excelFileInput.click();
});

// Handle file selection
excelFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        alert('Please upload a valid Excel file (.xlsx or .xls)');
        excelFileInput.value = '';
        return;
    }

    // Show loading state
    uploadBtn.disabled = true;
    uploadBtn.querySelector('.btn-text').textContent = 'Uploading...';

    try {
        // Create FormData and append file
        const formData = new FormData();
        formData.append('file', file);

        // Upload to backend
        const response = await fetch(`${API_BASE}/api/upload-excel`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to upload file');
        }

        // Populate textarea with extracted numbers
        if (data.phoneNumbers && data.phoneNumbers.length > 0) {
            phoneNumbersTextarea.value = data.phoneNumbers.join('\n');

            // Trigger input event to update count
            phoneNumbersTextarea.dispatchEvent(new Event('input'));

            alert(`✅ Successfully extracted ${data.count} phone numbers!`);
        } else {
            alert('⚠️ No phone numbers found in the Excel file');
        }

    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Upload error:', error);
    } finally {
        // Reset button state
        uploadBtn.disabled = false;
        uploadBtn.querySelector('.btn-text').textContent = 'Upload Excel File';
        excelFileInput.value = '';
    }
});

// Update number count
phoneNumbersTextarea.addEventListener('input', () => {
    const numbers = phoneNumbersTextarea.value
        .split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

    numberCountElement.textContent = `${numbers.length} number${numbers.length !== 1 ? 's' : ''}`;
});

// Update character count
messageTextarea.addEventListener('input', () => {
    const count = messageTextarea.value.length;
    charCountElement.textContent = `${count} character${count !== 1 ? 's' : ''}`;
});

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form data
    const phoneNumbersInput = phoneNumbersTextarea.value;
    const message = messageTextarea.value.trim();

    // Parse phone numbers
    const phoneNumbers = phoneNumbersInput
        .split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

    // Validation
    if (phoneNumbers.length === 0) {
        alert('Please enter at least one phone number');
        return;
    }

    if (!message) {
        alert('Please enter a message');
        return;
    }

    // Disable form
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    sendBtn.querySelector('.btn-text').textContent = 'Sending';

    // Hide previous results
    resultsCard.style.display = 'none';

    try {
        // Send request
        const response = await fetch(`${API_BASE}/api/send-bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phoneNumbers,
                message
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send messages');
        }

        // Display results
        displayResults(data);

    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Send error:', error);
    } finally {
        // Re-enable form
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
        sendBtn.querySelector('.btn-text').textContent = 'Send Messages';
    }
});

// Display results
function displayResults(data) {
    // Show results card
    resultsCard.style.display = 'block';
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Display stats
    statsElement.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${data.summary.total}</div>
            <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
            <div class="stat-value success">${data.summary.successful}</div>
            <div class="stat-label">Successful</div>
        </div>
        <div class="stat-card">
            <div class="stat-value error">${data.summary.failed}</div>
            <div class="stat-label">Failed</div>
        </div>
    `;

    // Display individual results
    resultsListElement.innerHTML = data.results.map(result => {
        const statusClass = result.success ? 'success' : 'failed';
        const statusIcon = result.success ? '✅' : '❌';
        const statusText = result.success ? 'Sent' : 'Failed';

        return `
            <div class="result-item ${statusClass}">
                <span class="result-number">+${result.phoneNumber}</span>
                <span class="result-status ${statusClass}">
                    <span>${statusIcon}</span>
                    <span>${statusText}</span>
                </span>
            </div>
        `;
    }).join('');
}

// Log Management
function addLogToUI(logEntry) {
    const logElement = document.createElement('div');
    logElement.className = `log-entry ${logEntry.level || 'info'}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = new Date(logEntry.timestamp).toLocaleTimeString();

    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = logEntry.message;

    logElement.appendChild(timeSpan);
    logElement.appendChild(messageSpan);

    logsContainer.appendChild(logElement);

    // Auto-scroll if enabled
    if (autoScrollCheck.checked) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // Keep max 200 logs in DOM
    while (logsContainer.children.length > 200) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

function clearLogs() {
    logsContainer.textContent = '';
    const logElement = document.createElement('div');
    logElement.className = 'log-entry info';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = new Date().toLocaleTimeString();

    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = 'Logs cleared';

    logElement.appendChild(timeSpan);
    logElement.appendChild(messageSpan);
    logsContainer.appendChild(logElement);
}

// Connect to log stream
function connectLogStream() {
    if (logsEventSource) {
        logsEventSource.close();
    }

    logsEventSource = new EventSource(`${API_BASE}/api/logs/stream`);

    logsEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'initial') {
            // Clear and load initial logs
            logsContainer.textContent = '';
            data.logs.forEach(log => addLogToUI(log));
        } else if (data.type === 'clear') {
            clearLogs();
        } else if (data.type === 'qr') {
            // Handle QR code
            if (data.qr || data.qrImage) {
                showQRCode(data.qr, data.qrImage);
            } else {
                hideQRCode();
            }
        } else {
            // New log entry
            addLogToUI(data);
        }
    };

    logsEventSource.onerror = () => {
        console.error('Log stream connection error, retrying...');
        setTimeout(connectLogStream, 5000);
    };
}

// QR Code Management
async function checkQRCode() {
    try {
        const response = await fetch(`${API_BASE}/api/qr`);
        const data = await response.json();

        if (data.success && (data.qr || data.qrImage)) {
            showQRCode(data.qr, data.qrImage);
        } else {
            hideQRCode();
        }
    } catch (error) {
        console.error('Error checking QR code:', error);
    }
}

function showQRCode(qrText, qrImage) {
    // Clear previous QR code completely (remove all child elements)
    while (qrContainer.firstChild) {
        qrContainer.removeChild(qrContainer.firstChild);
    }

    try {
        // Prefer pre-rendered image from backend
        if (qrImage) {
            const img = document.createElement('img');
            img.src = qrImage;
            img.alt = 'QR Code';
            img.style.width = '256px';
            img.style.height = '256px';
            qrContainer.appendChild(img);
        }
        // Fallback to client-side generation if QRCode.js is available
        else if (qrText && typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: qrText,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
        // Last resort: show message
        else {
            const errorMsg = document.createElement('p');
            errorMsg.textContent = 'QR code available but cannot be displayed';
            errorMsg.style.color = '#737373';
            qrContainer.appendChild(errorMsg);
        }
    } catch (error) {
        // Error handling
        const errorMsg = document.createElement('p');
        errorMsg.textContent = 'Error displaying QR code. Please check console.';
        errorMsg.style.color = 'red';
        qrContainer.appendChild(errorMsg);
        console.error('QR Code display error:', error);
    }

    qrCard.style.display = 'block';
    qrCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideQRCode() {
    qrCard.style.display = 'none';
}

// Clear logs button
clearLogsBtn.addEventListener('click', clearLogs);

// Initialize
checkStatus();
connectLogStream();
checkQRCode();

// Refresh status and QR every 30 seconds
setInterval(checkStatus, 30000);
setInterval(checkQRCode, 10000);
