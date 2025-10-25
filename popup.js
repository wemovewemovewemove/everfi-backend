// This function talks to your server to validate the username
async function validateUsername(username) {
    const SERVER_URL = "https://everfi-backend.onrender.com"; 

    try {
        const response = await fetch(`${SERVER_URL}/api/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username })
        });
        
        if (!response.ok) {
            console.error("Server responded with an error:", response.status);
            return false;
        }
        
        const data = await response.json();
        return data.isValid; // Will be true or false

    } catch (error) {
        console.error("Failed to contact validation server:", error);
        return false;
    }
}

// This function runs on the page to get the username
function getUsernameFromPage() {
    const userSpan = document.querySelector('span[data-login]');
    if (userSpan) {
        return userSpan.innerText.trim();
    }
    return null;
}

// --- Main Popup Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // API key elements are gone
    const startBotBtn = document.getElementById('startBotBtn');
    const statusEl = document.getElementById('status');
    const quoteEl = document.getElementById('quote');

    // --- Quotes Array and Display Logic ---
    async function displayRandomQuote() {
        let quotes = [
            "does this shit even work?",
            "breaking everfi since 2025",
            "if you are reading this you stink",
            "If you are using this without paying me i will find you.",
            "If you are reading this Mr. Homa I apologize. you did say ai was the future.",
            "fuck you"
        ];
        // Removed IP-API call to reduce permissions

        const randomIndex = Math.floor(Math.random() * quotes.length);
        quoteEl.textContent = `"${quotes[randomIndex]}"`;

        const luckyNumber = Math.floor(Math.random() * 100);
        if (luckyNumber === 0) {
            quoteEl.style.fontFamily = "'IAmMusic', sans-serif";
            quoteEl.style.fontStyle = 'normal';
            quoteEl.style.fontSize = '16px';
            quoteEl.style.color = 'var(--text-primary)';
        }
    }

    displayRandomQuote();

    // --- API Key Logic is GONE ---
    // --- Test Key Logic is GONE ---

    // --- UPDATED Start Bot Button Logic (with WHITELIST check) ---
    startBotBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // 1. Check if on the right page
        if (!tab || !tab.url.includes("everfi.net")) {
            statusEl.textContent = 'Not on an EVERFI page!';
            statusEl.className = 'invalid';
            return;
        }

        // --- Validation Step ---
        statusEl.textContent = 'Validating user...';
        statusEl.className = '';
        startBotBtn.disabled = true;

        // 2. Get username from the page
        let username;
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: getUsernameFromPage,
            });
            username = results[0].result;
        } catch (e) {
            console.error("Failed to inject script to get username:", e);
            statusEl.textContent = 'Error: Reload page and try again.';
            statusEl.className = 'invalid';
            startBotBtn.disabled = false;
            return;
        }
        
        if (!username) {
            statusEl.textContent = 'Error: Could not find username on page.';
            statusEl.className = 'invalid';
            startBotBtn.disabled = false;
            return;
        }

        // 3. Check username against the server
        const isAllowed = await validateUsername(username);

        if (isAllowed) {
            // 4. User is on the whitelist, start the bot
            statusEl.textContent = 'Access Granted! Starting...';
            statusEl.className = 'valid';
            startBotBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Starting...</span>`;

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            setTimeout(() => window.close(), 500);

        } else {
            // 5. User is NOT on the whitelist
            statusEl.textContent = 'Access Denied: User not whitelisted.';
            statusEl.className = 'invalid';
            startBotBtn.disabled = false; // Re-enable button
        }
    });
});