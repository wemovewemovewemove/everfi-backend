// ============== Answer Key ==============
const ANSWER_KEY = {
    "Reduce Medical Costs": {
        "Health Insurance": "Reduce Medical Costs",
        "Stay In Network": "Reduce Medical Costs",
        "Review All Bills": "Reduce Medical Costs",
        "No Insurance": "Increase Medical Costs",
        "Out of Network": "Increase Medical Costs"
    },
    "GROWDND1": {
        "New wireless headphones": "Short-Term Goal",
        "A new tablet": "Short-Term Goal",
        "A trip with friends": "Mid-Term Goal",
        "A used car": "Mid-Term Goal",
        "College": "Mid-Term Goal",
        "A house": "Long-Term Goal",
        "Retirement": "Long-Term Goal"
    }
    // Add new puzzle titles and their solutions here
};

// ============== Global State ==============
let isBotLoopRunning = false; // Flag to control the main bot automation loop
let botLoopIntervalId = null; // ID for the main bot interval
let commandCheckIntervalId = null; // ID for the command checking interval

let lastActivityTimestamp = Date.now();
let lastPageHTML = '';
let isStuck = false;
let isActionInProgress = false; // Prevents multiple actions firing simultaneously
let dudNavButtons = [], clickedHotspots = [], clickedTabs = [], clickedModals = [], answeredQuizQuestions = [];
const STUCK_TIMEOUT = 30000; // 30 seconds
let cachedUsername = null; // Store username once found

// ============== Bot Logging GUI ==============
function createLogGUI() {
    // Avoid creating multiple GUIs
    if (document.getElementById('everfi-bot-log-container')) return;
    const container = document.createElement('div');
    container.id = 'everfi-bot-log-container';
    container.innerHTML = `
        <div class="log-header">
            <span>EVERFI Bot Log</span>
            <button id="log-close-btn">&times;</button>
        </div>
        <div id="log-content"></div>
    `;
    document.body.appendChild(container);

    // Apply styles
    Object.assign(container.style, {
        position: 'fixed', bottom: '20px', right: '20px', width: '350px',
        height: '250px', backgroundColor: '#1e1e1e', color: '#d4d4d4',
        borderRadius: '8px', zIndex: '2147483646', // High z-index but below troll overlay
        display: 'flex', flexDirection: 'column', boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
        fontFamily: 'monospace', fontSize: '12px'
    });
    const header = container.querySelector('.log-header');
    Object.assign(header.style, {
        backgroundColor: '#2d2d2d', padding: '8px',
        borderTopLeftRadius: '8px', borderTopRightRadius: '8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'move' // Allow moving the log window
    });
    const closeBtn = container.querySelector('#log-close-btn');
     Object.assign(closeBtn.style, {
        background: 'none', border: 'none', color: '#d4d4d4',
        fontSize: '18px', cursor: 'pointer'
    });
    const logContent = container.querySelector('#log-content');
    Object.assign(logContent.style, {
        padding: '10px', flex: '1', overflowY: 'auto', // Allow scrolling
        scrollbarWidth: 'thin', scrollbarColor: '#555 #2d2d2d' // Basic scrollbar styling
    });
    // Close button functionality
    closeBtn.onclick = () => container.remove();

    // Make the log draggable (simple implementation)
    let isDragging = false;
    let offsetX, offsetY;
    header.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - container.offsetLeft;
        offsetY = e.clientY - container.offsetTop;
        header.style.cursor = 'grabbing';
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        container.style.left = `${e.clientX - offsetX}px`;
        container.style.top = `${e.clientY - offsetY}px`;
    };
    document.onmouseup = () => {
        isDragging = false;
        header.style.cursor = 'move';
    };
}

// --- VISIBLE LOG: For the user's GUI ---
function log(message, type = 'info') {
    createLogGUI(); // Ensure GUI exists
    const logContent = document.getElementById('log-content');
    if (!logContent) return; // Exit if GUI somehow failed to create

    const time = new Date().toLocaleTimeString();
    const p = document.createElement('p');

    // Add color based on type
    let color = '#d4d4d4'; // Default info color
    if (type === 'error') color = '#f44747'; // Red
    if (type === 'success') color = '#4caf50'; // Green
    if (type === 'system') color = '#569cd6'; // Blue
    if (type === 'event') color = '#c586c0'; // Purple

    p.innerHTML = `<span style="color: #888;">[${time}]</span> <span style="color:${color};">${message}</span>`;
    Object.assign(p.style, { margin: '0 0 5px 0', lineHeight: '1.4', wordBreak: 'break-word' }); // Prevent overflow

    logContent.appendChild(p);
    // Auto-scroll to the bottom
    logContent.scrollTop = logContent.scrollHeight;

    // Also log to console for debugging
    console.log(`[EVERFI Bot - ${type.toUpperCase()}] ${message}`);
}

// --- NEW: SILENT LOG: For troll commands (console-only) ---
function silentLog(message) {
    console.log(`[EVERFI Bot - Admin] ${message}`);
}


// ============== Bot Logic ==============

// --- Get Username ---
function getUsernameFromPage() {
    if (cachedUsername) return cachedUsername; // Use cached version if available
    const userSpan = document.querySelector('span[data-login]');
    if (userSpan && userSpan.innerText) {
        cachedUsername = userSpan.innerText.trim();
        log(`Username found: ${cachedUsername}`, "system"); // This is a good log to keep visible
        return cachedUsername;
    }
    return null; // Return null if not found yet
}

