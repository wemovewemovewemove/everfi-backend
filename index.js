const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files like admin.html

// --- Environment Variables ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHITELIST_STRING = process.env.WHITELIST || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Validate essential env vars on startup
if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set.");
    // Optionally exit if critical: process.exit(1);
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
     console.error("FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.");
     // Optionally exit: process.exit(1);
}
if (!ADMIN_PASSWORD) {
    console.warn("WARNING: ADMIN_PASSWORD environment variable is not set. Admin panel access will fail or be insecure.");
}

const allowedUsers = WHITELIST_STRING.split(',')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);

console.log("Server starting... Allowed users:", allowedUsers.length > 0 ? allowedUsers.join(', ') : 'None');

// --- Firebase Initialization ---
let db = null; // Initialize db as null
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccount = JSON.parse(serviceAccountString); // This can throw if JSON is invalid

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore(); // Assign db ONLY if initializeApp succeeds
    console.log("Firebase Admin SDK initialized successfully.");

} catch (error) {
    // Log the specific error during initialization
    console.error("Firebase Admin SDK initialization FAILED:", error.message);
    console.error("Ensure FIREBASE_SERVICE_ACCOUNT_JSON is correctly set in Render Environment.");
    // db remains null
}
// -----------------------------

// --- Helper: Log Validation Attempt ---
async function logValidationAttempt(username, timestamp, allowed, reason) {
    if (!db) {
        // console.error("Firestore not available. Cannot log validation attempt."); // Keep console less noisy
        return;
    }
    try {
        const logEntry = { username, timestamp: admin.firestore.Timestamp.fromDate(timestamp), allowed, reason };
        await db.collection('validationLogs').add(logEntry);
        // console.log(`Logged validation [${reason}] for ${username}`); // Less verbose
    } catch (logError) {
        console.error("Firestore logging failed:", logError.message);
    }
}

// --- Middleware: Check Admin Password ---
function checkAdminPassword(req, res, next) {
    console.log("Executing checkAdminPassword middleware..."); // Add log
    const providedPassword = req.headers['admin-password'];
    if (!ADMIN_PASSWORD) {
         console.error("Admin password check failed: ADMIN_PASSWORD env var not set on server.");
         return res.status(500).json({ error: 'Server configuration error' }); // Use 500 for config issue
    }
    if (providedPassword !== ADMIN_PASSWORD) {
        console.warn("Admin access denied: Invalid or missing password provided.");
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log("Admin password check successful."); // Add log
    next(); // Password correct
}

// --- Helper: Check User Status (Used by AI endpoints and Validate) ---
// Returns { exists: boolean, isEnabled: boolean | null, error: string | null }
async function getUserStatus(username) {
    if (!db) return { exists: false, isEnabled: null, error: "Database not available" };
    if (!username) return { exists: false, isEnabled: null, error: "Username not provided" };

    const cleanedUsername = username.trim().toLowerCase();
    const userDocRef = db.collection('users').doc(cleanedUsername);

    try {
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            return { exists: false, isEnabled: null, error: null };
        } else {
            // Default to true if isEnabled field is missing
            const isEnabled = userDoc.data()?.isEnabled !== false;
            return { exists: true, isEnabled: isEnabled, error: null };
        }
    } catch (dbError) {
        console.error(`Firestore error checking status for ${cleanedUsername}:`, dbError.message);
        return { exists: false, isEnabled: null, error: "Database error during status check" };
    }
}


// ===================================
// USER-FACING ENDPOINTS
// ===================================

app.get('/', (req, res) => res.send('Backend server is running!'));

