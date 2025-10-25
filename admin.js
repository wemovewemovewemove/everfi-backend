document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const adminContent = document.getElementById('admin-content');
    const passwordInput = document.getElementById('admin-password');
    const loginButton = document.getElementById('login-button');
    const loginStatus = document.getElementById('login-status');
    const userList = document.getElementById('user-list');
    const userStatus = document.getElementById('user-status');
    const refreshButton = document.getElementById('refresh-users');

    const SERVER_URL = "https://everfi-backend.onrender.com"; // Your backend URL

    let adminPassword = null; // Store password after successful login

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
                const data = await response.json();
                if (data.success) {
                    adminPassword = password; // Store the password for future requests
                    loginSection.style.display = 'none';
                    adminContent.style.display = 'block';
                    loginStatus.textContent = '';
                    loadUsers(); // Load users after successful login
                } else {
                    loginStatus.textContent = 'Login failed: Incorrect password.';
                    loginStatus.className = 'status error';
                }
            } else {
                loginStatus.textContent = `Login failed: Server error (${response.status})`;
                loginStatus.className = 'status error';
            }
        } catch (error) {
            console.error("Login error:", error);
            loginStatus.textContent = 'Login failed: Network error.';
            loginStatus.className = 'status error';
        }
    });

    // --- Load Users Logic ---
    async function loadUsers() {
        if (!adminPassword) return; // Don't try if not logged in

        userStatus.textContent = 'Loading users...';
        userStatus.className = 'status';
        userList.innerHTML = ''; // Clear previous list

        try {
            const response = await fetch(`${SERVER_URL}/api/admin/users`, {
                method: 'GET',
                headers: { 'admin-password': adminPassword } // Send stored password in header
            });

            if (response.ok) {
                const users = await response.json();
                if (users.length === 0) {
                    userStatus.textContent = 'No users found in the database yet.';
                } else {
                    displayUsers(users);
                    userStatus.textContent = ''; // Clear loading message
                }
            } else {
                 userStatus.textContent = `Error loading users: Server error (${response.status})`;
                 userStatus.className = 'status error';
            }
        } catch (error) {
            console.error("Error fetching users:", error);
            userStatus.textContent = 'Error loading users: Network error.';
            userStatus.className = 'status error';
        }
    }

    // --- Display Users in Table ---
    function displayUsers(users) {
        userList.innerHTML = ''; // Clear table body
        users.forEach(user => {
            const row = document.createElement('tr');
            const isEnabled = user.isEnabled ?? true; // Default to true if missing

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
        });

        // Add event listeners to the new buttons
        document.querySelectorAll('.toggle-button').forEach(button => {
            button.addEventListener('click', handleToggleClick);
        });
    }

    // --- Handle Toggle Button Click ---
    async function handleToggleClick(event) {
        if (!adminPassword) return;

        const button = event.target;
        const username = button.dataset.username;
        const currentStatus = button.dataset.enabled === 'true'; // Convert string to boolean
        const newStatus = !currentStatus;

        button.disabled = true; // Prevent double clicks
        button.textContent = 'Updating...';

        try {
            const response = await fetch(`${SERVER_URL}/api/admin/toggle-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'admin-password': adminPassword // Send password in header
                },
                body: JSON.stringify({ username: username, isEnabled: newStatus })
            });

            if (response.ok) {
                userStatus.textContent = `User "${username}" ${newStatus ? 'enabled' : 'disabled'} successfully.`;
                userStatus.className = 'status success';
                loadUsers(); // Reload the list to show the change
            } else {
                userStatus.textContent = `Error updating user: Server error (${response.status})`;
                userStatus.className = 'status error';
                button.disabled = false; // Re-enable button on failure
                button.textContent = currentStatus ? 'Disable' : 'Enable';
            }
        } catch (error) {
            console.error("Error toggling user:", error);
            userStatus.textContent = 'Error updating user: Network error.';
            userStatus.className = 'status error';
            button.disabled = false; // Re-enable button on failure
            button.textContent = currentStatus ? 'Disable' : 'Enable';
        }
    }

    // --- Refresh Button ---
    refreshButton.addEventListener('click', loadUsers);
});