// --- Bot Action Loop (Controlled by isBotLoopRunning) ---
function runBot() {
    // Add a visible log at the start to confirm it's trying to run
    log("runBot triggered.", "event");

    // Prevent bot actions if troll overlay is active
    if (document.getElementById('troll-overlay')) {
        if (!runBot.trollOverlayActiveLogged) {
            silentLog("Troll overlay active, pausing bot actions."); // Now silent
            runBot.trollOverlayActiveLogged = true;
        }
        return;
    } else {
        runBot.trollOverlayActiveLogged = false; // Reset log flag when overlay is gone
    }

    // Prevent bot actions if loop is not running
    if (!isBotLoopRunning) {
        // This log should only appear once after initialization, then stop
        if (!runBot.botLoopPausedLogged) {
            log("Bot loop paused (waiting for start signal).", "system"); // Keep this visible
            runBot.botLoopPausedLogged = true;
        }
        return;
    } else {
         runBot.botLoopPausedLogged = false; // Reset log flag
    }

    // --- Bot loop IS running ---
    log("Bot loop active, proceeding...", "system"); // Confirm loop is active


    if (isStuck || isActionInProgress) {
        log(`runBot skipped: isStuck=${isStuck}, isActionInProgress=${isActionInProgress}`, "system");
        return; // Don't run if stuck or action already in progress
    }

    // Try to get username if not already cached (important for AI calls)
    if (!cachedUsername) {
        getUsernameFromPage();
        if (!cachedUsername) {
             log("Waiting for username to appear on page...", "system");
             return; // Wait until username is available
        }
    }


    removeResetButtons(); // Attempt to remove retry/start over buttons
    removeDistractions(); // Attempt to remove menu buttons

    // --- Check for DOM changes to reset timers and states ---
    const currentPageHTML = document.body.innerHTML;
    if (currentPageHTML !== lastPageHTML) {
        log("DOM change detected. Resetting activity timer and interaction states.", "system"); // Keep visible
        lastActivityTimestamp = Date.now();
        lastPageHTML = currentPageHTML;
        // Reset interaction tracking arrays
        dudNavButtons = []; clickedHotspots = []; clickedTabs = []; clickedModals = []; answeredQuizQuestions = [];
        isStuck = false; // Reset stuck state on page change
    }

    // --- Check if stuck ---
    if (Date.now() - lastActivityTimestamp > STUCK_TIMEOUT) {
        log(`HALT: No significant DOM change detected for ${STUCK_TIMEOUT / 1000} seconds. Bot might be stuck.`, "error"); // Keep visible
        isStuck = true;
        stopBotLoop(); // Stop the loop if stuck
        return;
    }

    log("Scanning for actions...", "info"); // Keep visible
    // --- Attempt Interactive Elements ---
    // Set flag before trying actions, unset if none are found/handled
    isActionInProgress = true;
    if (handleInteractiveElements()) {
        // An interactive element was found and handled, reset timer and exit loop iteration
        lastActivityTimestamp = Date.now();
        // isActionInProgress remains true until the action's callback sets it to false
        log("Interactive element handled.", "event");
        return;
    }

    // --- No Interactive Elements Found, Try Navigation ---
    isActionInProgress = false; // Reset flag as no interactions were handled
    log("No interactive elements found, trying navigation.", "system");
    handleNavigation(); // handleNavigation will set isActionInProgress if it clicks something
}

// --- Start/Stop Bot Loop Control Functions ---
function startBotLoop() {
    log("startBotLoop function called.", "event"); // Add log
    if (isBotLoopRunning) {
        log("Bot loop already running.", "system");
        return;
    }
    log("Start signal received. Engaging bot loop.", "success"); // Keep visible
    isBotLoopRunning = true;
    isStuck = false; // Reset stuck state
    lastActivityTimestamp = Date.now(); // Reset timer
    lastPageHTML = ''; // Force initial DOM check
    runBot.botLoopPausedLogged = false; // Allow "Bot loop active" log to appear
    // Clear previous interval just in case
    if (botLoopIntervalId) clearInterval(botLoopIntervalId);
    // Start the main loop interval
    log("Starting setInterval for runBot.", "system");
    botLoopIntervalId = setInterval(runBot, 2000); // Check every 2 seconds
    runBot(); // Run immediately once
}

function stopBotLoop() {
    log("stopBotLoop function called.", "event"); // Add log
    if (!isBotLoopRunning && !botLoopIntervalId) return; // Already stopped
    log("Stopping bot loop.", "system"); // Keep visible
    isBotLoopRunning = false;
    if (botLoopIntervalId) {
        clearInterval(botLoopIntervalId);
        botLoopIntervalId = null;
        log("Cleared bot loop interval.", "system");
    }
    // Also reset action/stuck flags immediately
    isActionInProgress = false;
    isStuck = false; // Ensure bot isn't considered stuck after being told to stop
}

// --- Message Listener (from popup) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log(`Message received in content script: action=${request.action}`, "event"); // Add log
    if (request.action === "startBot") {
        startBotLoop();
        sendResponse({ status: "started" }); // Confirm start
        return true; // Indicate async response is possible/handled
    }
    // Keep listener open if other async messages are expected in the future
    // return true;
});


// --- Initialization ---
// Log script injection, try to get username, start command checker
(function initialize() {
    createLogGUI(); // Create log window immediately
    log("Content script injected. Waiting for 'Start Bot' signal.", "system"); // Keep visible
    getUsernameFromPage(); // Attempt to get username right away
    // Start checking for commands immediately and continuously
    log("Starting command checker interval.", "system");
    if (commandCheckIntervalId) clearInterval(commandCheckIntervalId); // Clear old interval if any
    commandCheckIntervalId = setInterval(checkServerForCommands, 3000); // Check every 3 seconds
})();


// --- Action Handlers ---

function removeDistractions() {
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(button => {
        const buttonText = (button.innerText || '').toLowerCase();
        const buttonId = (button.id || '').toLowerCase();
        if (buttonId === 'nav-menu-button' || (buttonId.includes('menu') || buttonText.includes('menu'))) {
            if (document.body.contains(button)) { // Check if still in DOM
                log(`Destroyed distracting '${button.innerText.trim()}' button (ID: ${button.id}).`, "system"); // Keep visible
                button.remove();
            }
        }
    });
}

function removeResetButtons() {
    const buttons = document.querySelectorAll('button.reset, button.assessment__btn--retry');
    buttons.forEach(button => {
        if (button.innerText.toLowerCase().includes('start over') || button.innerText.toLowerCase().includes('retry')) {
            if (document.body.contains(button)) {
                log(`Destroyed '${button.innerText}' button.`, "system"); // Keep visible
                button.remove();
            }
        }
    });
}

function handleInteractiveElements() {
    // Order matters - try the most specific/blocking actions first
    if (solveNewApiQuiz()) return true;
    if (solveRankingPuzzle()) return true;
    if (solveDragAndDropPuzzle()) return true;
    if (solveQuizQuestion()) return true;
    if (clickNextAccordion()) return true;
    if (clickNextFlipCard()) return true;
    if (clickNextHotspot()) return true;
    if (clickNextTab()) return true;
    if (clickNextModalButton()) return true; // Modals often block other interactions
    if (answerRatingQuestion()) return true;
    if (answerGenericChoice()) return true; // Least specific choice interaction

    return false; // No interactive element handled
}

