const express = require('express');
const cors = require('cors');
const app = express();

// Use cors for all routes
app.use(cors()); 

// Use express.json() to parse incoming JSON bodies
app.use(express.json());

// --- Whitelist Logic ---
// Get the whitelist string from Render Environment Variables
// Example: "josh morey,jane doe,another user"
const WHITELIST_STRING = process.env.WHITELIST || ""; 

// Clean and process the whitelist ONCE when the server starts
const allowedUsers = WHITELIST_STRING.split(',')
    .map(name => name.trim().toLowerCase()) // Clean each name
    .filter(name => name.length > 0);      // Remove any empty strings

console.log("Server started. Allowed users:", allowedUsers);
// -----------------------


// Simple test route
app.get('/', (req, res) => {
  res.send('Your backend server is running!');
});


// --- VALIDATE USERNAME ENDPOINT ---
// This replaces the old /api/validate endpoint
app.post('/api/validate', (req, res) => {
    const { username } = req.body; // Get the username from the request

    if (!username) {
        console.log("Validation attempt with no username.");
        return res.status(400).json({ isValid: false, error: "Username required" });
    }

    // Clean the incoming username for comparison
    const cleanedUsername = username.trim().toLowerCase();
    
    console.log(`Validation attempt for user: "${cleanedUsername}"`);

    // Check if the cleaned username is in our allowed list
    if (allowedUsers.includes(cleanedUsername)) {
        console.log("Access GRANTED.");
        res.status(200).json({ isValid: true });
    } else {
        console.log("Access DENIED.");
        res.status(403).json({ isValid: false }); // 403 Forbidden
    }
});


// Render provides a port number via an environment variable
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});