// --- VALIDATE (For Popup Button) ---
app.post('/api/validate', async (req, res) => {
    const { username } = req.body;
    const timestamp = new Date();
    let reason = 'Unknown';
    let cleanedUsername = 'unknown';

    console.log(`Received /api/validate request for user: ${username || 'MISSING'}`); // Log entry

    // Use top-level try-catch to ensure a response is always sent
    try {
        if (!username) {
            reason = 'No username provided';
            await logValidationAttempt(cleanedUsername, timestamp, false, reason);
            return res.status(400).json({ isValid: false, error: "Username required" });
        }

        cleanedUsername = username.trim().toLowerCase();

        // 1. Check Whitelist first (local check, doesn't need db)
        if (!allowedUsers.includes(cleanedUsername)) {
            reason = 'Not on whitelist';
            console.log(`Validation DENIED for ${cleanedUsername}: Not whitelisted.`);
            await logValidationAttempt(cleanedUsername, timestamp, false, reason);
            return res.status(403).json({ isValid: false });
        }

        // 2. User is whitelisted, check DB status
        if (!db) {
            console.error(`Validation DENIED for ${cleanedUsername}: Database not available.`);
            // Allow access if DB fails? Or deny? Deny for safety.
            reason = 'Database unavailable';
             await logValidationAttempt(cleanedUsername, timestamp, false, reason);
            return res.status(503).json({ isValid: false, error: "Database connection error" }); // 503 Service Unavailable
        }

        const status = await getUserStatus(cleanedUsername);

        if (status.error) {
             // getUserStatus already logged the specific DB error
             reason = status.error;
             await logValidationAttempt(cleanedUsername, timestamp, false, reason);
             return res.status(500).json({ isValid: false, error: status.error });
        }

        if (!status.exists) {
            // First time seeing this user, create their record
            console.log(`User "${cleanedUsername}" not in DB, creating with isEnabled: true.`);
            await db.collection('users').doc(cleanedUsername).set({ isEnabled: true, username: cleanedUsername }, { merge: true });
            reason = 'Access Granted (New User)';
            await logValidationAttempt(cleanedUsername, timestamp, true, reason);
            return res.status(200).json({ isValid: true });
        } else {
            // User exists, check their fetched isEnabled status
            if (!status.isEnabled) {
                reason = 'Disabled by admin';
                console.log(`Validation DENIED for ${cleanedUsername}: Disabled by admin.`);
                await logValidationAttempt(cleanedUsername, timestamp, false, reason);
                return res.status(403).json({ isValid: false });
            } else {
                reason = 'Access Granted';
                console.log(`Validation GRANTED for ${cleanedUsername}: User enabled.`);
                await logValidationAttempt(cleanedUsername, timestamp, true, reason);
                return res.status(200).json({ isValid: true });
            }
        }
    } catch (error) {
        // Catch any unexpected errors during validation logic
        console.error("Unexpected error in /api/validate:", error.message, error.stack);
        await logValidationAttempt(cleanedUsername, timestamp, false, 'Server error');
        return res.status(500).json({ isValid: false, error: "Internal server error" });
    }
});

// --- AI PROXY ENDPOINTS ---
app.post('/api/solve-quiz', async (req, res) => {
    const { username, question, options, tableData, incorrectOptions } = req.body;
    console.log(`Received /api/solve-quiz request from ${username || 'MISSING'}`);
    try {
        const status = await getUserStatus(username);
        if (!status.isEnabled) { // Handles null, false, and errors from getUserStatus
             console.log(`Quiz request DENIED for ${username}: ${status.error || 'User disabled/not found'}.`);
             return res.status(403).json({ error: status.error || "Access Denied" });
        }

        let promptStart = tableData ? `Use table data...\n\nTABLE DATA:\n${tableData}\n\n---\n\n` : "";
        let promptMain = `Select BEST answer...\n\nQuestion: ${question}\n\nOptions:\n${options.map(opt => `- ${opt}`).join('\n')}\n\nSelected Option Text:`;
        let promptEnd = (incorrectOptions && incorrectOptions.length > 0) ? `\n\nIMPORTANT: ... Do NOT choose: ${incorrectOptions.join(', ')}` : "";
        const fullPrompt = promptStart + promptMain + promptEnd;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}`},
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: fullPrompt }] })
        });
        if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error("Invalid OpenAI response structure");
        const answer = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
        console.log(`Sending quiz answer for ${username}: "${answer.substring(0, 50)}..."`);
        res.status(200).json({ answer: answer });

    } catch (error) {
        console.error(`Error in /api/solve-quiz for ${username}:`, error.message);
        res.status(500).json({ error: error.message || "Failed to solve quiz" });
    }
});

app.post('/api/solve-dnd', async (req, res) => {
    const { username, items, zones, hint } = req.body;
     console.log(`Received /api/solve-dnd request from ${username || 'MISSING'}`);
    try {
        const status = await getUserStatus(username);
         if (!status.isEnabled) {
             console.log(`D&D request DENIED for ${username}: ${status.error || 'User disabled/not found'}.`);
             return res.status(403).json({ error: status.error || "Access Denied" });
         }

        let prompt = `Sort items into categories...\n\nITEMS:\n- ${items.join('\n- ')}\n\nZONES:\n${zones.map((zone, index) => `- Zone ${index}: ${zone}`).join('\n')}\n`;
        if (hint && hint.trim() && !hint.toLowerCase().includes("incorrect")) { prompt += `\nCRUCIAL HINT...\n"${hint}"\n`; }
        else { prompt += `\nDetermine correct zone...\n`; }
        prompt += `\nYour response MUST be ONLY a valid JSON array...\nExample:\n[\n  {"item": "Item A", "zoneIndex": 1}...\n]\n`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}`},
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: prompt }] })
        });
        if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error("Invalid OpenAI response structure");
        const rawContent = data.choices[0].message.content;
        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*]/);
        if (!jsonMatch) throw new Error("No valid JSON array in AI response.");
        const solution = JSON.parse(jsonMatch[0]);
        console.log(`Sending D&D solution for ${username}.`);
        res.status(200).json({ solution: solution });

    } catch (error) {
        console.error(`Error in /api/solve-dnd for ${username}:`, error.message);
        res.status(500).json({ error: error.message || "Failed to solve D&D" });
    }
});