function handleNavigation() {
    const navSelectors = [
        'button.assessment__btn--finish:not([disabled])',          // Finish Assessment button
        'button[data-action-target="next-arrow"]:not([disabled])', // Right arrow button
        'button[data-action-target="navigate-forward"]:not([disabled])', // Generic forward nav
        'button.modal__close',                                    // Close modal button (if others missed it)
        'button[data-action-target="button"]:not([disabled])',    // General purpose action button
        'button.assessment__btn--next:not([disabled])',           // Standard Next/Continue button
        'button.button--primary:not([disabled])',                 // Common primary button style
        'button.btn--primary:not([disabled])',                    // Another primary button style
    ];

    for (const selector of navSelectors) {
        const button = document.querySelector(selector);
        // Ensure button exists, is in the DOM, is visible, and hasn't been deemed a dud
        if (button && document.body.contains(button) && button.offsetParent !== null && !dudNavButtons.includes(button)) {
            const buttonText = (button.innerText || button.getAttribute('aria-label') || '').trim();
            log(`Found nav button by selector '${selector}' [${buttonText}]. Clicking.`, "success"); // Visible log
            dudNavButtons.push(button); // Assume it's a dud until page changes
            simulateRealClick(button);
            isActionInProgress = true; // Mark action in progress
            lastActivityTimestamp = Date.now(); // Reset timer on successful click
            setTimeout(()=> isActionInProgress = false, 800); // Allow brief time for page reaction
            return; // Stop after clicking one button
        }
    }

    // Fallback: Find button by text if selectors fail
    const navKeywords = ['continue', 'next', 'start', 'finish', 'submit', 'done', 'okay', 'got it'];
    const navButtonByText = findClickableButton(navKeywords);
    if (navButtonByText && !dudNavButtons.includes(navButtonByText)) {
         const buttonText = (navButtonByText.innerText || navButtonByText.value || navButtonByText.getAttribute('aria-label')).trim();
        log(`Found nav button by text: "${buttonText}". Clicking.`, "success"); // Visible log
        dudNavButtons.push(navButtonByText);
        simulateRealClick(navButtonByText);
        isActionInProgress = true;
        lastActivityTimestamp = Date.now();
        setTimeout(()=> isActionInProgress = false, 800);
        return;
    }

    // If we reach here, no navigation button was clicked in this cycle
    log("No navigation button found.", "system"); // Add log for debugging
}


function simulateRealClick(element) {
    if (!element || !document.body.contains(element)) {
        log("Attempted to click a non-existent or removed element.", "error"); // Keep visible
        return;
    }
    try {
        element.focus();
        const dispatchMouseEvent = (type, elem) => {
            // Check again if element exists before dispatching
            if (!elem || !document.body.contains(elem)) return;
            const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
            elem.dispatchEvent(event);
        };
        dispatchMouseEvent('mouseover', element); // Add mouseover for potential hover effects
        dispatchMouseEvent('mousedown', element);
        dispatchMouseEvent('mouseup', element);
        // Only call .click() if it's still in the DOM after potential mousedown/mouseup handlers
        if (document.body.contains(element)) {
            element.click();
        }
        element.blur();
    } catch (e) {
        log(`Error during simulated click: ${e.message}`, "error"); // Keep visible
    }
}

function findClickableButton(keywords) {
    const elements = document.querySelectorAll('a, button, input[type="submit"], [role="button"]');
    for (const el of elements) {
        // Check visibility (offsetParent), ensure it's in the DOM, and not disabled
        if (document.body.contains(el) && !el.disabled && el.offsetParent !== null) {
            const textContent = (el.innerText || '').trim().toLowerCase();
            const valueContent = (el.value || '').trim().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').trim().toLowerCase();
            // Check if any keyword matches the start of any text source
            if (keywords.some(keyword => textContent.startsWith(keyword) || valueContent.startsWith(keyword) || ariaLabel.startsWith(keyword))) {
                 return el; // Return the first match
            }
        }
    }
    return null; // No matching button found
}


function solveNewApiQuiz() {
    const container = document.querySelector('div#questionContainer');
    if (!container || !document.body.contains(container)) return false; // Ensure container exists

    const questionElement = container.querySelector('p.question_text');
    const optionLabels = Array.from(container.querySelectorAll('label.answer_text'));

    if (questionElement && optionLabels.length > 0) {
        const questionText = questionElement.innerText.trim();
        if (answeredQuizQuestions.includes(questionText)) {
            return false; // Already answered
        }

        const username = getUsernameFromPage();
        if (!username) { log("Halting: Username not found for API call.", "error"); isStuck = true; return true; }

        log("PRIORITY 1: Found new API quiz format. Engaging AI solver.", "success"); // Visible log

        const options = optionLabels.map(label => label.innerText.trim());

        log(`Sending question to server: "${questionText.substring(0, 50)}..."`, "system"); // Visible log
        chrome.runtime.sendMessage({ action: "solveQuiz", username, question: questionText, options, tableData: '', incorrectOptions: [] }, (response) => {
             // Check for runtime errors (like extension reload)
             if (chrome.runtime.lastError) {
                 log(`Error contacting background script: ${chrome.runtime.lastError.message}`, "error");
                 isStuck = true; isActionInProgress = false; return;
             }
            if (!response || response.error) {
                log(`Server error during quiz solve: ${response?.error || 'Unknown'}. Halting.`, "error");
                isStuck = true;
                isActionInProgress = false;
                return;
            }
            log(`Server suggests: ${response.answer}`, "system"); // Visible log

             let targetLabel = null;
             const cleanAiAnswer = response.answer.toLowerCase().replace(/\s+/g, ' ').trim();

             targetLabel = optionLabels.find(label => label.innerText.trim().toLowerCase().replace(/\s+/g, ' ') === cleanAiAnswer);
             if (!targetLabel) {
                 targetLabel = optionLabels.find(label => {
                     const labelText = label.innerText.trim().toLowerCase().replace(/\s+/g, ' ');
                     return (labelText.length > 0 && cleanAiAnswer.length > 0) &&
                            (labelText.includes(cleanAiAnswer) || cleanAiAnswer.includes(labelText));
                 });
             }
            if (!targetLabel) {
                 log(`AI answer "${response.answer}" didn't match. Defaulting to first option.`, "warning"); // Visible log
                 targetLabel = optionLabels[0];
            }

            answeredQuizQuestions.push(questionText);
            const answerContainer = targetLabel.closest('div.assessment_answer.radio');
            if (answerContainer && document.body.contains(answerContainer)) { // Check if still exists
                log(`Selecting answer: "${targetLabel.innerText.trim()}".`, "success"); // Visible log
                simulateRealClick(answerContainer);
            } else {
                 log(`Could not find parent container for answer: "${targetLabel.innerText.trim()}". It might have changed.`, "error");
            }
            // Reset flag after a delay allowing for UI updates
            setTimeout(() => { isActionInProgress = false; }, 1800);
        });
        return true; // Indicate action initiated
    }
    return false;
}


