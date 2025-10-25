const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors());
app.use(express.json());

// --- Read Environment Variables ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHITELIST_STRING = process.env.WHITELIST || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // New admin password

const allowedUsers = WHITELIST_STRING.split(',')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);

if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set.");
}
if (!ADMIN_PASSWORD) {
    console.warn("WARNING: ADMIN_PASSWORD environment variable is not set. Admin panel will be insecure.");
}
console.log("Server started. Allowed users:", allowedUsers);

// --- Initialize Firebase Admin SDK ---
let db;
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountString) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set.');
    }
    const serviceAccount = JSON.parse(serviceAccountString);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore(); // Assign db here
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

// --- VALIDATE USERNAME ENDPOINT (Checks whitelist AND isEnabled status) ---
app.post('/api/validate', async (req, res) => {
    const { username } = req.body;
    const timestamp = new Date();
    let isAllowed = false;
    let reason = 'Unknown';
    let cleanedUsername = 'unknown';
    let userDocRef;
    let userDoc;

    if (!db) {
         console.error("Firestore not available for validation.");
         return res.status(500).json({ isValid: false, error: "Database connection error" });
    }

    if (!username) {
        cleanedUsername = 'unknown';
        reason = 'No username provided';
        isAllowed = false;
        console.log("Validation attempt with no username.");
        // Log attempt (error handling inside)
        await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
        return res.status(400).json({ isValid: false, error: "Username required" });
    }

    cleanedUsername = username.trim().toLowerCase();
    userDocRef = db.collection('users').doc(cleanedUsername); // Use username as document ID

    console.log(`Validation attempt for user: "${cleanedUsername}" at ${timestamp.toISOString()}`);

    // 1. Check Whitelist first
    if (!allowedUsers.includes(cleanedUsername)) {
        isAllowed = false;
        reason = 'Not on whitelist';
        console.log("Access DENIED - Not whitelisted.");
        await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
        return res.status(403).json({ isValid: false });
    }

    // 2. User is whitelisted, check their status in the 'users' collection
    try {
        userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            // First time seeing this user, create their record with isEnabled: true
            console.log(`User "${cleanedUsername}" not found in DB, creating with isEnabled: true.`);
            await userDocRef.set({ isEnabled: true, username: cleanedUsername }); // Store username for easier querying
            isAllowed = true;
            reason = 'Access Granted (New User)';
            console.log("Access GRANTED - New user created.");
        } else {
            // User exists, check their isEnabled status
            const userData = userDoc.data();
            if (userData.isEnabled === false) { // Explicitly check for false
                isAllowed = false;
                reason = 'Disabled by admin';
                console.log("Access DENIED - User disabled by admin.");
            } else {
                // isEnabled is true or missing (treat missing as true for safety)
                isAllowed = true;
                reason = 'Access Granted';
                console.log("Access GRANTED - User enabled.");
            }
        }
    } catch (dbError) {
        console.error("Firestore error checking user status:", dbError);
        isAllowed = false; // Fail safe: deny access if DB check fails
        reason = 'Database error during status check';
        await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);
        return res.status(500).json({ isValid: false, error: "Database error" });
    }

    // 3. Log the final attempt result
    await logValidationAttempt(cleanedUsername, timestamp, isAllowed, reason);

    // 4. Send response
    if (isAllowed) {
        res.status(200).json({ isValid: true });
    } else {
        res.status(403).json({ isValid: false });
    }
});

// --- Helper Function to Log Validation Attempts ---
async function logValidationAttempt(username, timestamp, allowed, reason) {
    if (!db) {
        console.error("Firestore not initialized. Cannot log validation attempt.");
        return;
    }
    try {
        const logEntry = {
            username: username,
            timestamp: timestamp,
            allowed: allowed,
            reason: reason
        };
        const docRef = await db.collection('validationLogs').add(logEntry);
        console.log(`Logged validation attempt [${reason}] with ID: ${docRef.id}`);
    } catch (logError) {
        console.error("Firestore logging failed:", logError);
    }
}


// --- ADMIN ENDPOINTS ---

// Simple password check middleware (replace with proper auth later if needed)
function checkAdminPassword(req, res, next) {
    const providedPassword = req.headers['admin-password']; // Expect password in headers
    if (!ADMIN_PASSWORD || providedPassword !== ADMIN_PASSWORD) {
        console.warn("Admin access denied: Invalid or missing password.");
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next(); // Password is correct, proceed
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
         console.log("Admin login failed.");
        return res.status(401).json({ success: false });
    }
    console.log("Admin login successful.");
    res.status(200).json({ success: true });
});

