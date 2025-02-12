const apiUrl = 'https://analyzetext.info';
const API_TIMEOUT = 30000; // 30 seconds timeout
const MAX_TEXT_LENGTH = 50000; // Maximum characters to analyze
const RATE_LIMIT_RESET_TIME = 60000; // 1 minute
const MAX_RETRIES = 3;

// Track API calls for rate limiting
let apiCallsCount = 0;
let lastResetTime = Date.now();
let isOffline = false;

// Check online status
chrome.runtime.onStartup.addListener(checkOnlineStatus);
self.addEventListener('online', () => {
    isOffline = false;
    chrome.runtime.sendMessage({ type: 'ONLINE_STATUS_CHANGE', payload: true });
});
self.addEventListener('offline', () => {
    isOffline = true;
    chrome.runtime.sendMessage({ type: 'ONLINE_STATUS_CHANGE', payload: false });
});

function checkOnlineStatus() {
    isOffline = !navigator.onLine;
    return !isOffline;
}

// Input sanitization function
function sanitizeInput(text) {
    if (!text) return '';
    
    // Remove potential XSS attacks
    text = text.replace(/<[^>]*>/g, '');
    
    // Remove null characters and other potential harmful characters
    text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Trim whitespace and limit length
    text = text.trim().slice(0, MAX_TEXT_LENGTH);
    
    return text;
}

// Validate API response
function validateApiResponse(response) {
    const requiredFields = ['response'];
    const errors = [];

    if (!response) {
        errors.push('Empty response received');
        return { isValid: false, errors };
    }

    requiredFields.forEach(field => {
        if (!(field in response)) {
            errors.push(`Missing required field: ${field}`);
        }
    });

    if (typeof response.response !== 'string') {
        errors.push('Invalid response format');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

// Rate limiting check
function checkRateLimit() {
    const now = Date.now();
    if (now - lastResetTime >= RATE_LIMIT_RESET_TIME) {
        apiCallsCount = 0;
        lastResetTime = now;
    }

    if (apiCallsCount >= 10) { // 10 requests per minute limit
        throw new Error('Rate limit exceeded. Please try again later.');
    }

    apiCallsCount++;
}

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "analyzeText",
        title: "Analyze Selected Text",
        contexts: ["selection"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "analyzeText") {
        chrome.storage.local.get(['token', 'instructions'], async function(result) {
            if (!result.token) {
                chrome.runtime.sendMessage({
                    type: 'ANALYSIS_ERROR',
                    payload: 'Please login first'
                });
                return;
            }

            if (!checkOnlineStatus()) {
                chrome.runtime.sendMessage({
                    type: 'ANALYSIS_ERROR',
                    payload: 'No internet connection. Please try again when online.'
                });
                return;
            }
            
            chrome.runtime.sendMessage({
                type: 'ANALYSIS_START'
            });
            
            const sanitizedText = sanitizeInput(info.selectionText);
            if (!sanitizedText) {
                chrome.runtime.sendMessage({
                    type: 'ANALYSIS_ERROR',
                    payload: 'Invalid or empty text selection'
                });
                return;
            }

            analyzeText(sanitizedText, result.token, result.instructions || '');
        });
    }
});

async function analyzeText(text, token, instructions, retryCount = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
        checkRateLimit();
        if(instructions === ''){
            chrome.runtime.sendMessage({
                type: 'ANALYSIS_ERROR',
                payload: 'Please enter instructions'
            });
            return; 
        }

        const response = await fetch(`${apiUrl}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                prompt: text,
                instructions: instructions 
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        const result = await response.json();
        
        if (response.ok) {
            const validation = validateApiResponse(result);
            if (!validation.isValid) {
                throw new Error(`Invalid API response: ${validation.errors.join(', ')}`);
            }
            
            chrome.runtime.sendMessage({
                type: 'ANALYSIS_RESULT',
                payload: result.response
            });
        } else {
            throw new Error(result.detail || 'Analysis failed');
        }
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            chrome.runtime.sendMessage({
                type: 'ANALYSIS_ERROR',
                payload: 'Request timed out. Please try again.'
            });
        } else if (error.message.includes('Rate limit') || error.message.includes('fetch')) {
            if (retryCount < MAX_RETRIES) {
                // Exponential backoff
                const delay = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return analyzeText(text, token, instructions, retryCount + 1);
            }
        }

        chrome.runtime.sendMessage({
            type: 'ANALYSIS_ERROR',
            payload: error.message
        });
    }
}