function solveRankingPuzzle() {
    const container = document.querySelector('.drag-and-drop[id*="sortable"]');
    if (container && container.offsetParent !== null && container.querySelector('[data-rank="true"]') && !container.dataset.solved) {
        log("PRIORITY 1: Found Ranking Puzzle. Executing brute-force.", "success"); // Visible log
        container.dataset.solved = 'true';

        const draggables = Array.from(container.querySelectorAll('[data-action-target="draggable"]'));
        const dropzones = Array.from(container.querySelectorAll('.dropzone'));
        if (draggables.length === 0 || dropzones.length === 0) { log("Could not find items/zones for ranking puzzle.", "error"); isActionInProgress = false; return true; }
        const items = draggables.map(d => (d.querySelector('.description') || d).innerText.trim());

        let permutations;
        if (container.dataset.permutations) {
            try { permutations = JSON.parse(container.dataset.permutations); } catch (e) { permutations = null; }
        }
        if (!permutations) {
            const generatePermutations = arr => {
                if (arr.length > 8) return []; // Limit permutation generation to avoid freezing
                const result = [];
                const permute = (current, remaining) => {
                    if (remaining.length === 0) {
                        result.push(current);
                        return;
                    }
                    for (let i = 0; i < remaining.length; i++) {
                        permute(current.concat(remaining[i]), remaining.slice(0, i).concat(remaining.slice(i + 1)));
                    }
                };
                permute([], arr);
                return result;
            };
            permutations = generatePermutations(items);
             if (permutations.length === 0 && items.length > 8) {
                 log("Ranking puzzle too large (>8 items) for brute-force. Halting.", "error");
                 isStuck = true; isActionInProgress = false; return true;
             }
            container.dataset.permutations = JSON.stringify(permutations);
        }

        let attempt = parseInt(container.dataset.attempt || '0');
        if (attempt >= permutations.length) { log("All ranking permutations exhausted. Halting.", "error"); isStuck = true; isActionInProgress = false; return true; }

        const currentPermutation = permutations[attempt];
        log(`Executing Ranking Attempt #${attempt + 1}/${permutations.length}: [${currentPermutation.join(', ')}]`, "system"); // Visible log

        let delay = 0;
        currentPermutation.forEach((itemName, index) => {
            const itemElement = draggables.find(d => (d.querySelector('.description') || d).innerText.trim() === itemName);
            const targetZone = dropzones[index];
            if (itemElement && targetZone) { setTimeout(() => simulateDragDrop(itemElement, targetZone), delay); delay += 300; }
            else log(`Error finding item "${itemName}" or zone ${index} for permutation.`, "error");
        });

        container.dataset.attempt = attempt + 1;
        setTimeout(() => {
            const submitButton = findClickableButton(['submit']);
            if (submitButton) { log("Submitting ranking permutation.", "system"); simulateRealClick(submitButton); } // Visible log
            else log("Could not find submit button after ranking.", "warning");
            setTimeout(() => isActionInProgress = false, 1500); // Allow feedback time
        }, delay + 500);
        return true;
    }
    return false;
}


function solveDragAndDropPuzzle() {
    const container = document.querySelector('.drag-and-drop:not([id*="sortable"])');
    if (container && container.offsetParent !== null && !container.classList.contains('all-completed')) {
        log("PRIORITY 1: Match on `.drag-and-drop`. Executing solver.", "success"); // Visible log
        container.classList.add('all-completed');

        const puzzleId = container.id;
        if (puzzleId && ANSWER_KEY[puzzleId]) {
            log(`PRIORITY 0: Found hardcoded answer for puzzle ID "${puzzleId}".`, "success"); // Visible log
            const solution = ANSWER_KEY[puzzleId];
            const draggables = Array.from(container.querySelectorAll('[data-action-target="draggable"]'));
            const dropzones = Array.from(container.querySelectorAll('.dropzone'));
            if (draggables.length === 0 || dropzones.length === 0) { log("Could not find items/zones for hardcoded D&D.", "error"); isActionInProgress = false; return true; }
            let delay = 0;
            draggables.forEach(item => {
                const itemNameElement = item.querySelector('.description') || item;
                const itemName = itemNameElement.innerText.trim();
                const targetZoneName = solution[itemName];
                if (targetZoneName) {
                    const zone = dropzones.find(z => (z.querySelector('.description, h2, h3, h4')?.innerText.trim() || '').includes(targetZoneName));
                    if (zone) {
                        setTimeout(() => simulateDragDrop(item, zone.querySelector('[data-action-target="container"]') || zone), delay);
                        delay += 250;
                    } else {
                         log(`Could not find target zone "${targetZoneName}" for item "${itemName}".`, "warning");
                    }
                } else {
                     log(`Item "${itemName}" not found in hardcoded solution for ${puzzleId}.`, "warning");
                }
            });
            setTimeout(() => { const sb = findClickableButton(['submit']); if (sb) simulateRealClick(sb); setTimeout(() => isActionInProgress = false, 1500); }, delay + 500);
        } else {
            log("No hardcoded answer found. Engaging AI.", "system"); // Visible log
            if (container.dataset.aiAttempted === 'true') { log("AI already attempted for this D&D. Halting.", "error"); isStuck = true; isActionInProgress = false; return true; }
            container.dataset.aiAttempted = 'true';
            const username = getUsernameFromPage();
            if (!username) { log("Halting: Username not found for API.", "error"); isStuck = true; isActionInProgress = false; return true; }
            solveDragAndDropWithAI(container, username);
        }
        return true;
    }
    return false;
}


function solveQuizQuestion() {
    const questionElement = document.querySelector('legend.assessment-question__title');
    if (questionElement && document.body.contains(questionElement) && !questionElement.dataset.solved) {
        log("PRIORITY 1: Match on standard quiz format. Checking type.", "system"); // Visible log
        questionElement.dataset.solved = 'true';
        let isApiNeeded = false;
        const quizBlock = questionElement.closest('.assessment-question');
        const quizContainer = questionElement.closest('.elevation-2, .layout, #assessment-container_c433, body');
        const headerElement = quizContainer ? quizContainer.querySelector('h1[data-action-target="header"], h1') : null;
        if (headerElement && document.body.contains(headerElement)) {
            const headerText = headerElement.innerText.toLowerCase();
            const criticalKeywords = ['quiz', 'test', 'post-assessment', 'what did you learn', 'assessment', 'knowledge check'];
            if (criticalKeywords.some(keyword => headerText.includes(keyword))) {
               isApiNeeded = true;
               log(`Reason for AI: Found critical header "${headerElement.innerText}".`, "system"); // Visible log
            }
        }
        if (!isApiNeeded && quizBlock) {
             const progressWrapper = quizBlock.closest('.one-at-a-time-wrapper, .one-at-a-time-container');
             if (progressWrapper && progressWrapper.querySelector('.assessment-question__progress')) {
                 isApiNeeded = true;
                 log(`Reason for AI: Found progress indicator.`, "system"); // Visible log
             }
        }

        if (isApiNeeded) {
            log(`Critical assessment detected. Engaging AI solver.`, "success"); // Visible log
            const username = getUsernameFromPage();
            if (!username) { log("Halting: Username not found for API.", "error"); isStuck = true; isActionInProgress = false; return true; }
            solveQuizWithAI(questionElement, username);
        } else {
            log("Simple question detected. Selecting first option.", "system"); // Visible log
            const firstOption = quizBlock ? quizBlock.querySelector('label.choices__label:not(.choices__label--disabled)') : null;
            if (firstOption && document.body.contains(firstOption)) {
                simulateRealClick(firstOption);
                log(`Clicked first option: "${(firstOption.querySelector('.choices__label-title') || firstOption).innerText.trim()}"`, "event"); // Visible log
                setTimeout(() => {
                    const submitButton = findClickableButton(['submit']);
                    if (submitButton) {
                        simulateRealClick(submitButton);
                    } else {
                        const nextButton = findClickableButton(['next', 'continue']);
                        if (nextButton) simulateRealClick(nextButton);
                    }
                    setTimeout(() => isActionInProgress = false, 1500); // Allow feedback time
                }, 1000);
            } else {
                 log("Could not find selectable options for simple question.", "error");
                isActionInProgress = false;
            }
        }
        return true;
    }
    return false;
}


