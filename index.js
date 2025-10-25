const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (admin.html, etc.)

// --- Read Environment Variables ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHITELIST_STRING = process.env.WHITELIST || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const allowedUsers = WHITELIST_STRING.split(',')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);

if (!OPENAI_API_KEY) console.error("FATAL ERROR: OPENAI_API_KEY is not set.");
if (!ADMIN_PASSWORD) console.warn("WARNING: ADMIN_PASSWORD is not set.");
console.log("Server started. Allowed users:", allowedUsers);

// --- Initialize Firebase Admin SDK ---
let db;
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountString) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set.');
    const serviceAccount = JSON.parse(serviceAccountString);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    console.error("Firebase Admin SDK initialization failed:", error);
    db = null;
}
// ------------------------------------

// Simple test route
app.get('/', (req, res) => {
  res.send('Your backend server is running!');
});

// --- Helper Function to Log Validation Attempts ---
async function logValidationAttempt(username, timestamp, allowed, reason) {
    if (!db) {
        console.error("Firestore not initialized. Cannot log validation attempt.");
        return;
    }
    try {
        const logEntry = { username, timestamp, allowed, reason };
        const docRef = await db.collection('validationLogs').add(logEntry);
        console.log(`Logged validation attempt [${reason}] with ID: ${docRef.id}`);
    } catch (logError) {
        console.error("Firestore logging failed:", logError);
    }
}

// --- Password check middleware ---
function checkAdminPassword(req, res, next) {
    const providedPassword = req.headers['admin-password'];
    if (!ADMIN_PASSWORD || providedPassword !== ADMIN_PASSWORD) {
        console.warn("Admin access denied: Invalid or missing password.");
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ===================================
// USER-FACING ENDPOINTS
// ===================================

// --- VALIDATE USERNAME ENDPOINT ---
app.post('/api/validate', async (req, res) => {
    const { username } = req.body;
    const timestamp = new Date();
    let isAllowed = false, reason = 'Unknown', cleanedUsername = 'unknown';

    if (!db) return res.status(500).json({ isValid: false, error: "Database connection error" });

    if (!username) {
        reason = 'No username provided';
        await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
        return res.status(400).json({ isValid: false, error: "Username required" });
    }

    cleanedUsername = username.trim().toLowerCase();
    const userDocRef = db.collection('users').doc(cleanedUsername);
    console.log(`Validation attempt for user: "${cleanedUsername}"`);

    // 1. Check Whitelist
    if (!allowedUsers.includes(cleanedUsername)) {
        reason = 'Not on whitelist';
        console.log("Access DENIED - Not whitelisted.");
        await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
        return res.status(403).json({ isValid: false });
    }

    // 2. Check isEnabled status in 'users' collection
    try {
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            console.log(`User "${cleanedUsername}" not in DB, creating with isEnabled: true.`);
            await userDocRef.set({ isEnabled: true, username: cleanedUsername });
            isAllowed = true;
            reason = 'Access Granted (New User)';
        } else {
            const userData = userDoc.data();
            if (userData.isEnabled === false) {
                isAllowed = false;
                reason = 'Disabled by admin';
                console.log("Access DENIED - User disabled by admin.");
            } else {
                isAllowed = true;
                reason = 'Access Granted';
            }
        }
    } catch (dbError) {
        console.error("Firestore error checking user status:", dbError);
        isAllowed = false;
        reason = 'Database error during status check';
        await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
        return res.status(500).json({ isValid: false, error: "Database error" });
    }

    await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
    res.status(isAllowed ? 200 : 403).json({ isValid: isAllowed });
});

// --- AI Proxy Endpoints ---
async function checkUserStatusForAI(username) {
    if (!db) throw new Error("Database not available");
    const userDoc = await db.collection('users').doc(username.trim().toLowerCase()).get();
    if (!userDoc.exists || userDoc.data().isEnabled === false) {
        console.log(`AI Request Denied: User "${username}" not found or disabled.`);
        return false;
    }
    return true;
}

app.post('/api/solve-quiz', async (req, res) => {
    try {
        if (!await checkUserStatusForAI(req.body.username)) return res.status(403).json({ error: "Access Denied" });
        const { question, options, tableData, incorrectOptions } = req.body;
        let promptStart = tableData ? `Use table data...\n\nTABLE DATA:\n${tableData}\n\n---\n\n` : "";
        let promptMain = `Select BEST answer...\n\nQuestion: ${question}\n\nOptions:\n${options.map(opt => `- ${opt}`).join('\n')}\n\nSelected Option Text:`;
        let promptEnd = (incorrectOptions && incorrectOptions.length > 0) ? `\n\nIMPORTANT: ... Do NOT choose: ${incorrectOptions.join(', ')}` : "";
        const fullPrompt = promptStart + promptMain + promptEnd;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}`},
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: fullPrompt }] })
        });
        const data = await response.json();
        const answer = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
        res.status(200).json({ answer: answer });
    } catch (error) { console.error("Error in /api/solve-quiz:", error); res.status(500).json({ error: error.message }); }
});

app.post('/api/solve-dnd', async (req, res) => {
    try {
        if (!await checkUserStatusForAI(req.body.username)) return res.status(403).json({ error: "Access Denied" });
        const { items, zones, hint } = req.body;
        let prompt = `Sort items into categories...\n\nITEMS:\n- ${items.join('\n- ')}\n\nZONES:\n${zones.map((zone, index) => `- Zone ${index}: ${zone}`).join('\n')}\n`;
        if (hint && hint.trim() && !hint.toLowerCase().includes("incorrect")) { prompt += `\nCRUCIAL HINT...\n"${hint}"\n`; }
        else { prompt += `\nDetermine correct zone...\n`; }
        prompt += `\nYour response MUST be ONLY a valid JSON array...\nExample:\n[\n  {"item": "Item A", "zoneIndex": 1}...\n]\n`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}`},
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: prompt }] })
        });
        const data = await response.json();
        const rawContent = data.choices[0].message.content;
        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*]/);
        if (!jsonMatch) throw new Error("No valid JSON array in AI response.");
        res.status(200).json({ solution: JSON.parse(jsonMatch[0]) });
    } catch (error) { console.error("Error in /api/solve-dnd:", error); res.status(500).json({ error: error.message }); }
});