// --- CHECK COMMAND (Modified for real-time disable) ---
app.get('/api/check-command', async (req, res) => {
    const { username } = req.query;
    // No console log here, too noisy

    // Use top-level try-catch
    try {
        if (!username) return res.json(null); // No username, no command
        if (!db) return res.json(null); // DB not available, send no command

        const cleanedUsername = username.trim().toLowerCase();
        const userDocRef = db.collection('users').doc(cleanedUsername);
        const commandDocRef = db.collection('liveCommands').doc(cleanedUsername);

        // 1. Check if user is enabled FIRST
        const userDoc = await userDocRef.get(); // This might throw on DB error
        if (userDoc.exists && userDoc.data().isEnabled === false) {
            console.log(`User "${cleanedUsername}" is disabled. Sending forceStop.`);
            await commandDocRef.delete().catch(e => console.error("Minor: Failed to delete pending command for disabled user:", e.message)); // Try to clear pending command, but don't fail if this errors
            return res.status(200).json({ command: "forceStop" });
        }

        // 2. User is enabled (or doesn't exist yet), check for admin commands
        const commandDoc = await commandDocRef.get(); // This might throw on DB error
        if (commandDoc.exists) {
            const command = commandDoc.data();
            console.log(`Sending command to user "${cleanedUsername}":`, command.command);
            await commandDocRef.delete(); // Delete after reading
            return res.status(200).json(command);
        } else {
            return res.json(null); // No command waiting
        }
    } catch (error) {
        console.error("Error checking command/status:", error.message);
        // Don't send error details to client, just send null
        return res.json(null);
    }
});


// ===================================
// ADMIN-ONLY ENDPOINTS
// ===================================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    console.log("Received /api/admin/login request."); // Log entry

    // Use top-level try-catch for safety, though this endpoint is simple
    try {
        if (!ADMIN_PASSWORD) {
            console.error("Admin login failed: ADMIN_PASSWORD env var not set on server.");
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }
        if (password !== ADMIN_PASSWORD) {
             console.log("Admin login failed: Incorrect password.");
            return res.status(401).json({ success: false }); // 401 Unauthorized
        }
        console.log("Admin login successful.");
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Unexpected error in /api/admin/login:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Uses checkAdminPassword middleware first
app.get('/api/admin/users', checkAdminPassword, async (req, res) => {
    console.log("Received /api/admin/users request.");
    try {
        if (!db) return res.status(503).json({ error: "Database not available" }); // 503

        const usersSnapshot = await db.collection('users').orderBy('username').get();
        const usersList = usersSnapshot.docs.map(doc => ({
            username: doc.id, // doc.id is the username used as the document key
            isEnabled: doc.data()?.isEnabled ?? true // Default to true if missing
        }));
        res.status(200).json(usersList);

    } catch (error) {
        console.error("Error fetching users:", error.message);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Uses checkAdminPassword middleware first
app.post('/api/admin/toggle-user', checkAdminPassword, async (req, res) => {
    const { username, isEnabled } = req.body;
    console.log(`Received /api/admin/toggle-user request for ${username} to ${isEnabled}`);
    try {
        if (!db) return res.status(503).json({ error: "Database not available" }); // 503
        if (!username || typeof isEnabled !== 'boolean') {
            return res.status(400).json({ error: 'Invalid request body: username and isEnabled (boolean) required' });
        }

        const cleanedUsername = username.toLowerCase();
        const userDocRef = db.collection('users').doc(cleanedUsername);
        // Use set with merge to create if not exists, or update if exists
        await userDocRef.set({ isEnabled: isEnabled, username: cleanedUsername }, { merge: true });
        console.log(`Admin toggled user "${cleanedUsername}" to isEnabled: ${isEnabled}`);
        res.status(200).json({ success: true });

    } catch (error) {
        console.error(`Error toggling user ${username}:`, error.message);
        res.status(500).json({ error: "Failed to update user status" });
    }
});

// Uses checkAdminPassword middleware first
app.post('/api/admin/send-command', checkAdminPassword, async (req, res) => {
    const { username, command, message } = req.body;
     console.log(`Received /api/admin/send-command request: ${command} for ${username}`);
    try {
        if (!db) return res.status(503).json({ error: "Database not available" }); // 503
        if (!username || !command) {
            return res.status(400).json({ error: "Invalid request body: username and command required" });
        }

        const cleanedUsername = username.trim().toLowerCase();
        const commandDocRef = db.collection('liveCommands').doc(cleanedUsername);
        const newCommand = {
            command: command,
            message: message || "", // Ensure message is at least empty string
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Use server timestamp
        };

        await commandDocRef.set(newCommand); // Overwrites previous command
        console.log(`Admin sent command "${command}" to user "${cleanedUsername}"`);
        res.status(200).json({ success: true });

    } catch (error) {
        console.error("Error sending command:", error.message);
        res.status(500).json({ error: "Failed to send command" });
    }
});

// --- Server Start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));

// --- Global Error Handler (Optional but Recommended) ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err.message);
  res.status(500).send('Something broke!');
});