function clickNextAccordion() {
    const el = document.querySelector('button[data-action-target="accordion"][aria-label*="collapsed"]:not([disabled])');
    if (el && el.offsetParent !== null) { log("PRIORITY 1.5: Found unclicked accordion.", "success"); simulateRealClick(el); setTimeout(() => isActionInProgress = false, 1200); return true; } return false;
}
function clickNextFlipCard() {
    const el = document.querySelector('button[data-action-target="flipcard"][aria-label*="Unflipped"]:not([disabled])');
    if (el && el.offsetParent !== null) { log("PRIORITY 1.6: Found unflipped card.", "success"); simulateRealClick(el); setTimeout(() => isActionInProgress = false, 1200); return true; } return false;
}
function clickNextHotspot() {
    const el = Array.from(document.querySelectorAll('button.btn-hotspot[aria-expanded="false"]:not([disabled])')).find(h => h.offsetParent !== null && !clickedHotspots.includes(h));
    if (el) { log("PRIORITY 1.7: Found unclicked hotspot.", "success"); clickedHotspots.push(el); simulateRealClick(el); setTimeout(() => isActionInProgress = false, 1200); return true; } return false;
}
function clickNextTab() {
    const el = Array.from(document.querySelectorAll('button[data-action-target="tab"][aria-label*="Not completed"]:not([disabled])')).find(t => t.offsetParent !== null && !clickedTabs.includes(t));
    if (el) { log("PRIORITY 1.8: Found unclicked tab.", "success"); clickedTabs.push(el); simulateRealClick(el); setTimeout(() => isActionInProgress = false, 1200); return true; } return false;
}
function clickNextModalButton() {
    const el = Array.from(document.querySelectorAll('button[data-actiontype="open_modal"]:not([disabled])')).find(b => b.offsetParent !== null && !clickedModals.includes(b));
    if (el) { log("PRIORITY 1.9: Found modal button.", "success"); clickedModals.push(el); simulateRealClick(el); setTimeout(() => isActionInProgress = false, 1200); return true; } return false;
}
function answerRatingQuestion() {
    const el = Array.from(document.querySelectorAll('div.choices--rating fieldset.choices__fieldset')).find(f => f.offsetParent !== null && !f.querySelector('input[type="radio"]:checked'));
    if (el) { log("PRIORITY 1.10: Found unanswered star rating.", "success"); const star = el.querySelector('label.choices__label'); if (star) simulateRealClick(star); setTimeout(() => isActionInProgress = false, 1000); return true; } return false;
}
function answerGenericChoice() {
    const el = Array.from(document.querySelectorAll('.choices__list, fieldset')).find(c => c.offsetParent !== null && !c.closest('.choices--rating') && c.querySelector('input[type="radio"]') && !c.querySelector('input[type="radio"]:checked') && !c.closest('#questionContainer') && !c.closest('.assessment-question') && !c.dataset.solved);
    if (el) { log("PRIORITY 1.11: Found unanswered generic choice.", "success"); const label = el.querySelector('label.qs-choices__label, label.choices__label'); if (label) { simulateRealClick(label); el.dataset.solved = 'true'; } setTimeout(() => isActionInProgress = false, 1000); return true; } return false;
}


function solveDragAndDropWithAI(container, username) {
    const draggables = Array.from(container.querySelectorAll('[data-action-target="draggable"]')); const dropzones = Array.from(container.querySelectorAll('.dropzone'));
    if (draggables.length === 0 || dropzones.length === 0) { log("Could not find items/zones for AI D&D.", "error"); isStuck = true; isActionInProgress = false; return; }
    const items = draggables.map(d => d.innerText.trim()).filter(Boolean); const zones = dropzones.map(z => z.querySelector('.description, h2, h3, h4')?.innerText.trim() || `Zone ${dropzones.indexOf(z) + 1}`).filter(Boolean);
    if (items.length === 0 || zones.length === 0) { log("Found empty items/zones for AI D&D.", "error"); isStuck = true; isActionInProgress = false; return; }
    log("Sending D&D problem to server...", 'system'); // Visible log
    chrome.runtime.sendMessage({ action: "solveDragAndDropWithAI", username, items, zones, hint: "" }, (response) => {
         if (chrome.runtime.lastError) { log(`Error contacting background script: ${chrome.runtime.lastError.message}`, "error"); isStuck = true; isActionInProgress = false; return; }
        if (!response || response.error) { log(`Server error (D&D): ${response?.error || 'Unknown'}. Halting.`, "error"); isStuck = true; isActionInProgress = false; return; }
        if (!Array.isArray(response.solution) || response.solution.some(item => typeof item.item !== 'string' || typeof item.zoneIndex !== 'number')) { log("Invalid D&D solution structure from server.", "error"); isStuck = true; isActionInProgress = false; return; }
        log("Received AI D&D solution. Executing drags.", 'success'); // Visible log
        let delay = 0;
        response.solution.forEach(placement => {
            const itemEl = draggables.find(d => d.innerText.trim() === placement.item);
            const zoneEl = placement.zoneIndex >= 0 && placement.zoneIndex < dropzones.length ? dropzones[placement.zoneIndex] : null;
            if (itemEl && zoneEl) {
                 const dropTarget = zoneEl.querySelector('[data-action-target="container"]') || zoneEl;
                 if (dropTarget) {
                     setTimeout(() => simulateDragDrop(itemEl, dropTarget), delay);
                     delay += 250;
                 } else log(`AI D&D error: Could not find drop target in zone ${placement.zoneIndex}.`, "error");
            } else log(`AI D&D error: Item "${placement.item}" or zone index ${placement.zoneIndex} invalid.`, "error");
        });
        setTimeout(() => {
             const submitButton = findClickableButton(['submit']);
             if (submitButton) simulateRealClick(submitButton);
             else log("No submit button found after AI D&D.", "warning");
             setTimeout(() => isActionInProgress = false, 1500); // Allow feedback time
        }, delay + 500);
    });
    // Action initiated, isActionInProgress remains true until callback finishes
}


