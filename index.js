const express = require('express');
const cors = require('cors');
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
// -----------------------------------------------------------


// --- VALIDATE USERNAME ENDPOINT (for popup) ---
app.post('/api/validate', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ isValid: false, error: "Username required" });
    }
    const cleanedUsername = username.trim().toLowerCase();
    
    if (allowedUsers.includes(cleanedUsername)) {
        res.status(200).json({ isValid: true });
    } else {
        res.status(403).json({ isValid: false });
    }
});


// --- NEW: QUIZ SOLVER ENDPOINT ---
app.post('/api/solve-quiz', async (req, res) => {
    const { username, question, options, tableData, incorrectOptions } = req.body;

    // 1. Validate User
    if (!username || !allowedUsers.includes(username.trim().toLowerCase())) {
        return res.status(403).json({ error: "Access Denied" });
    }

    // 2. Build the prompt (same as your old background.js)
    let promptStart = "";
    if (tableData) {
        promptStart += `Use the following table data to help answer the question.\n\nTABLE DATA:\n${tableData}\n\n---\n\n`;
    }
    let promptMain = `From the options provided below, select the single BEST answer to the following question. Respond with ONLY the exact text of the chosen option. Do not include any explanation or introductory text.\n\nQuestion: ${question}\n\nOptions:\n${options.map(opt => `- ${opt}`).join('\n')}\n\nSelected Option Text:`;
    let promptEnd = "";
    if (incorrectOptions && incorrectOptions.length > 0) {
        promptEnd = `\n\nIMPORTANT: The user has already tried the following answers and they were WRONG. Do NOT choose any of these WRONG answers: ${incorrectOptions.join(', ')}`;
    }
    const fullPrompt = promptStart + promptMain + promptEnd;

    // 3. Call OpenAI from the server
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}` // Use the secure key
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: fullPrompt }]
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            const answer = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
            res.status(200).json({ answer: answer }); // Send answer back to extension
        } else {
            res.status(500).json({ error: "Invalid response from OpenAI." });
        }
    } catch (error) {
        console.error("Error calling OpenAI:", error);
        res.status(500).json({ error: "API call failed." });
    }
});


// --- NEW: DRAG & DROP SOLVER ENDPOINT ---
app.post('/api/solve-dnd', async (req, res) => {
    const { username, items, zones, hint } = req.body;

    // 1. Validate User
    if (!username || !allowedUsers.includes(username.trim().toLowerCase())) {
        return res.status(403).json({ error: "Access Denied" });
    }

    // 2. Build the prompt
    let prompt = `You are an assistant for a drag-and-drop puzzle. Your task is to sort a list of items into the correct categories.

ITEMS TO SORT:
- ${items.join('\n- ')}

CATEGORIES (ZONES):
${zones.map((zone, index) => `- Zone ${index}: ${zone}`).join('\n')}
`;
    if (hint && hint.trim() && !hint.toLowerCase().includes("incorrect")) {
         prompt += `\nCRUCIAL HINT FROM THE PREVIOUS FAILED ATTEMPT:\n"${hint}"\n`;
    } else {
         prompt += `\nDetermine the correct zone for each item based on general knowledge or common sense associations between the items and category names.\n`;
    }
    prompt += `
Your response MUST be ONLY a valid JSON array of objects, where each object has an "item" (the exact string of the item) and a "zoneIndex" (the number of the correct category). Ensure every item from the 'ITEMS TO SORT' list appears exactly once in your JSON response. DO NOT include any introductory text, explanation, or conversational filler before or after the JSON array.

Example response format:
[
  {"item": "Item A", "zoneIndex": 1},
  {"item": "Item B", "zoneIndex": 0},
  {"item": "Item C", "zoneIndex": 1}
]
`;
    
    // 3. Call OpenAI from the server
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}` // Use the secure key
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }]
            })
        });

        const data = await response.json();
        
        // 4. Parse and send back
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