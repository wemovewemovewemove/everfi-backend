document.addEventListener('DOMContentLoaded', () => {
    // Sections
    const loginSection = document.getElementById('login-section');
    const adminContent = document.getElementById('admin-content');
    
    // Login Elements
    const passwordInput = document.getElementById('admin-password');
    const loginButton = document.getElementById('login-button');
    const loginStatus = document.getElementById('login-status');
    
    // User Management Elements
    const userList = document.getElementById('user-list');
    const userStatus = document.getElementById('user-status');
    const refreshButton = document.getElementById('refresh-users');
    
    // Troll Panel Elements
    const trollUserSelect = document.getElementById('troll-user-select');
    const trollMessageInput = document.getElementById('troll-message');
    const sendTextBtn = document.getElementById('send-text-btn');
    const showEyesBtn = document.getElementById('show-eyes-btn');
    const hideAllBtn = document.getElementById('hide-all-btn');
    const trollStatus = document.getElementById('troll-status');

    const SERVER_URL = "https://everfi-backend.onrender.com";
    let adminPassword = null;

    // --- Login Logic ---
    loginButton.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) {
            loginStatus.textContent = 'Please enter the password.';
            loginStatus.className = 'status error';
            return;
        }

        try {
            loginStatus.textContent = 'Logging in...';
            loginStatus.className = 'status';
            const response = await fetch(`${SERVER_URL}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password })
            });

            if (response.ok) {
                adminPassword = password;
                loginSection.style.display = 'none';
                adminContent.style.display = 'block';
                loginStatus.textContent = '';
                loadUsers();
            } else {
                loginStatus.textContent = 'Login failed: Incorrect password.';
                loginStatus.className = 'status error';
            }
        } catch (error) {
            loginStatus.textContent = 'Login failed: Network error.';
            loginStatus.className = 'status error';
        }
    });

    // --- Load Users Logic ---
    async function loadUsers() {
        if (!adminPassword) return;

        userStatus.textContent = 'Loading users...';
        userStatus.className = 'status';
        userList.innerHTML = '';
        trollUserSelect.innerHTML = ''; // Clear troll dropdown too

        try {
            const response = await fetch(`${SERVER_URL}/api/admin/users`, {
                method: 'GET',
                headers: { 'admin-password': adminPassword }
            });

            if (response.ok) {
                const users = await response.json();
                if (users.length === 0) {
                    userStatus.textContent = 'No users found in the database yet.';
                } else {
                    displayUsers(users);
                    userStatus.textContent = '';
                }
            } else {
                 userStatus.textContent = `Error loading users: Server error (${response.status})`;
                 userStatus.className = 'status error';
            }
        } catch (error) {
            userStatus.textContent = 'Error loading users: Network error.';
            userStatus.className = 'status error';
        }
    }

    // --- Display Users (for Table and Dropdown) ---
    function displayUsers(users) {
        userList.innerHTML = '';
        trollUserSelect.innerHTML = '<option value="">-- Select a user --</option>'; // Add default
        
        users.forEach(user => {
            const isEnabled = user.isEnabled ?? true;
            
            // Add to management table
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${isEnabled ? 'Enabled' : 'Disabled'}</td>
                <td>
                    <button class="toggle-button ${isEnabled ? 'disable' : 'enable'}" data-username="${user.username}" data-enabled="${isEnabled}">
                        ${isEnabled ? 'Disable' : 'Enable'}
                    </button>
                </td>
            `;
            userList.appendChild(row);

            // Add to troll dropdown
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.username;
            trollUserSelect.appendChild(option);
        });

        document.querySelectorAll('.toggle-button').forEach(button => {
            button.addEventListener('click', handleToggleClick);
        });
    }

    // --- Handle User Enable/Disable ---
    async function handleToggleClick(event) {
        if (!adminPassword) return;
        const button = event.target;
        const username = button.dataset.username;
        const newStatus = !(button.dataset.enabled === 'true');

        button.disabled = true;
        button.textContent = 'Updating...';

        try {
            const response = await fetch(`${SERVER_URL}/api/admin/toggle-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'admin-password': adminPassword },
                body: JSON.stringify({ username: username, isEnabled: newStatus })
            });

            if (response.ok) {
                userStatus.textContent = `User "${username}" ${newStatus ? 'enabled' : 'disabled'}.`;
                userStatus.className = 'status success';
                loadUsers(); // Reload list
            } else {
                userStatus.textContent = `Error updating user: Server error (${response.status})`;
                userStatus.className = 'status error';
                button.disabled = false;
            }
        } catch (error) {
            userStatus.textContent = 'Error updating user: Network error.';
            userStatus.className = 'status error';
            button.disabled = false;
        }
    }

    // --- NEW: TROLL PANEL LOGIC ---
    
    // Generic function to send a command
    async function sendCommand(username, command, message = "") {
        if (!username) {
            trollStatus.textContent = "Please select a user.";
            trollStatus.className = "status error";
            return;
        }
        
        trollStatus.textContent = `Sending command "${command}" to ${username}...`;
        trollStatus.className = "status";

        try {
            const response = await fetch(`${SERVER_URL}/api/admin/send-command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'admin-password': adminPassword },
                body: JSON.stringify({ username, command, message })
            });

            if (response.ok) {
                trollStatus.textContent = `Command "${command}" sent to ${username}!`;
                trollStatus.className = "status success";
                if (command === 'showText') trollMessageInput.value = ''; // Clear message input
            } else {
                trollStatus.textContent = `Error sending command: Server error (${response.status})`;
                trollStatus.className = "status error";
            }
        } catch (error) {
            trollStatus.textContent = 'Error sending command: Network error.';
            trollStatus.className = "status error";
        }
    }

    // Button listeners
    sendTextBtn.addEventListener('click', () => {
        const username = trollUserSelect.value;
        const message = trollMessageInput.value;
        if (!message) {
             trollStatus.textContent = "Please type a message.";
             trollStatus.className = "status error";
             return;
        }
        sendCommand(username, 'showText', message);
    });

    showEyesBtn.addEventListener('click', () => {
        const username = trollUserSelect.value;
        sendCommand(username, 'showEyes');
    });

    hideAllBtn.addEventListener('click', () => {
        const username = trollUserSelect.value;
        sendCommand(username, 'hide');
    });

    refreshButton.addEventListener('click', loadUsers);
});