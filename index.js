const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin'); // Import Firebase Admin SDK
const app = express();

app.use(cors());
app.use(express.json());

// --- Read API Key and Whitelist from Environment Variables ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHITELIST_STRING = process.env.WHITELIST || "";

const allowedUsers = WHITELIST_STRING.split(',')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);

if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set.");
}
console.log("Server started. Allowed users:", allowedUsers);

// --- Initialize Firebase Admin SDK ---
try {
    // Render mounts the secret file content as an environment variable
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON; 
    if (!serviceAccountString) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set.');
    }
    const serviceAccount = JSON.parse(serviceAccountString); // Parse the string into an object

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    console.error("Firebase Admin SDK initialization failed:", error);
    // Optionally, exit the process if Firebase is essential
    // process.exit(1); 
}

// Get Firestore instance (only if initialization succeeded)
let db;
try {
    db = admin.firestore();
    console.log("Firestore instance obtained.");
} catch(error) {
    console.error("Failed to get Firestore instance:", error);
    db = null; // Ensure db is null if initialization failed
}
// ------------------------------------


// Simple test route
app.get('/', (req, res) => {
  res.send('Your backend server is running!');
});

// --- VALIDATE USERNAME ENDPOINT (Now logs to Firestore) ---
app.post('/api/validate', async (req, res) => { // Added async
    const { username } = req.body;
    const timestamp = new Date(); // Get current time
    let isAllowed = false;
    let cleanedUsername = 'unknown';

    if (!username) {
        console.log("Validation attempt with no username.");
        // Log attempt even without username
        if (db) {
            try {
                await db.collection('validationLogs').add({
                    username: cleanedUsername,
                    timestamp: timestamp,
                    allowed: isAllowed,
                    reason: 'No username provided'
                });
            } catch (logError) {
                console.error("Firestore logging failed:", logError);
            }
        }
        return res.status(400).json({ isValid: false, error: "Username required" });
    }

    cleanedUsername = username.trim().toLowerCase();
    console.log(`Validation attempt for user: "${cleanedUsername}" at ${timestamp.toISOString()}`);

    // Check whitelist
    if (allowedUsers.includes(cleanedUsername)) {
        isAllowed = true;
        console.log("Access GRANTED.");
    } else {
        isAllowed = false;
        console.log("Access DENIED.");
    }

    // --- Log the attempt to Firestore ---
    if (db) { // Check if db initialization was successful
        try {
            const logEntry = {
                username: cleanedUsername,
                timestamp: timestamp,
                allowed: isAllowed
            };
            if (!isAllowed) {
                logEntry.reason = 'Not on whitelist';
            }
            const docRef = await db.collection('validationLogs').add(logEntry);
            console.log("Logged validation attempt with ID:", docRef.id);
        } catch (logError) {
            console.error("Firestore logging failed:", logError);
            // Don't stop the validation response just because logging failed
        }
    } else {
        console.error("Firestore is not initialized. Cannot log validation attempt.");
    }
    // -------------------------------------

    // Send response back to extension
    if (isAllowed) {
        res.status(200).json({ isValid: true });
    } else {
        res.status(403).json({ isValid: false }); // 403 Forbidden
    }
});


// --- QUIZ SOLVER ENDPOINT ---
// ... (Remains the same as previous version) ...
app.post('/api/solve-quiz', async (req, res) => {
    const { username, question, options, tableData, incorrectOptions } = req.body;
    if (!username || !allowedUsers.includes(username.trim().toLowerCase())) {
        return res.status(403).json({ error: "Access Denied" });
    }
    let promptStart = "";
    if (tableData) {
        promptStart += `Use the following table data...\n\nTABLE DATA:\n${tableData}\n\n---\n\n`;
    }
    let promptMain = `From the options provided below, select the single BEST answer...\n\nQuestion: ${question}\n\nOptions:\n${options.map(opt => `- ${opt}`).join('\n')}\n\nSelected Option Text:`;
    let promptEnd = "";
    if (incorrectOptions && incorrectOptions.length > 0) {
        promptEnd = `\n\nIMPORTANT: ... Do NOT choose any of these WRONG answers: ${incorrectOptions.join(', ')}`;
    }
    const fullPrompt = promptStart + promptMain + promptEnd;
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: fullPrompt }]
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
            const answer = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
            res.status(200).json({ answer: answer });
        } else {
            res.status(500).json({ error: "Invalid response from OpenAI." });
        }
    } catch (error) {
        console.error("Error calling OpenAI:", error);
        res.status(500).json({ error: "API call failed." });
    }
});

// --- DRAG & DROP SOLVER ENDPOINT ---
// ... (Remains the same as previous version) ...
app.post('/api/solve-dnd', async (req, res) => {
    const { username, items, zones, hint } = req.body;
    if (!username || !allowedUsers.includes(username.trim().toLowerCase())) {
        return res.status(403).json({ error: "Access Denied" });
    }
    let prompt = `You are an assistant for a drag-and-drop puzzle...\n\nITEMS TO SORT:\n- ${items.join('\n- ')}\n\nCATEGORIES (ZONES):\n${zones.map((zone, index) => `- Zone ${index}: ${zone}`).join('\n')}\n`;
    if (hint && hint.trim() && !hint.toLowerCase().includes("incorrect")) {
         prompt += `\nCRUCIAL HINT...\n"${hint}"\n`;
    } else {
         prompt += `\nDetermine the correct zone...\n`;
    }
    prompt += `\nYour response MUST be ONLY a valid JSON array...\nExample response format:\n[\n  {"item": "Item A", "zoneIndex": 1}...\n]\n`;
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
             throw new Error("Invalid D&D API response structure.");
        }
        const rawContent = data.choices[0].message.content;
        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*]/);
        if (!jsonMatch) {
             throw new Error("No valid JSON array found in response.");
        }
        const solution = JSON.parse(jsonMatch[0]);
        res.status(200).json({ solution: solution });
    } catch (error) {
        console.error("Error calling OpenAI for D&D:", error);
        res.status(500).json({ error: "D&D API call failed." });
    }
});

// --- Server Start ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});