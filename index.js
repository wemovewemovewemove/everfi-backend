const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files

// --- Environment Variables ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHITELIST_STRING = process.env.WHITELIST || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const allowedUsers = WHITELIST_STRING.split(',')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);

if (!OPENAI_API_KEY) console.error("FATAL ERROR: OPENAI_API_KEY is not set.");
if (!ADMIN_PASSWORD) console.warn("WARNING: ADMIN_PASSWORD is not set.");
console.log("Server started. Allowed users:", allowedUsers);

// --- Firebase Initialization ---
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

// --- Helper: Log Validation Attempt ---
async function logValidationAttempt(username, timestamp, allowed, reason) { /* ... remains the same ... */ }
// --- Middleware: Check Admin Password ---
function checkAdminPassword(req, res, next) { /* ... remains the same ... */ }
// --- Helper: Check User Status for AI ---
async function checkUserStatusForAI(username) { /* ... remains the same ... */ }


// ===================================
// USER-FACING ENDPOINTS
// ===================================

app.get('/', (req, res) => res.send('Backend server is running!'));

// --- VALIDATE (For Popup Button) ---
app.post('/api/validate', async (req, res) => { /* ... remains the same: checks whitelist and enabled status ... */ });

// --- AI PROXY ENDPOINTS ---
app.post('/api/solve-quiz', async (req, res) => { /* ... remains the same: includes checkUserStatusForAI ... */ });
app.post('/api/solve-dnd', async (req, res) => { /* ... remains the same: includes checkUserStatusForAI ... */ });

// --- CHECK COMMAND (Modified for real-time disable) ---
app.get('/api/check-command', async (req, res) => {
    const { username } = req.query;
    if (!username || !db) return res.json(null); // No username or DB

    const cleanedUsername = username.trim().toLowerCase();
    const userDocRef = db.collection('users').doc(cleanedUsername);
    const commandDocRef = db.collection('liveCommands').doc(cleanedUsername);

    try {
        // 1. Check if user is enabled FIRST
        const userDoc = await userDocRef.get();
        if (userDoc.exists && userDoc.data().isEnabled === false) {
            console.log(`User "${cleanedUsername}" is disabled. Sending forceStop.`);
            // Send forceStop command immediately if disabled
            await commandDocRef.delete(); // Clear any pending admin command
            return res.status(200).json({ command: "forceStop" });
        }

        // 2. User is enabled (or doesn't exist yet), check for admin commands
        const commandDoc = await commandDocRef.get();
        if (commandDoc.exists) {
            const command = commandDoc.data();
            console.log(`Sending command to user "${cleanedUsername}":`, command.command);
            await commandDocRef.delete(); // Delete after reading
            return res.status(200).json(command);
        } else {
            return res.json(null); // No command waiting
        }
    } catch (error) {
        console.error("Error checking command/status:", error);
        return res.json(null); // Send null on error
    }
});


// ===================================
// ADMIN-ONLY ENDPOINTS
// ===================================
app.post('/api/admin/login', (req, res) => { /* ... remains the same ... */ });
app.get('/api/admin/users', checkAdminPassword, async (req, res) => { /* ... remains the same ... */ });
app.post('/api/admin/toggle-user', checkAdminPassword, async (req, res) => { /* ... remains the same ... */ });
app.post('/api/admin/send-command', checkAdminPassword, async (req, res) => { /* ... remains the same ... */ });

// --- Server Start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));


// --- Re-paste full function bodies ---

async function logValidationAttempt(username, timestamp, allowed, reason) {
    if (!db) { console.error("Firestore not initialized. Cannot log."); return; }
    try {
        const logEntry = { username, timestamp, allowed, reason };
        const docRef = await db.collection('validationLogs').add(logEntry);
        // console.log(`Logged validation [${reason}] ID: ${docRef.id}`); // Less verbose logging
    } catch (logError) { console.error("Firestore logging failed:", logError); }
}

function checkAdminPassword(req, res, next) {
    const providedPassword = req.headers['admin-password'];
    if (!ADMIN_PASSWORD || providedPassword !== ADMIN_PASSWORD) {
        console.warn("Admin access denied: Invalid or missing password.");
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

async function checkUserStatusForAI(username) {
    if (!username || !db) throw new Error("Database not available or username missing");
    try {
        const userDoc = await db.collection('users').doc(username.trim().toLowerCase()).get();
        if (!userDoc.exists || userDoc.data().isEnabled === false) {
            console.log(`AI Request Denied: User "${username}" not found or disabled.`);
            return false;
        }
        return true;
    } catch(e) {
         console.error(`DB Error checking AI status for ${username}: ${e.message}`);
         throw new Error("Database error checking user status"); // Propagate error
    }
}

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
            await userDocRef.set({ isEnabled: true, username: cleanedUsername }, { merge: true });
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
        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error("Invalid OpenAI response structure");
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
        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error("Invalid OpenAI response structure");
        const rawContent = data.choices[0].message.content;
        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*]/);
        if (!jsonMatch) throw new Error("No valid JSON array in AI response.");
        res.status(200).json({ solution: JSON.parse(jsonMatch[0]) });
    } catch (error) { console.error("Error in /api/solve-dnd:", error); res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
         console.log("Admin login failed.");
        return res.status(401).json({ success: false });
    }
    console.log("Admin login successful.");
    res.status(200).json({ success: true });
});

app.get('/api/admin/users', checkAdminPassword, async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not available" });
    try {
        const usersSnapshot = await db.collection('users').orderBy('username').get();
        const usersList = usersSnapshot.docs.map(doc => ({
            username: doc.id,
            isEnabled: doc.data().isEnabled ?? true // Default to true if missing
        }));
        res.status(200).json(usersList);
    } catch (error) { console.error("Error fetching users:", error); res.status(500).json({ error: "Failed to fetch users" }); }
});

app.post('/api/admin/toggle-user', checkAdminPassword, async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { username, isEnabled } = req.body;
    if (!username || typeof isEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid request body' });
    }
    try {
        const userDocRef = db.collection('users').doc(username.toLowerCase());
        await userDocRef.set({ isEnabled: isEnabled, username: username.toLowerCase() }, { merge: true }); // Ensure username field exists
        console.log(`Admin toggled user "${username}" to isEnabled: ${isEnabled}`);
        res.status(200).json({ success: true });
    } catch (error) { console.error(`Error toggling user ${username}:`, error); res.status(500).json({ error: "Failed to update user status" }); }
});

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
            message: message || "",
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        await commandDocRef.set(newCommand);
        console.log(`Admin sent command "${command}" to user "${cleanedUsername}"`);
        res.status(200).json({ success: true });
    } catch (error) { console.error("Error sending command:", error); res.status(500).json({ error: "Failed to send command" }); }
});