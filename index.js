const express = require('express');
const cors = require('cors'); // Import cors
const app = express();

// Use cors for all routes
app.use(cors()); 

// Use express.json() to parse incoming JSON bodies (like from your extension)
app.use(express.json());

// Simple test route
app.get('/', (req, res) => {
  res.send('Your backend server is running!');
});

// --- YOUR PING ENDPOINT ---
// This is the URL your extension will call
app.post('/api/ping', (req, res) => {
  // You can see the data your extension sent
  console.log('Ping received!', req.body); 

  // For now, just log it and send a success message
  // In the future, you'd check a password/key here
  res.status(200).json({ status: 'success', message: 'Pong!' });
});

// --- YOUR PASSWORD CHECK ENDPOINT ---
app.post('/api/validate', (req, res) => {
    const { password } = req.body; // Get the password from the request

    // **IMPORTANT**: Never hard-code passwords. Use Environment Variables!
    // We'll set MY_SECRET_PASSWORD in the Render dashboard.
    const a_REAL_PASSWORD = process.env.MY_SECRET_PASSWORD;

    if (password === a_REAL_PASSWORD) {
        console.log('Valid password received!');
        res.status(200).json({ isValid: true });
    } else {
        console.log('INVALID password attempt:', password);
        res.status(401).json({ isValid: false }); // 401 Unauthorized
    }
});


// Render provides a port number via an environment variable
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});