// Listens for the extension's installation event
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({
            url: "welcome.html"
        });
    }
});

const SERVER_URL = "https://everfi-backend.onrender.com";

// Listens for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // --- QUIZ SOLVER ---
    if (request.action === "solveQuiz") {
        fetch(`${SERVER_URL}/api/solve-quiz`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: request.username,
                question: request.question,
                options: request.options,
                tableData: request.tableData,
                incorrectOptions: request.incorrectOptions
            })
        })
        .then(response => response.json())
        .then(data => sendResponse(data))
        .catch(error => {
            console.error('Error forwarding quiz request:', error);
            sendResponse({ error: "Failed to contact server." });
        });
        return true; // Async
    }

    // --- DRAG & DROP SOLVER ---
    if (request.action === "solveDragAndDropWithAI") {
        fetch(`${SERVER_URL}/api/solve-dnd`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: request.username,
                items: request.items,
                zones: request.zones,
                hint: request.hint
            })
        })
        .then(response => response.json())
        .then(data => sendResponse(data))
        .catch(error => {
            console.error('Error forwarding D&D request:', error);
            sendResponse({ error: "Failed to contact server." });
        });
        return true; // Async
    }

    // --- NEW: TROLL COMMAND CHECKER ---
    if (request.action === "checkCommand") {
        if (!request.username) {
            sendResponse(null); // No username, no command
            return;
        }
        
        fetch(`${SERVER_URL}/api/check-command?username=${encodeURIComponent(request.username)}`, {
            method: "GET"
        })
        .then(response => response.json())
        .then(data => sendResponse(data)) // Send command (or null) back to content.js
        .catch(error => {
            console.error('Error checking for command:', error);
            sendResponse(null); // Send null on error
        });
        return true; // Async
    }
});