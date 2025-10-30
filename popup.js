// ===============================================
// <<< ADD THIS ARRAY AT THE TOP >>>
// ===============================================
// Fill this array with URLs to your gatekeeping GIFs
const GATEKEEP_GIFS = [
    "https://files.catbox.moe/6j223m.gif",
    "https://files.catbox.moe/4tv3zw.gif",
    "https://files.catbox.moe/knjjnc.gif",
    "https://files.catbox.moe/0ov27u.gif",
    "https://files.catbox.moe/h82lzt.gif"
    // Add more GIF URLs here, separated by commas
];
// ===============================================

// This function talks to your server to validate the username
async function validateUsername(username) {
    // ... (This function remains unchanged)
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
        return data.isValid;
    } catch (error) {
        console.error("Failed to contact validation server:", error);
        return false;
    }
}

// This function runs on the page to get the username
function getUsernameFromPage() {
    // ... (This function remains unchanged)
    const userSpan = document.querySelector('span[data-login]');
    if (userSpan) {
        return userSpan.innerText.trim();
    }
    return null;
}

// ===============================================
// <<< ADD THIS NEW FUNCTION >>>
// This function is what gets injected into the page to show the GIF
// ===============================================
function flashGatekeepGif(gifUrls) {
    if (!gifUrls || gifUrls.length === 0) return;

    // Pick a random GIF
    const randomGif = gifUrls[Math.floor(Math.random() * gifUrls.length)];
    
    // --- JUMPSCARE TIMING ---
    // const FADE_TIME = 300; // REMOVED
    const SHOW_TIME = 700; // ms (A very quick flash)
    // --- END TIMING ---

    // Create the overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.75);
        display: flex; justify-content: center; align-items: center;
        z-index: 2147483647;
        backdrop-filter: blur(5px);
        /* REMOVED opacity and transition for instant-on */
    `;

    // Create the image element
    const img = document.createElement('img');
    img.src = randomGif;
    // --- JUMPSCARE SIZING ---
    img.style.cssText = `
        width: 90vw; /* Use 90% of viewport width */
        height: 90vh; /* Use 90% of viewport height */
        object-fit: contain; /* This scales the image up to fit, but *prevents stretching* */
        /* REMOVED border-radius and box-shadow for a harder look */
    `;
    // --- END SIZING ---

    overlay.appendChild(img);
    document.body.appendChild(overlay);

    // 1. Appears instantly (no fade in)

    // 2. Wait for SHOW_TIME
    setTimeout(() => {
        // 3. Disappears instantly (no fade out)
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    }, SHOW_TIME);
}
// ===============================================


// --- Main Popup Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // ... (DOM element selections are unchanged)
    const startBotBtn = document.getElementById('startBotBtn');
    const statusEl = document.getElementById('status');
    const quoteEl = document.getElementById('quote');

    // --- Quotes Array and Display Logic ---
    async function displayRandomQuote() {
        // ... (This function remains unchanged)
        let quotes = [
            "does this shit even work?",
            "breaking everfi since 2025",
            "if you are reading this you stink",
            "If you are using this without paying me i will find you.",
            "If you are reading this Mr. Homa I apologize. you did say ai was the future.",
            "fuck you",
            "no, hoping and praying won't get you whitelisted."
        ];
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


    // --- UPDATED Start Bot Button Logic ---
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
            console.error("Failed to inject script to get HWID:", e);
            statusEl.textContent = 'Error: Reload page and try again.';
            statusEl.className = 'invalid';
            startBotBtn.disabled = false;
            return;
        }
        
        if (!username) {
            statusEl.textContent = 'Error: Could not find HWID.';
            statusEl.className = 'invalid';
            startBotBtn.disabled = false;
            return;
        }

        // 3. Check username against the server
        const isAllowed = await validateUsername(username);

        if (isAllowed) {
            // 4. User is on the whitelist, start the bot
            // ... (This 'if' block is unchanged)
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
            statusEl.textContent = 'Access Denied: you arent whitlisted retard';
            statusEl.className = 'invalid';
            startBotBtn.disabled = false; // Re-enable button

            // ===============================================
            // <<< ADD THIS BLOCK >>>
            // Inject the GIF flasher function into the tab
            // ===============================================
            try {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: flashGatekeepGif,       // The function to inject
                    args: [GATEKEEP_GIFS]         // Pass the GIF array as an argument
                });
            } catch (e) {
                console.error("Failed to inject GIF flasher:", e);
            }
            // ===============================================
        }
    });
});