function solveQuizWithAI(questionElement, username) {
    const quizBlock = questionElement.closest('.assessment-question__block'); if (!quizBlock) { log("Could not find quiz block for AI.", "error"); isActionInProgress = false; return; }
    const optionElements = Array.from(quizBlock.querySelectorAll('label.choices__label')); if (optionElements.length === 0) { log("Could not find options for AI quiz.", "error"); isActionInProgress = false; return; }
    const question = questionElement.innerText.trim(); const options = optionElements.map(el => (el.querySelector('.choices__label-title') || el).innerText.trim()); let tableData = ''; const tableElement = document.querySelector('table.table'); if (tableElement) { const rows = Array.from(tableElement.querySelectorAll('tr')); tableData = rows.map(row => Array.from(row.querySelectorAll('th, td')).map(cell => `"${cell.innerText.trim().replace(/\s+/g, ' ')}"`).join(', ')).join('\n'); }
    log(`Sending question to server: "${question.substring(0, 50)}..."`, "system"); // Visible log
    chrome.runtime.sendMessage({ action: "solveQuiz", username, question, options, tableData, incorrectOptions: [] }, (response) => {
         if (chrome.runtime.lastError) { log(`Error contacting background script: ${chrome.runtime.lastError.message}`, "error"); isStuck = true; isActionInProgress = false; return; }
        if (!response || response.error) { log(`Server error (Quiz): ${response?.error || 'Unknown'}. Halting.`, "error"); isStuck = true; isActionInProgress = false; return; }
        log(`Server suggests: ${response.answer}`, "system"); // Visible log
        let targetOption = null; const cleanAiAnswer = response.answer.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,!?;:]$/, '');
        targetOption = optionElements.find(o => (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,!?;:]$/, '') === cleanAiAnswer);
        if (!targetOption) targetOption = optionElements.find(o => { const ot = (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().replace(/\s+/g, ' ').trim(); return (ot.length > 3 && cleanAiAnswer.includes(ot)) || (cleanAiAnswer.length > 3 && ot.includes(cleanAiAnswer)); });
        if (!targetOption) { const allK = ["all of the above", "all choices are correct"]; const noneK = ["none of the above", "no choices are correct"]; if (allK.some(k => cleanAiAnswer.includes(k))) targetOption = optionElements.find(o => allK.some(k => (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().includes(k))); else if (noneK.some(k => cleanAiAnswer.includes(k))) targetOption = optionElements.find(o => noneK.some(k => (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().includes(k))); }
        if (!targetOption) { log(`AI answer "${response.answer}" didn't match. Defaulting to first option.`, "warning"); targetOption = optionElements[0]; } // Visible log
        const optionText = (targetOption.querySelector('.choices__label-title') || targetOption).innerText.trim(); log(`Selecting answer: "${optionText}".`, "success"); simulateRealClick(targetOption); // Visible log
        setTimeout(() => {
            const wrapper = quizBlock.closest('.one-at-a-time-wrapper, .one-at-a-time-container'); if (!wrapper) { log("Could not find quiz wrapper.", "error"); isActionInProgress = false; return; }
            const submitButton = wrapper.querySelector('button.assessment__btn--submit');
            if (submitButton && !submitButton.disabled && document.body.contains(submitButton)) {
                log("Clicking Submit button.", "system"); simulateRealClick(submitButton); // Visible log
                setTimeout(() => {
                    const currentWrapper = quizBlock.closest('.one-at-a-time-wrapper, .one-at-a-time-container'); if (!currentWrapper) { isActionInProgress = false; return; }
                    const continueButton = currentWrapper.querySelector('button.assessment__btn--next');
                    if (continueButton && !continueButton.disabled && continueButton.offsetParent !== null) { log("Answer correct. Clicking Continue.", "success"); simulateRealClick(continueButton); isActionInProgress = false; return; } // Visible log
                    const retryButton = currentWrapper.querySelector('button.assessment__btn--retry'); const feedbackElement = currentWrapper.querySelector('.assessment-feedback, [class*="feedback"]'); const isRetryVisible = retryButton && !retryButton.disabled && retryButton.offsetParent !== null; const isFeedbackVisible = feedbackElement && feedbackElement.offsetParent !== null && feedbackElement.innerText.trim().length > 0;
                    if (isRetryVisible || isFeedbackVisible) {
                        log("AI answer was incorrect. Defaulting to first option as second guess.", "error"); const firstOption = optionElements[0]; simulateRealClick(firstOption); // Visible log
                        setTimeout(() => {
                             const submitButtonAgain = currentWrapper.querySelector('button.assessment__btn--submit');
                             if (submitButtonAgain && !submitButtonAgain.disabled && document.body.contains(submitButtonAgain)) {
                                log("Clicking Submit button (Attempt 2).", "system"); simulateRealClick(submitButtonAgain); // Visible log
                                setTimeout(() => {
                                    const finalContinue = currentWrapper.querySelector('button.assessment__btn--next');
                                    if (finalContinue && !finalContinue.disabled && finalContinue.offsetParent !== null) { log("Clicking Continue (after 2nd guess).", "system"); simulateRealClick(finalContinue); } // Visible log
                                    else { log("No Continue button after 2nd guess. Forcing nav click.", "warning"); handleNavigation(); }
                                    isActionInProgress = false;
                                }, 2500);
                            } else { log("Submit button not available for 2nd guess. Forcing nav click.", "error"); handleNavigation(); isActionInProgress = false; }
                        }, 1000);
                    } else { log("No clear correct/incorrect feedback after submit. Clicking Continue if available.", "warning"); if (continueButton && continueButton.offsetParent !== null) simulateRealClick(continueButton); else handleNavigation(); isActionInProgress = false; }
                }, 2500);
            } else {
                 log("Submit button not found or disabled after selection.", "error");
                 const continueButton = wrapper.querySelector('button.assessment__btn--next');
                 if (continueButton && !continueButton.disabled && continueButton.offsetParent !== null) {
                     log("No submit button, but Continue is active. Clicking Continue.", "system"); // Visible log
                     simulateRealClick(continueButton);
                 } else { log("No submit or continue button found.", "error"); }
                 isActionInProgress = false;
            }
        }, 1200);
    });
    // Action initiated, isActionInProgress remains true until callback finishes
}