// Get Users (Protected)
app.get('/api/admin/users', checkAdminPassword, async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not available" });
    try {
        const usersSnapshot = await db.collection('users').orderBy('username').get();
        const usersList = usersSnapshot.docs.map(doc => ({
            username: doc.id, // doc.id is the username
            isEnabled: doc.data().isEnabled ?? true // Default to true if missing
        }));
        res.status(200).json(usersList);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Toggle User Status (Protected)
app.post('/api/admin/toggle-user', checkAdminPassword, async (req, res) => {
    const { username, isEnabled } = req.body;
    if (!db) return res.status(500).json({ error: "Database not available" });
    if (!username || typeof isEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    try {
        const userDocRef = db.collection('users').doc(username.toLowerCase());
        await userDocRef.set({ isEnabled: isEnabled }, { merge: true }); // Use set with merge to create if not exists
        console.log(`Admin toggled user "${username}" to isEnabled: ${isEnabled}`);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(`Error toggling user ${username}:`, error);
        res.status(500).json({ error: "Failed to update user status" });
    }
});

// --- AI Proxy Endpoints (Unchanged, but now check isEnabled via /api/validate first) ---
app.post('/api/solve-quiz', async (req, res) => {
    const { username, question, options, tableData, incorrectOptions } = req.body;
    // We rely on the frontend calling /api/validate first.
    // A more robust system might re-validate here or use tokens.
    // For simplicity now, we assume if they call this, they were validated moments ago.
    
    // Check if user exists and is enabled (quick check, relies on /validate creating the user)
     if (db) {
         try {
             const userDoc = await db.collection('users').doc(username.trim().toLowerCase()).get();
             if (!userDoc.exists || userDoc.data().isEnabled === false) {
                 console.log(`AI Request Denied: User "${username}" not found or disabled.`);
                 return res.status(403).json({ error: "Access Denied" });
             }
         } catch (e) {
             console.error("Error checking user status during AI request:", e);
             return res.status(500).json({ error: "Database error" });
         }
     } else {
         return res.status(500).json({ error: "Database not available" });
     }


    let promptStart = tableData ? `Use the following table data...\n\nTABLE DATA:\n${tableData}\n\n---\n\n` : "";
    let promptMain = `From the options provided below, select the single BEST answer...\n\nQuestion: ${question}\n\nOptions:\n${options.map(opt => `- ${opt}`).join('\n')}\n\nSelected Option Text:`;
    let promptEnd = (incorrectOptions && incorrectOptions.length > 0) ? `\n\nIMPORTANT: ... Do NOT choose any of these WRONG answers: ${incorrectOptions.join(', ')}` : "";
    const fullPrompt = promptStart + promptMain + promptEnd;
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", { /* ... OpenAI call ... */ 
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}`},
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: fullPrompt }] })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
            const answer = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
            res.status(200).json({ answer: answer });
        } else { res.status(500).json({ error: "Invalid response from OpenAI." }); }
    } catch (error) { console.error("Error calling OpenAI:", error); res.status(500).json({ error: "API call failed." }); }
});
app.post('/api/solve-dnd', async (req, res) => {
    const { username, items, zones, hint } = req.body;
     // Quick check if user exists and is enabled
     if (db) {
         try {
             const userDoc = await db.collection('users').doc(username.trim().toLowerCase()).get();
             if (!userDoc.exists || userDoc.data().isEnabled === false) {
                  console.log(`AI Request Denied: User "${username}" not found or disabled.`);
                 return res.status(403).json({ error: "Access Denied" });
             }
         } catch (e) {
              console.error("Error checking user status during AI request:", e);
             return res.status(500).json({ error: "Database error" });
         }
     } else {
          return res.status(500).json({ error: "Database not available" });
     }

    let prompt = `You are an assistant for a drag-and-drop puzzle...\n\nITEMS TO SORT:\n- ${items.join('\n- ')}\n\nCATEGORIES (ZONES):\n${zones.map((zone, index) => `- Zone ${index}: ${zone}`).join('\n')}\n`;
    if (hint && hint.trim() && !hint.toLowerCase().includes("incorrect")) { prompt += `\nCRUCIAL HINT...\n"${hint}"\n`; }
    else { prompt += `\nDetermine the correct zone...\n`; }
    prompt += `\nYour response MUST be ONLY a valid JSON array...\nExample response format:\n[\n  {"item": "Item A", "zoneIndex": 1}...\n]\n`;
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", { /* ... OpenAI call ... */ 
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}`},
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: prompt }] })
        });
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) { throw new Error("Invalid D&D API response structure."); }
        const rawContent = data.choices[0].message.content;
        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*]/);
        if (!jsonMatch) { throw new Error("No valid JSON array found in response."); }
        const solution = JSON.parse(jsonMatch[0]);
        res.status(200).json({ solution: solution });
    } catch (error) { console.error("Error calling OpenAI for D&D:", error); res.status(500).json({ error: "D&D API call failed." }); }
});


// --- Server Start ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});