// --- NEW: TROLL COMMAND ENDPOINT (for extension to check) ---
app.get('/api/check-command', async (req, res) => {
    const { username } = req.query;
    if (!username || !db) return res.json(null); // No username or DB, send no command

    const cleanedUsername = username.trim().toLowerCase();
    const commandDocRef = db.collection('liveCommands').doc(cleanedUsername);
    
    try {
        const doc = await commandDocRef.get();
        if (doc.exists) {
            const command = doc.data();
            console.log(`Sending command to user "${cleanedUsername}":`, command.command);
            // Delete the command after reading it so it doesn't run again
            await commandDocRef.delete();
            res.status(200).json(command);
        } else {
            res.json(null); // No command waiting
        }
    } catch (error) {
        console.error("Error checking command:", error);
        res.json(null);
    }
});


// ===================================
// ADMIN-ONLY ENDPOINTS
// ===================================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false });
    }
    res.status(200).json({ success: true });
});

app.get('/api/admin/users', checkAdminPassword, async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not available" });
    try {
        const usersSnapshot = await db.collection('users').orderBy('username').get();
        const usersList = usersSnapshot.docs.map(doc => ({
            username: doc.id,
            isEnabled: doc.data().isEnabled ?? true
        }));
        res.status(200).json(usersList);
    } catch (error) { res.status(500).json({ error: "Failed to fetch users" }); }
});

app.post('/api/admin/toggle-user', checkAdminPassword, async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { username, isEnabled } = req.body;
    if (!username || typeof isEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid request body' });
    }
    try {
        await db.collection('users').doc(username.toLowerCase()).set({ isEnabled }, { merge: true });
        console.log(`Admin toggled user "${username}" to isEnabled: ${isEnabled}`);
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to update user" }); }
});

// --- NEW: ADMIN ENDPOINT TO SEND TROLL COMMAND ---
app.post('/api/admin/send-command', checkAdminPassword, async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { username, command, message } = req.body;
    if (!username || !command) {
        return res.status(400).json({ error: "Invalid request body" });
    }
    
    try {
        const cleanedUsername = username.trim().toLowerCase();
        const commandDocRef = db.collection('liveCommands').doc(cleanedUsername);
        
        const newCommand = {
            command: command, // "showEyes", "showText", "hide"
            message: message || "", // Text to display
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Set the command, overwriting any previous one
        await commandDocRef.set(newCommand);
        console.log(`Admin sent command "${command}" to user "${cleanedUsername}"`);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error sending command:", error);
        res.status(500).json({ error: "Failed to send command" });
    }
});

// --- Server Start ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});