function simulateDragDrop(source, destination) {
     if (!source || !destination || !document.body.contains(source) || !document.body.contains(destination)) {
         silentLog("DragDrop Error: Element missing or removed from DOM."); // Silent log
         return;
     }
    const itemName = source.innerText.trim();
    silentLog(`--- Simulating Drag for "${itemName}" ---`); // Silent log
    const dataTransfer = new DataTransfer();
    const sRect = source.getBoundingClientRect();
    const dRect = destination.getBoundingClientRect();
     if (!sRect.width || !sRect.height || !dRect.width || !dRect.height) {
         silentLog(`DragDrop Error: Invalid element dimensions for "${itemName}".`); // Silent log
         return;
     }
    const sX = sRect.left + sRect.width / 2; const sY = sRect.top + sRect.height / 2;
    const dX = dRect.left + dRect.width / 2; const dY = dRect.top + dRect.height / 2;
    const cME = (t, x, y) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
    const cDE = (t, x, y) => new DragEvent(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, dataTransfer });
    try {
        source.dispatchEvent(cME('mousedown', sX, sY));
        source.dispatchEvent(cDE('dragstart', sX, sY));
        // Need slight delay for some browsers between drag events
        setTimeout(() => {
            destination.dispatchEvent(cDE('dragenter', dX, dY));
            destination.dispatchEvent(cDE('dragover', dX, dY));
            destination.dispatchEvent(cDE('drop', dX, dY));
            source.dispatchEvent(cDE('dragend', dX, dY));
            window.dispatchEvent(cME('mouseup', dX, dY)); // Dispatch mouseup globally
            silentLog(`--- Drag simulation for "${itemName}" complete. ---`); // Silent log
        }, 50); // 50ms delay
    } catch (e) {
        silentLog(`Error during drag simulation: ${e.message}`); // Silent log
    }
}


// ===================================
// TROLL FEATURE LOGIC (USES silentLog)
// ===================================

const VIDEO_URLS = {
    opening: "https://files.catbox.moe/67bs4u.mp4",
    idle:    "https://files.catbox.moe/dxwc7a.mp4",
    closing: "https://files.catbox.moe/d17taf.mp4"
};
const FADE_DURATION = 500; // ms for fade in/out
const OPEN_DELAY = 300; // ms delay after fade before opening eyes play
const CLOSE_DELAY = 300; // ms delay after closing eyes finish before fade starts

// Check server for commands and user status
function checkServerForCommands() {
    if (isStuck) return; // Don't check if bot thinks it's stuck

    const username = getUsernameFromPage();
    // Only proceed if username is available
    if (!username) {
        // Try getting username again just in case it loaded late
        getUsernameFromPage();
        if (!cachedUsername) {
            // Still no username, maybe log once silently?
            // silentLog("Username not available for command check.");
            return;
        }
    }

    // Use the potentially newly acquired cachedUsername
    chrome.runtime.sendMessage({ action: "checkCommand", username: cachedUsername }, (command) => {
        // Check if the extension context was invalidated (e.g., extension reload/update)
        if (chrome.runtime.lastError) {
            silentLog(`Error checking command: ${chrome.runtime.lastError.message}`); // Silent
            // If the context is invalidated, stop checking to prevent errors
            if (commandCheckIntervalId && chrome.runtime.lastError.message.includes("context invalidated")) {
                silentLog("Extension context invalidated. Stopping command checks."); // Silent
                clearInterval(commandCheckIntervalId);
                commandCheckIntervalId = null;
                stopBotLoop(); // This one WILL log to GUI
            }
            return;
        }

        // Process valid command from server
        if (command && command.command) {
            // Log received command silently UNLESS it's forceStop
            if (command.command !== "forceStop") {
                silentLog(`Received command: ${command.command}`); // Silent
            }
            // --- HANDLE FORCE STOP ---
            if (command.command === "forceStop") {
                log("Received forceStop command from server. Halting bot.", "error"); // KEEP VISIBLE
                stopBotLoop(); // Immediately stop the bot loop
                hideTrollOverlay(); // Hide troll overlay if it's showing
            } else {
                // Execute regular troll commands
                executeTrollCommand(command);
            }
        }
    });
}

// Execute troll commands
function executeTrollCommand(command) {
    // These calls use silentLog internally now
    switch (command.command) {
        case 'showEyes':
            showTrollOverlay(true); // Show video
            break;
        case 'showText':
            showTrollOverlay(false); // Show overlay, don't force video start immediately
            showTrollText(command.message);
            break;
        case 'hide':
            hideTrollOverlay();
            break;
        // forceStop is handled directly in checkServerForCommands
    }
}

