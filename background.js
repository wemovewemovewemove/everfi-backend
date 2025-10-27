// Listens for the extension's installation event
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({
            url: "welcome.html"
        });
    }
});

const SERVER_URL = "https://everfi-backend.onrender.com";

// Helper function to handle fetch requests
async function handleFetch(url, options) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            // Server returned an error (e.g., 403 Forbidden)
            console.error(`Server error: ${response.status} for ${url}`);
            return { error: "Server error", status: response.status };
        }
        return await response.json();
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        return { error: "Failed to contact server.", status: null };
    }
}

// Listens for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // --- QUIZ SOLVER ---
    if (request.action === "solveQuiz") {
        const url = `${SERVER_URL}/api/solve-quiz`;
        const options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: request.username,
                question: request.question,
                options: request.options,
                tableData: request.tableData,
                incorrectOptions: request.incorrectOptions
            })
        };
        handleFetch(url, options).then(sendResponse);
        return true; // Async
    }

    // --- DRAG & DROP SOLVER ---
    if (request.action === "solveDragAndDropWithAI") {
        const url = `${SERVER_URL}/api/solve-dnd`;
        const options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: request.username,
                items: request.items,
                zones: request.zones,
                hint: request.hint
            })
        };
        handleFetch(url, options).then(sendResponse);
        return true; // Async
    }

    // --- COMMAND CHECKER ---
    if (request.action === "checkCommand") {
        if (!request.username) {
            sendResponse(null); // No username, no command
            return;
        }
        
        const url = `${SERVER_URL}/api/check-command?username=${encodeURIComponent(request.username)}`;
        const options = { method: "GET" };
        handleFetch(url, options).then(sendResponse);
        return true; // Async
    }
});