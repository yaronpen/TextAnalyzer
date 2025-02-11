document.addEventListener('DOMContentLoaded', function() {
    // ... (existing variable declarations) ...
    const authContainer = document.getElementById('auth-container');
    const resultContainer = document.getElementById('result-container');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const userAvatar = document.getElementById('userAvatar');
    const emailDisplay = document.getElementById('email-display');
    const copyClipboard = document.getElementById('copyClipboard');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const resetPasswordContainer = document.getElementById('reset-password-container');
    const sendResetLinkBtn = document.getElementById('sendResetLinkBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const networkStatus = document.createElement('div');
    const instructionsArea = document.getElementById('instructions');
    const apiUrl = 'https://analyzetext.info';

    let isWaitingForAnalysis = false;

    let saveTimeout = null;

    let isOnline = navigator.onLine;

    window.addEventListener('online', () => {
        isOnline = true;
        updateNetworkStatus();
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        updateNetworkStatus();
    });

    updateNetworkStatus();

    // Error handling utilities
    const ERROR_MESSAGES = {
        RATE_LIMIT: 'Too many requests. Please try again in a minute.',
        NETWORK: 'Network error. Please check your connection.',
        TIMEOUT: 'Request timed out. Please try again.',
        AUTH: 'Authentication error. Please log in again.',
        VALIDATION: 'Invalid input. Please try again.',
        UNKNOWN: 'An unexpected error occurred. Please try again.'
    };

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    chrome.storage.local.get(['isAnalyzing'], function(result) {
        if (result.isAnalyzing) {
            isWaitingForAnalysis = true;
        }
    });

    function showLoading() {
        loadingDiv.style.display = 'flex';
        loginBtn.disabled = true;
        registerBtn.disabled = true;
    }

    function hideLoading() {
        loadingDiv.style.display = 'none';
        loginBtn.disabled = false;
        registerBtn.disabled = false;
    }

    function showAuthContainer() {
        authContainer.style.display = 'block';
        resultContainer.style.display = 'none';
    }

    function showResultContainer(email) {
        authContainer.style.display = 'none';
        resultContainer.style.display = 'block';
        userAvatar.textContent = getInitials(email);
        emailDisplay.textContent = email;
    }

    function getInitials(email) {
        return email.substring(0, 2).toUpperCase();
    }

    copyClipboard.addEventListener('click', copyToClipboard);

    function copyToClipboard() {
        const text = document.getElementById('result').textContent;
        navigator.clipboard.writeText(text).then(function() {
            var clipBoardObject = document.getElementById('clipBoardMsg');
            clipBoardObject.textContent = 'Copied!';
            setTimeout(function() {
                clipBoardObject.textContent = '';
            }, 5000)
            console.log('Async: Copying to clipboard was successful!');
          }, function(err) {
            console.error('Async: Could not copy text: ', err);
          });
    }

    
    // Network status handling
    networkStatus.className = 'network-status';
    document.querySelector('.container').prepend(networkStatus);
    
    function updateNetworkStatus() {
        if (!isOnline) {
            networkStatus.textContent = 'Offline Mode - Some features may be unavailable';
            networkStatus.className = 'network-status offline';
        } else {
            networkStatus.textContent = '';
            networkStatus.className = 'network-status';
        }
    }

    logoutBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['token', 'email'], function() {
            showAuthContainer();
        });
    });

    forgotPasswordBtn.addEventListener('click', () => {
        authContainer.style.display = 'none';
        resetPasswordContainer.style.display = 'block';
    });
    
    backToLoginBtn.addEventListener('click', () => {
        resetPasswordContainer.style.display = 'none';
        authContainer.style.display = 'block';
    });
    
    sendResetLinkBtn.addEventListener('click', async () => {
        const email = document.getElementById('resetEmail').value;
        if (!email) {
            showError('Please enter your email');
            return;
        }
    
        showLoading();
        try {
            const response = await fetch(`${apiUrl}/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email })
            });
    
            if (response.ok) {
                showError('Reset link sent to your email!'); // Using error div as notification
                resetPasswordContainer.style.display = 'none';
                authContainer.style.display = 'block';
            } else {
                const data = await response.json();
                showError(data.detail || 'Failed to send reset link');
            }
        } catch (error) {
            showError('Connection error. Please try again.');
        } finally {
            hideLoading();
        }
    });

    function handleError(error) {
        let errorMessage = ERROR_MESSAGES.UNKNOWN;
        
        if (error.includes('Rate limit')) {
            errorMessage = ERROR_MESSAGES.RATE_LIMIT;
        } else if (error.includes('timeout')) {
            errorMessage = ERROR_MESSAGES.TIMEOUT;
        } else if (error.includes('network')) {
            errorMessage = ERROR_MESSAGES.NETWORK;
        } else if (error.includes('auth')) {
            errorMessage = ERROR_MESSAGES.AUTH;
            // Force re-login
            chrome.storage.local.remove(['token', 'email'], function() {
                showAuthContainer();
            });
        }

        showError(errorMessage);
    }

    // Input validation
    function validateInput(input, type = 'text') {
        const validations = {
            email: {
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address'
            },
            password: {
                pattern: /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/,
                message: 'Password must be at least 8 characters with letters and numbers'
            },
            text: {
                pattern: /.+/,
                message: 'This field cannot be empty'
            }
        };

        const validation = validations[type];
        console.log(input);
        if (!validation.pattern.test(input)) {
            showError(validation.message);
            return false;
        }
        return true;
    }

    function showSavingStatus() {
        saveStatus.textContent = 'Saving...';
        saveStatus.className = 'save-status saving';
    }

    function showSavedStatus() {
        saveStatus.textContent = 'Changes saved';
        saveStatus.className = 'save-status saved';
        
        // Clear the status after 2 seconds
        setTimeout(() => {
            saveStatus.textContent = '';
        }, 2000);
    }

    chrome.storage.local.get(['instructions'], function(result) {
        // console.log(result)
        if (result.instructions) {
            instructionsArea.value = result.instructions;
        }
    });

    // Auto-save functionality with debounce
    instructionsArea.addEventListener('input', () => {
        showSavingStatus();
        
        // Clear existing timeout
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        // Set new timeout for saving
        saveTimeout = setTimeout(() => {
            const instructions = instructionsArea.value.trim();
            console.log(instructions);
            chrome.storage.local.set({ instructions }, function() {
                showSavedStatus();
            });
        }, 1000); // Wait 1 second after last input before saving
    });

    registerBtn.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showError('Please fill in all fields');
            return;
        }

        const validation = validatePassword(password);
        if (!validation.isValid) {
            showError(validation.errors.join('\n'));
            return;
        }

        showLoading();

        try {
            const response = await fetch(`${apiUrl}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, username: email, password })
            });

            const data = await response.json();

            if (response.ok) {
                showError('Registration successful! Please login.');
                document.getElementById('email').value = '';
                document.getElementById('password').value = '';
            } else {
                showError(data.detail || 'Registration failed');
            }
        } catch (error) {
            showError('Connection error. Please try again.');
        } finally {
            hideLoading();
        }
    });

    

    // Enhanced login handling
    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!validateInput(email, 'email') || !validateInput(password, 'password')) {
            return;
        }

        if (!isOnline) {
            showError('Cannot login while offline');
            return;
        }

        showLoading();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(`${apiUrl}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            if (response.ok) {
                chrome.storage.local.set({ 
                    token: data.access_token,
                    email: email 
                }, function() {
                    showResultContainer(email);
                });
            } else {
                handleError(data.detail || 'Login failed');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                handleError('Request timed out');
            } else {
                handleError('Connection error');
            }
        } finally {
            hideLoading();
        }
    });

    async function verifyToken(token, email) {
        try {
            const response = await fetch(`${apiUrl}/verify_token`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                showResultContainer(email);
            } else {
                showAuthContainer();

                chrome.storage.local.remove(['token', 'email']);
            }
        } catch (error) {
            showAuthContainer();
        }
    }

    // chrome.runtime.onMessage.addListener((message) => {
    //     // First check if we're already authenticated
    //     chrome.storage.local.get(['token', 'email'], function(result) {
    //         if (result.token) {
    //             showResultContainer(result.email);
                
    //             // Now handle the message
    //             if (message.type === 'ANALYSIS_START') {
    //                 const resultDiv = document.getElementById('result');
    //                 resultDiv.innerHTML = `<div class="text-gray-800"></div>`;
    //             } else if (message.type === 'ANALYSIS_RESULT') {
    //                 const resultDiv = document.getElementById('result');
                    
    //                 resultDiv.innerHTML = `<div class="text-gray-800">${message.payload}</div>`;
    //                 chrome.storage.local.set({ lastAnalysisResult: message.payload });
    //             } else if (message.type === 'ANALYSIS_ERROR') {
    //                 const resultDiv = document.getElementById('result');
    //                 resultDiv.innerHTML = `<div class="text-red-600">Error: ${message.payload}</div>`;
    //                 chrome.storage.local.set({ lastAnalysisResult: message.payload });
    //             }
    //         }
    //     });
    // });
    // let isWaitingForAnalysis = false;
    chrome.storage.local.get(['token', 'email'], function(result) {
        if (result.token) {
            verifyToken(result.token, result.email);

        } else {
            showAuthContainer();
        }
    });

    chrome.storage.local.get(['lastAnalysisResult'], function(result) {
        if (result.lastAnalysisResult) {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = result.lastAnalysisResult;
        }
    });

    // Handle analysis updates with enhanced error handling
    chrome.runtime.onMessage.addListener((message) => {
        chrome.storage.local.get(['token', 'email'], function(result) {
            if (result.token) {
                showResultContainer(result.email);
                
                const resultDiv = document.getElementById('result');
                console.log(message.type);
                switch (message.type) {
                    case 'ANALYSIS_START':
                        resultDiv.innerHTML = `<div class="text-gray-800">Analyzing...</div>`;
                        showLoading();
                        break;
                        
                    case 'ANALYSIS_RESULT':
                        console.log(message.payload);
                        hideLoading();
                        // Validate and sanitize the response
                        const sanitizedResult = DOMPurify.sanitize(message.payload);
                        resultDiv.innerHTML = `<div class="text-gray-800">${sanitizedResult}</div>`;
                        chrome.storage.local.set({ lastAnalysisResult: sanitizedResult });
                        break;
                        
                    case 'ANALYSIS_ERROR':
                        hideLoading();
                        handleError(message.payload);
                        break;

                    case 'ONLINE_STATUS_CHANGE':
                        isOnline = message.payload;
                        updateNetworkStatus();
                        break;
                }
            }
        });
    });

    // Add CSS for network status
    // const style = document.createElement('style');
    // style.textContent = `
        
    // `;
    // document.head.appendChild(style);
});