// Show the main overlay (Refined)
function showTrollOverlay(playVideoImmediately = true) {
    let overlay = document.getElementById('troll-overlay');
    if (overlay) {
        // Already exists: Ensure fully opaque and blocking interactions
        overlay.style.transition = `opacity ${FADE_DURATION}ms ease-in-out`;
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';

        const video = document.getElementById('troll-video');
        if (video) {
             // If asked to play, and it's paused or not idle, switch to idle and play
             if (playVideoImmediately && (video.paused || !video.src.includes(new URL(VIDEO_URLS.idle).pathname))) {
                 video.src = VIDEO_URLS.idle;
                 video.loop = true;
                 video.play().catch(e => silentLog(`Error playing idle video: ${e.message}`)); // Silent
             }
        }
        return; // Don't recreate
    }

    silentLog("Executing: showTrollOverlay"); // Silent

    overlay = document.createElement('div');
    overlay.id = 'troll-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', // simpler top/left/width/height
        backgroundColor: 'rgb(0, 0, 0)', // Fully black
        zIndex: '2147483647', // Max z-index
        display: 'flex', justifyContent: 'flex-start', alignItems: 'center',
        flexDirection: 'column',
        opacity: '0', // Start hidden
        transition: `opacity ${FADE_DURATION}ms ease-in-out`,
        pointerEvents: 'auto' // Block clicks
    });

    const text = document.createElement('div');
    text.id = 'troll-text';
    Object.assign(text.style, {
        color: 'white', fontSize: '48px', fontWeight: 'bold', fontFamily: 'Arial, sans-serif',
        textShadow: '0 0 10px white', textAlign: 'center', maxWidth: '90%',
        marginTop: '10vh', marginBottom: '20px',
        pointerEvents: 'none', // Clicks pass through text
        opacity: '1' // Text visible immediately when overlay is
    });

    const video = document.createElement('video');
    video.id = 'troll-video';
    video.src = VIDEO_URLS.opening; // Default to opening
    video.autoplay = false; // Control play manually
    video.muted = true; // Required for most autoplay scenarios
    video.loop = false;
    video.playsInline = true; // iOS requirement
    Object.assign(video.style, {
        width: '100vw', height: '100vh', objectFit: 'cover',
        position: 'absolute', top: '0', left: '0',
        zIndex: '-1', // Behind text
        pointerEvents: 'none'
    });

     // Event Handling for seamless transitions
    video.onended = () => {
        const currentOverlay = document.getElementById('troll-overlay');
        const currentVideo = document.getElementById('troll-video');
        if (!currentOverlay || !currentVideo) return; // Abort if removed

        const openingPath = new URL(VIDEO_URLS.opening).pathname;
        const closingPath = new URL(VIDEO_URLS.closing).pathname;
        const currentPath = new URL(currentVideo.src).pathname;


        if (currentPath.includes(openingPath)) {
            // After opening finishes, switch to idle
            currentVideo.src = VIDEO_URLS.idle;
            currentVideo.loop = true;
            currentVideo.play().catch(e => silentLog(`Error playing idle video: ${e.message}`)); // Silent
        } else if (currentPath.includes(closingPath)) {
             // After closing finishes, wait for delay, then start fade out
             setTimeout(() => {
                 if (currentOverlay && document.body.contains(currentOverlay)) {
                     currentOverlay.style.opacity = '0';
                     // Remove AFTER fade out duration
                     setTimeout(() => {
                          if (currentOverlay && document.body.contains(currentOverlay)) {
                              currentOverlay.remove();
                              silentLog("Troll overlay removed."); // Silent
                          }
                     }, FADE_DURATION);
                 }
             }, CLOSE_DELAY);
        }
    };
    video.addEventListener('error', (e) => {
        silentLog('Video error: ' + (e.target?.error?.message || 'Unknown error')); // Silent
         // If opening video fails, maybe switch directly to idle?
         if (video.src.includes(new URL(VIDEO_URLS.opening).pathname)) {
            video.src = VIDEO_URLS.idle;
            video.loop = true;
            video.play().catch(err => silentLog(`Error playing idle after opening error: ${err.message}`)); // Silent
         }
         // If closing fails, trigger removal early
         else if (video.src.includes(new URL(VIDEO_URLS.closing).pathname)) {
             const currentOverlay = document.getElementById('troll-overlay');
             if (currentOverlay && document.body.contains(currentOverlay)) {
                 currentOverlay.style.opacity = '0';
                 setTimeout(() => { if (currentOverlay && document.body.contains(currentOverlay)) overlay.remove(); }, FADE_DURATION);
             }
         }
    });

    overlay.appendChild(text);
    overlay.appendChild(video);
    document.body.appendChild(overlay);

    // Fade in overlay, THEN play video after delay
    requestAnimationFrame(() => { // Ensure styles are applied before transition
        overlay.style.opacity = '1';
        if (playVideoImmediately) {
            setTimeout(() => {
                 // Check if overlay still exists before playing
                 const currentVideo = document.getElementById('troll-video');
                 if (currentVideo) {
                    currentVideo.play().catch(e => {
                        silentLog('Opening video play failed. Trying idle.'); // Silent
                        // If opening fails, immediately try idle
                        currentVideo.src = VIDEO_URLS.idle;
                        currentVideo.loop = true;
                        currentVideo.play().catch(err => silentLog(`Error playing idle after opening fail: ${err.message}`)); // Silent
                    });
                 }
            }, FADE_DURATION + OPEN_DELAY); // Wait for fade AND delay
        }
    });
}

// Show text (Refined)
function showTrollText(message) {
    const overlay = document.getElementById('troll-overlay');
    // Ensure overlay exists - showTrollOverlay creates it if needed
    if (!overlay) {
        showTrollOverlay(false); // Show overlay without starting opening video
    }

    // Use setTimeout to ensure textDiv is available after potential overlay creation
    setTimeout(() => {
        const textDiv = document.getElementById('troll-text');
        if (!textDiv) {
             silentLog("Could not find textDiv for showTrollText."); // Silent
             return;
        }

        silentLog(`Executing: showTrollText ("${message}")`); // Silent
        textDiv.textContent = message;
        textDiv.style.opacity = '1';

        // Ensure idle video is playing in the background when text is shown
        const video = document.getElementById('troll-video');
         if (video && (video.paused || !video.src.includes(new URL(VIDEO_URLS.idle).pathname))) {
             // Only switch to idle if not currently opening or closing
             if (!video.src.includes(new URL(VIDEO_URLS.opening).pathname) &&
                 !video.src.includes(new URL(VIDEO_URLS.closing).pathname)) {
                video.src = VIDEO_URLS.idle;
                video.loop = true;
                video.play().catch(e => silentLog(`Error playing idle for text: ${e.message}`)); // Silent
             }
         }
    }, 50); // Small delay to allow overlay creation if needed
}

// Hide overlay (Refined)
function hideTrollOverlay() {
    const overlay = document.getElementById('troll-overlay');
    if (!overlay) return; // Already hidden

    silentLog("Executing: hideTrollOverlay"); // Silent

    const video = document.getElementById('troll-video');
    const text = document.getElementById('troll-text');

    if (text) text.textContent = ''; // Clear text
    overlay.style.pointerEvents = 'none'; // Allow interactions immediately

    if (video) {
        // Stop any current playback forcefully before changing source
        video.pause();
        video.currentTime = 0; // Reset time

        video.src = VIDEO_URLS.closing;
        video.loop = false;
        video.muted = true;
        video.playsInline = true;

        // Re-assign onended specifically for this hide action
        video.onended = () => {
             const currentOverlay = document.getElementById('troll-overlay');
             if (!currentOverlay) return; // Already gone
             setTimeout(() => {
                 if (currentOverlay && document.body.contains(currentOverlay)) {
                     currentOverlay.style.opacity = '0';
                     setTimeout(() => {
                          if (currentOverlay && document.body.contains(currentOverlay)) {
                              currentOverlay.remove();
                              silentLog("Troll overlay removed."); // Silent
                          }
                     }, FADE_DURATION);
                 }
             }, CLOSE_DELAY);
        };

        // Attempt to play closing video
        // Use a short delay before playing closing to ensure source change registers
        setTimeout(() => {
             const currentVideo = document.getElementById('troll-video');
             if (currentVideo) {
                currentVideo.play().catch(e => {
                    silentLog('Closing video play failed. Fading immediately.'); // Silent
                    if (overlay && document.body.contains(overlay)) {
                        overlay.style.opacity = '0';
                        setTimeout(() => { if (overlay && document.body.contains(overlay)) overlay.remove(); }, FADE_DURATION);
                    }
                });
             }
        }, 50); // Small delay

    } else {
        // No video? Just fade and remove.
        if (overlay && document.body.contains(overlay)) {
            overlay.style.opacity = '0';
            setTimeout(() => { if (overlay && document.body.contains(overlay)) overlay.remove(); }, FADE_DURATION);
        }
    }

    // Absolute fallback removal in case something goes wrong
    setTimeout(() => {
        const currentOverlay = document.getElementById('troll-overlay');
        if (currentOverlay) currentOverlay.remove();
    }, 3000); // Remove after 3s regardless
}