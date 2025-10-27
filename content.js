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

// ============== Bot Logging GUI ==============

// ============== Bot Logging GUI ==============

function createLogGUI() {
    // <<< ADD THIS CHECK AT THE BEGINNING >>>
    // Only create GUI if the username is 'josh morey' (case-insensitive)
    if (!cachedUsername || cachedUsername.toLowerCase() !== 'josh morey') {
        // If GUI exists somehow (maybe from a previous session?), remove it
        const existingContainer = document.getElementById('everfi-bot-log-container');
        if (existingContainer) existingContainer.remove();
        return; // Do not create the GUI for other users
    }
    // <<< END ADDED CHECK >>>

    // Avoid creating multiple GUIs if already present for Josh Morey
    if (document.getElementById('everfi-bot-log-container')) return;

    // --- Original GUI creation code continues below ---
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

    // Apply styles (keep your existing styles)
    Object.assign(container.style, { /* ... your styles ... */ });
    const header = container.querySelector('.log-header');
    Object.assign(header.style, { /* ... your styles ... */ });
    const closeBtn = container.querySelector('#log-close-btn');
    Object.assign(closeBtn.style, { /* ... your styles ... */ });
    const logContent = container.querySelector('#log-content');
    Object.assign(logContent.style, { /* ... your styles ... */ });
    closeBtn.onclick = () => container.remove();

    // Draggable logic (keep your existing logic)
    /* ... your draggable logic ... */
}

function log(message, type = 'info') {
    const isDebugUser = cachedUsername && cachedUsername.toLowerCase() === 'josh morey';

    // <<< MODIFY GUI LOGGING PART >>>
    if (isDebugUser) {
        try {
            createLogGUI(); // Ensure GUI exists for the debug user
            const logContent = document.getElementById('log-content');
            if (logContent) { // Only proceed if GUI exists (it should for the debug user)
                const time = new Date().toLocaleTimeString();
                const p = document.createElement('p');
                let color = '#d4d4d4';
                if (type === 'error') color = '#f44747'; if (type === 'success') color = '#4caf50'; if (type === 'system') color = '#569cd6'; if (type === 'event') color = '#c586c0';
                const sanitizedMessage = message.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
                p.innerHTML = `<span style="color: #888;">[${time}]</span> <span style="color:${color};">${sanitizedMessage}</span>`;
                Object.assign(p.style, { margin: '0 0 5px 0', lineHeight: '1.4', wordBreak: 'break-word' });
                logContent.appendChild(p);
                logContent.scrollTop = logContent.scrollHeight;
            }
        } catch (logError) {
            console.error("Error occurred within log function (GUI part):", logError);
        }
    }
    // <<< END MODIFIED GUI LOGGING PART >>>

    // --- Keep console logging for ALL users for debugging ---
    console.log(`[EVERFI Bot - ${type.toUpperCase()}] ${message}`);
}


// ============== Bot Logic ==============

let lastActivityTimestamp = Date.now();
let lastPageHTML = '';
let isStuck = false;
let isActionInProgress = false;
let dudNavButtons = [], clickedHotspots = [], clickedTabs = [], clickedModals = [], answeredQuizQuestions = [];
const STUCK_TIMEOUT = 30000;
let cachedUsername = null; // Cache username
let isForceStopped = false;

// --- Get Username ---
function getUsernameFromPage() {
    if (cachedUsername) return cachedUsername;
    const userSpan = document.querySelector('span[data-login]');
    if (userSpan && userSpan.innerText) {
        cachedUsername = userSpan.innerText.trim();
        log(`Username found: ${cachedUsername}`, "system"); // Log finding it

        // <<< ADD THIS >>>
        // Immediately try to create the GUI if the user matches
        if (cachedUsername.toLowerCase() === 'josh morey') {
            createLogGUI();
        }
        // <<< END ADDED CALL >>>

        return cachedUsername;
    }
    return null;
}

log("Bot activated. Aggressive mode engaged.", "system");

// --- START BOT MAIN LOOPS ---
setInterval(runBot, 2000); // Main bot logic
setInterval(checkServerForCommands, 3000); // NEW: Troll checker
// ----------------------------

function removeDistractions() {
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(button => {
        const buttonText = (button.innerText || '').toLowerCase();
        const buttonId = (button.id || '').toLowerCase();
        if (buttonId === 'nav-menu-button' || (buttonId.includes('menu') || buttonText.includes('menu'))) {
            if (document.body.contains(button)) { // Check if still in DOM
                log(`Found and destroyed distracting '${button.innerText.trim()}' button (ID: ${button.id}).`, "system");
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
                log(`Found and destroyed '${button.innerText}' button.`, "system");
                button.remove();
            }
        }
    });
}

function runBot() {
    // Check if force stopped by admin FIRST
    if (isForceStopped) {
        if (!runBot.forceStoppedLogged) { log("Bot loop stopped by administrator.", "error"); runBot.forceStoppedLogged = true; }
        if (botMainIntervalId) { clearInterval(botMainIntervalId); botMainIntervalId = null; console.log("[EVERFI Bot - Admin] Cleared main bot interval due to forceStop."); }
        return;
    } else { runBot.forceStoppedLogged = false; }

    log("runBot triggered.", "event"); // Debug log remains

    if (document.getElementById('troll-overlay')) { if (!runBot.trollOverlayActiveLogged) { console.log("[EVERFI Bot - Admin] Troll overlay active, pausing bot actions."); runBot.trollOverlayActiveLogged = true; } return; } else { runBot.trollOverlayActiveLogged = false; }

    log("Bot active, proceeding...", "system"); // Debug log remains

    if (isStuck || isActionInProgress) { log(`runBot skipped: isStuck=${isStuck}, isActionInProgress=${isActionInProgress}`, "system"); return; }
    if (!cachedUsername) { getUsernameFromPage(); if (!cachedUsername) { log("Waiting for username...", "system"); return; } }

    removeResetButtons(); removeDistractions();

    const currentPageHTML = document.body.innerHTML;
    if (currentPageHTML !== lastPageHTML) {
        log("DOM change detected. Resetting...", "system");
        lastActivityTimestamp = Date.now(); lastPageHTML = currentPageHTML;
        dudNavButtons = []; clickedHotspots = []; clickedTabs = []; clickedModals = []; answeredQuizQuestions = [];
        isStuck = false; cachedUsername = null; getUsernameFromPage(); // Re-fetch username
    }
    if (Date.now() - lastActivityTimestamp > STUCK_TIMEOUT) {
        log(`HALT: No DOM change for ${STUCK_TIMEOUT / 1000}s. Bot stuck.`, "error");
        isStuck = true; isForceStopped = true; return; // Treat stuck as force stop
    }

    log("Scanning for actions...", "info");
    isActionInProgress = true;
    if (handleInteractiveElements()) { lastActivityTimestamp = Date.now(); log("Interactive element handled.", "event"); return; }
    isActionInProgress = false;
    log("No interactive elements found, trying navigation.", "system");
    handleNavigation();
}

function handleInteractiveElements() {
    if (solveNewApiQuiz()) return true;
    if (solveRankingPuzzle()) return true;
    if (solveDragAndDropPuzzle()) return true;
    if (solveQuizQuestion()) return true;
    if (clickNextAccordion()) return true;
    if (clickNextFlipCard()) return true;
    if (clickNextHotspot()) return true;
    if (clickNextTab()) return true;
    if (clickNextModalButton()) return true;
    if (answerRatingQuestion()) return true;
    if (answerGenericChoice()) return true;
    return false;
}

function handleNavigation() {
    const navSelectors = [
        'button.assessment__btn--finish',
        'button[data-action-target="next-arrow"]',
        'button[data-action-target="navigate-forward"]',
        'button[data-action-target="button"]',
        'button.assessment__btn--next:not([disabled])' // Only click enabled Continue buttons
    ];

    for (const selector of navSelectors) {
        const button = document.querySelector(selector);
        if (button && document.body.contains(button) && !button.disabled && !dudNavButtons.includes(button)) {
            log(`Found button by selector '${selector}'. Clicking.`, "success");
            dudNavButtons.push(button);
            simulateRealClick(button);
            return;
        }
    }

    const navButtonByText = findClickableButton(['continue', 'start', 'next', 'finish', 'submit']);
    if (navButtonByText && document.body.contains(navButtonByText) && !dudNavButtons.includes(navButtonByText)) {
        log(`Found button by text: "${(navButtonByText.innerText || navButtonByText.value).trim()}". Clicking.`, "success");
        dudNavButtons.push(navButtonByText);
        simulateRealClick(navButtonByText);
        return;
    }
}

// --- Helper Functions ---

function simulateRealClick(element) {
    if (!element || !document.body.contains(element)) {
        log("Attempted to click a non-existent element.", "error");
        return;
    }
    element.focus();
    const dispatchMouseEvent = (type, elem) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
        elem.dispatchEvent(event);
    };
    dispatchMouseEvent('mousedown', element);
    dispatchMouseEvent('mouseup', element);
    element.click();
    element.blur();
}

function findClickableButton(keywords) {
    const elements = document.querySelectorAll('a, button, input[type="submit"]');
    for (const el of elements) {
        // Check visibility and if it's within the main document body
        if (document.body.contains(el) && !el.disabled && el.offsetParent !== null) {
            const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
            if (text && keywords.some(keyword => text.startsWith(keyword))) {
                 return el;
            }
        }
    }
    return null;
}

// --- Puzzle and Interaction Solvers ---

function solveNewApiQuiz() {
    const container = document.querySelector('div#questionContainer');
    if (!container) return false;

    const questionElement = container.querySelector('p.question_text');
    const optionLabels = Array.from(container.querySelectorAll('label.answer_text'));

    if (questionElement && optionLabels.length > 0) {
        const questionText = questionElement.innerText.trim();
        if (answeredQuizQuestions.includes(questionText)) {
            return false; // Already answered this specific question on this page load
        }

        const username = getUsernameFromPage();
        if (!username) {
            log("Halting: Username not found for API call.", "error");
            isStuck = true; return true; // Mark as handled to prevent other actions
        }

        log("PRIORITY 1: Found new API quiz format. Engaging AI solver.", "success");
        isActionInProgress = true;

        const options = optionLabels.map(label => label.innerText.trim());

        log(`Sending question to server: "${questionText.substring(0, 50)}..."`);
        chrome.runtime.sendMessage({ action: "solveQuiz", username, question: questionText, options, tableData: '', incorrectOptions: [] }, (response) => {
            if (!response || response.error) {
                log(`Server error: ${response?.error || 'Unknown'}. Halting.`, "error");
                isStuck = true;
                isActionInProgress = false;
                return;
            }
            log(`Server suggests: ${response.answer}`);

             let targetLabel = null;
             const cleanAiAnswer = response.answer.toLowerCase().replace(/\s+/g, ' ').trim();

             // Exact match first
             targetLabel = optionLabels.find(label => {
                 const labelText = label.innerText.trim().toLowerCase().replace(/\s+/g, ' ');
                 return labelText === cleanAiAnswer;
             });

             // Then containment check
             if (!targetLabel) {
                 targetLabel = optionLabels.find(label => {
                     const labelText = label.innerText.trim().toLowerCase().replace(/\s+/g, ' ');
                     // Check if non-empty strings contain each other
                     return (labelText.length > 0 && cleanAiAnswer.length > 0) &&
                            (labelText.includes(cleanAiAnswer) || cleanAiAnswer.includes(labelText));
                 });
             }

            // Fallback to first option if no match found
            if (!targetLabel) {
                 log(`AI answer "${response.answer}" did not match any available options. Defaulting to first option.`, "warning");
                 targetLabel = optionLabels[0];
            }

            answeredQuizQuestions.push(questionText); // Mark as answered
            const answerContainer = targetLabel.closest('div.assessment_answer.radio');
            if (answerContainer) {
                log(`Selecting answer: "${targetLabel.innerText.trim()}".`, "success");
                simulateRealClick(answerContainer);
            } else {
                 log(`Could not find parent container for answer: "${targetLabel.innerText.trim()}".`, "error");
            }
            // Add a slightly longer delay to ensure selection registers
            setTimeout(() => {
                isActionInProgress = false;
            }, 1800);
        });
        return true; // Handled
    }
    return false; // Not this type of quiz
}


function solveRankingPuzzle() {
    const container = document.querySelector('.drag-and-drop[id*="sortable"]');
    if (container && container.querySelector('[data-rank="true"]') && !container.dataset.solved) {
        log("PRIORITY 1: Found Ranking Puzzle. Executing brute-force.", "success");
        isActionInProgress = true;
        container.dataset.solved = 'true'; // Mark as solved immediately

        const draggables = Array.from(container.querySelectorAll('[data-action-target="draggable"]'));
        const dropzones = Array.from(container.querySelectorAll('.dropzone'));
        if (draggables.length === 0 || dropzones.length === 0) {
            log("Could not find draggable items or dropzones for ranking puzzle.", "error");
            isActionInProgress = false;
            return true; // Handled (by error)
        }
        const items = draggables.map(d => (d.querySelector('.description') || d).innerText.trim());


        let permutations;
        // Generate permutations only if needed
        if (container.dataset.permutations) {
            permutations = JSON.parse(container.dataset.permutations);
        } else {
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
                 log("Ranking puzzle too large (>8 items) for brute-force permutations. Halting.", "error");
                 isStuck = true; isActionInProgress = false; return true;
             }
            container.dataset.permutations = JSON.stringify(permutations);
        }

        let attempt = parseInt(container.dataset.attempt || '0');
        if (attempt >= permutations.length) {
            log("All ranking permutations exhausted. Halting.", "error");
            isStuck = true; isActionInProgress = false;
            return true; // Handled (by error)
        }

        const currentPermutation = permutations[attempt];
        log(`Executing Ranking Attempt #${attempt + 1} / ${permutations.length}: [${currentPermutation.join(', ')}]`, "system");

        let delay = 0;
        currentPermutation.forEach((itemName, index) => {
            const itemElement = draggables.find(d => (d.querySelector('.description') || d).innerText.trim() === itemName);
            const targetZone = dropzones[index];
            if (itemElement && targetZone) {
                setTimeout(() => simulateDragDrop(itemElement, targetZone), delay);
                delay += 300; // Stagger drags slightly
            } else {
                 log(`Error finding item "${itemName}" or zone ${index} for permutation.`, "error");
            }
        });

        container.dataset.attempt = attempt + 1; // Increment attempt count
        // Submit after drags finish
        setTimeout(() => {
            const submitButton = findClickableButton(['submit']);
            if (submitButton) {
                log("Submitting ranking permutation.", "system");
                simulateRealClick(submitButton);
            } else {
                log("Could not find submit button after ranking.", "warning");
            }
            // Allow time for feedback/page change
            setTimeout(() => isActionInProgress = false, 1500);
        }, delay + 500);
        return true; // Handled
    }
    return false; // Not this type
}

function solveDragAndDropPuzzle() {
    const container = document.querySelector('.drag-and-drop:not([id*="sortable"])');
    // Check if it's visible and not already marked completed
    if (container && container.offsetParent !== null && !container.classList.contains('all-completed')) {
        log("PRIORITY 1: Match on `.drag-and-drop`. Executing solver.", "success");
        isActionInProgress = true;
        container.classList.add('all-completed'); // Mark immediately to prevent re-triggering

        const puzzleId = container.id;
        if (puzzleId && ANSWER_KEY[puzzleId]) {
            log(`PRIORITY 0: Found hardcoded answer for puzzle ID "${puzzleId}".`, "success");
            const solution = ANSWER_KEY[puzzleId];
            const draggables = Array.from(container.querySelectorAll('[data-action-target="draggable"]'));
            const dropzones = Array.from(container.querySelectorAll('.dropzone'));
             if (draggables.length === 0 || dropzones.length === 0) {
                 log("Could not find items/zones for hardcoded D&D puzzle.", "error");
                 isActionInProgress = false; return true; // Handled (error)
             }
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
            setTimeout(() => {
                const submitButton = findClickableButton(['submit']);
                if (submitButton) simulateRealClick(submitButton);
                setTimeout(() => isActionInProgress = false, 1500); // Allow feedback time
            }, delay + 500);
        } else {
            log("No hardcoded answer found. Engaging AI for a single attempt.", "system");
             if (container.dataset.aiAttempted === 'true') {
                log("AI already attempted for this D&D. Halting.", "error");
                isStuck = true; isActionInProgress = false; return true; // Handled (error)
            }
            container.dataset.aiAttempted = 'true'; // Mark AI attempt

            const username = getUsernameFromPage();
            if (!username) {
                log("Halting: Username not found for API call.", "error");
                isStuck = true; isActionInProgress = false; return true; // Handled (error)
            }
            solveDragAndDropWithAI(container, username); // Call AI solver
        }
        return true; // Handled
    }
    return false; // Not this type
}


function solveQuizQuestion() {
    const questionElement = document.querySelector('legend.assessment-question__title');
    // Check if element exists and hasn't been marked as solved in this session
    if (questionElement && document.body.contains(questionElement) && !questionElement.dataset.solved) {
        log("PRIORITY 1: Match on standard quiz format. Checking type.", "system");
        isActionInProgress = true;
        questionElement.dataset.solved = 'true'; // Mark immediately

        let isApiNeeded = false;
        const quizBlock = questionElement.closest('.assessment-question');
        const quizContainer = questionElement.closest('.elevation-2, .layout, #assessment-container_c433, body');

        // Check 1: Header Keywords
        const headerElement = quizContainer ? quizContainer.querySelector('h1[data-action-target="header"], h1') : null;
        if (headerElement && document.body.contains(headerElement)) {
            const headerText = headerElement.innerText.toLowerCase();
            const criticalKeywords = ['quiz', 'test', 'post-assessment', 'what did you learn', 'assessment', 'knowledge check'];
            if (criticalKeywords.some(keyword => headerText.includes(keyword))) {
               isApiNeeded = true;
               log(`Reason for AI: Found critical header "${headerElement.innerText}".`, "system");
            }
        }

        // Check 2: Progress Indicator (if header check failed)
        if (!isApiNeeded && quizBlock) {
             const progressWrapper = quizBlock.closest('.one-at-a-time-wrapper, .one-at-a-time-container');
             if (progressWrapper && progressWrapper.querySelector('.assessment-question__progress')) {
                 isApiNeeded = true;
                 log(`Reason for AI: Found progress indicator.`, "system");
             }
        }


        if (isApiNeeded) {
            log(`Critical assessment detected. Engaging AI solver.`, "success");
            const username = getUsernameFromPage();
            if (!username) {
                log("Halting: Username not found for API call.", "error");
                isStuck = true; isActionInProgress = false; return true;
            }
            solveQuizWithAI(questionElement, username);

        } else {
            log("Simple question detected. Selecting first option.", "system");
            const firstOption = quizBlock ? quizBlock.querySelector('label.choices__label:not(.choices__label--disabled)') : null;
            if (firstOption && document.body.contains(firstOption)) {
                simulateRealClick(firstOption);
                log(`Clicked first option: "${(firstOption.querySelector('.choices__label-title') || firstOption).innerText.trim()}"`, "event");
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
        return true; // Handled
    }
    return false; // Not this type
}


function clickNextAccordion() {
    const unclickedAccordion = document.querySelector('button[data-action-target="accordion"][aria-label*="collapsed"]');
    if (unclickedAccordion && document.body.contains(unclickedAccordion)) {
        log("PRIORITY 1.5: Found unclicked accordion. Clicking.", "success");
        isActionInProgress = true;
        simulateRealClick(unclickedAccordion);
        setTimeout(() => isActionInProgress = false, 1200); // Slightly longer delay
        return true;
    }
    return false;
}

function clickNextFlipCard() {
    const unFlippedCard = document.querySelector('button[data-action-target="flipcard"][aria-label*="Unflipped"]');
    if (unFlippedCard && document.body.contains(unFlippedCard)) {
        log("PRIORITY 1.6: Found unflipped card. Clicking.", "success");
        isActionInProgress = true;
        simulateRealClick(unFlippedCard);
        setTimeout(() => isActionInProgress = false, 1200);
        return true;
    }
    return false;
}

function clickNextHotspot() {
    // Find hotspots that are present, not disabled, have aria-expanded="false", and haven't been clicked yet
    const nextHotspot = Array.from(document.querySelectorAll('button.btn-hotspot[aria-expanded="false"]:not([disabled])'))
                           .find(h => document.body.contains(h) && h.offsetParent !== null && !clickedHotspots.includes(h));
    if (nextHotspot) {
        log("PRIORITY 1.7: Found unclicked hotspot. Clicking.", "success");
        isActionInProgress = true;
        clickedHotspots.push(nextHotspot); // Mark as clicked
        simulateRealClick(nextHotspot);
        setTimeout(() => isActionInProgress = false, 1200);
        return true;
    }
    return false;
}

function clickNextTab() {
    // Find tabs present, not disabled, marked 'Not completed', and not yet clicked
    const nextTab = Array.from(document.querySelectorAll('button[data-action-target="tab"][aria-label*="Not completed"]:not([disabled])'))
                       .find(t => document.body.contains(t) && t.offsetParent !== null && !clickedTabs.includes(t));
    if (nextTab) {
        log("PRIORITY 1.8: Found unclicked tab. Clicking.", "success");
        isActionInProgress = true;
        clickedTabs.push(nextTab); // Mark as clicked
        simulateRealClick(nextTab);
        setTimeout(() => isActionInProgress = false, 1200);
        return true;
    }
    return false;
}

function clickNextModalButton() {
    // Find modal buttons present, not disabled, and not yet clicked
    const nextModalButton = Array.from(document.querySelectorAll('button[data-actiontype="open_modal"]:not([disabled])'))
                               .find(b => document.body.contains(b) && b.offsetParent !== null && !clickedModals.includes(b));
    if (nextModalButton) {
        log("PRIORITY 1.9: Found modal button. Clicking.", "success");
        isActionInProgress = true;
        clickedModals.push(nextModalButton); // Mark as clicked
        simulateRealClick(nextModalButton);
        setTimeout(() => isActionInProgress = false, 1200);
        return true;
    }
    return false;
}

function answerRatingQuestion() {
    // Find rating fieldsets present and without a checked radio button inside
    const unansweredFieldset = Array.from(document.querySelectorAll('div.choices--rating fieldset.choices__fieldset'))
                                  .find(f => document.body.contains(f) && f.offsetParent !== null && !f.querySelector('input[type="radio"]:checked'));
    if (unansweredFieldset) {
        log("PRIORITY 1.10: Found unanswered star rating. Clicking first star.", "success");
        isActionInProgress = true;
        const firstStarLabel = unansweredFieldset.querySelector('label.choices__label');
        if (firstStarLabel) simulateRealClick(firstStarLabel);
        setTimeout(() => isActionInProgress = false, 1000);
        return true;
    }
    return false;
}

function answerGenericChoice() {
    // Find generic radio button containers that aren't ratings, quizzes, are present, and haven't been answered/marked
    const container = Array.from(document.querySelectorAll('.choices__list, fieldset'))
                         .find(c => document.body.contains(c) && c.offsetParent !== null &&
                                    !c.closest('.choices--rating') &&
                                    c.querySelector('input[type="radio"]') &&
                                    !c.querySelector('input[type="radio"]:checked') &&
                                    !c.closest('#questionContainer') && // Exclude new API quiz format
                                    !c.closest('.assessment-question') && // Exclude standard quiz format
                                    !c.dataset.solved // Check if already marked
                               );
    if (container) {
        log("PRIORITY 1.11: Found unanswered generic choice. Clicking first option.", "success");
        isActionInProgress = true;
        const firstLabel = container.querySelector('label.qs-choices__label, label.choices__label');
        if (firstLabel) {
            simulateRealClick(firstLabel);
            container.dataset.solved = 'true'; // Mark as solved
        }
        setTimeout(() => isActionInProgress = false, 1000);
        return true;
    }
    return false;
}

function solveDragAndDropWithAI(container, username) {
    const draggables = Array.from(container.querySelectorAll('[data-action-target="draggable"]'));
    const dropzones = Array.from(container.querySelectorAll('.dropzone'));
    if (draggables.length === 0 || dropzones.length === 0) { log("Could not find items/zones for AI D&D.", "error"); isStuck = true; isActionInProgress = false; return; }
    const items = draggables.map(d => d.innerText.trim()).filter(Boolean);
    const zones = dropzones.map(z => z.querySelector('.description, h2, h3, h4')?.innerText.trim() || `Zone ${dropzones.indexOf(z) + 1}`).filter(Boolean);
    if (items.length === 0 || zones.length === 0) { log("Found empty items/zones for AI D&D.", "error"); isStuck = true; isActionInProgress = false; return; }

    log("Sending D&D problem to server...", 'system');
    chrome.runtime.sendMessage({ action: "solveDragAndDropWithAI", username, items, zones, hint: "" }, (response) => {
        if (!response || response.error) { log(`Server error: ${response?.error || 'Unknown'}. Halting.`, "error"); isStuck = true; isActionInProgress = false; return; }
        if (!Array.isArray(response.solution) || response.solution.some(item => typeof item.item !== 'string' || typeof item.zoneIndex !== 'number')) { log("Invalid D&D solution structure from server.", "error"); isStuck = true; isActionInProgress = false; return; }

        log("Received AI D&D solution. Executing drags.", 'success');
        let delay = 0;
        response.solution.forEach(placement => {
            const itemElement = draggables.find(d => d.innerText.trim() === placement.item);
            const zoneElement = placement.zoneIndex >= 0 && placement.zoneIndex < dropzones.length ? dropzones[placement.zoneIndex] : null;

            if (itemElement && zoneElement) {
                 const dropTarget = zoneElement.querySelector('[data-action-target="container"]') || zoneElement;
                 if (dropTarget) {
                     setTimeout(() => simulateDragDrop(itemElement, dropTarget), delay);
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
}


function solveQuizWithAI(questionElement, username) {
    const quizBlock = questionElement.closest('.assessment-question__block');
    if (!quizBlock) { log("Could not find quiz block for AI.", "error"); isActionInProgress = false; return; }
    const optionElements = Array.from(quizBlock.querySelectorAll('label.choices__label')); // Get all labels
    if (optionElements.length === 0) { log("Could not find options for AI quiz.", "error"); isActionInProgress = false; return; }

    const question = questionElement.innerText.trim();
    const options = optionElements.map(el => (el.querySelector('.choices__label-title') || el).innerText.trim());

    let tableData = '';
    const tableElement = document.querySelector('table.table');
    if (tableElement) {
        const rows = Array.from(tableElement.querySelectorAll('tr'));
        tableData = rows.map(row => Array.from(row.querySelectorAll('th, td')).map(cell => `"${cell.innerText.trim().replace(/\s+/g, ' ')}"`).join(', ')).join('\n');
    }

    log(`Sending question to server: "${question.substring(0, 50)}..."`);
    chrome.runtime.sendMessage({ action: "solveQuiz", username, question, options, tableData, incorrectOptions: [] }, (response) => {
        if (!response || response.error) { log(`Server error: ${response?.error || 'Unknown'}. Halting.`, "error"); isStuck = true; isActionInProgress = false; return; }
        log(`Server suggests: ${response.answer}`);

        let targetOption = null;
        const cleanAiAnswer = response.answer.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,!?;:]$/, '');

        // 1. Exact match
        targetOption = optionElements.find(o => (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,!?;:]$/, '') === cleanAiAnswer);
        // 2. Containment check
        if (!targetOption) targetOption = optionElements.find(o => { const ot = (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().replace(/\s+/g, ' ').trim(); return (ot.length > 3 && cleanAiAnswer.includes(ot)) || (cleanAiAnswer.length > 3 && ot.includes(cleanAiAnswer)); });
        // 3. Special keywords
        if (!targetOption) { const allK = ["all of the above", "all choices are correct"]; const noneK = ["none of the above", "no choices are correct"]; if (allK.some(k => cleanAiAnswer.includes(k))) targetOption = optionElements.find(o => allK.some(k => (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().includes(k))); else if (noneK.some(k => cleanAiAnswer.includes(k))) targetOption = optionElements.find(o => noneK.some(k => (o.querySelector('.choices__label-title') || o).innerText.trim().toLowerCase().includes(k))); }
        // 4. Fallback
        if (!targetOption) { log(`AI answer "${response.answer}" didn't match. Defaulting to first option.`, "warning"); targetOption = optionElements[0]; }

        // --- Execute Click and Feedback Loop ---
        const optionText = (targetOption.querySelector('.choices__label-title') || targetOption).innerText.trim();
        log(`Selecting answer: "${optionText}".`, "success");
        simulateRealClick(targetOption);

        setTimeout(() => {
            const wrapper = quizBlock.closest('.one-at-a-time-wrapper, .one-at-a-time-container');
            if (!wrapper) { log("Could not find quiz wrapper.", "error"); isActionInProgress = false; return; }
            const submitButton = wrapper.querySelector('button.assessment__btn--submit');

            if (submitButton && !submitButton.disabled && document.body.contains(submitButton)) {
                log("Clicking Submit button.", "system");
                simulateRealClick(submitButton);

                // Check for feedback AFTER submitting
                setTimeout(() => {
                    // Re-query elements as they might have changed
                    const currentWrapper = quizBlock.closest('.one-at-a-time-wrapper, .one-at-a-time-container');
                    if (!currentWrapper) { isActionInProgress = false; return; } // Wrapper gone? Assume success

                    const continueButton = currentWrapper.querySelector('button.assessment__btn--next');
                    // Check 1: Success (Continue button is visible and enabled)
                    if (continueButton && !continueButton.disabled && continueButton.offsetParent !== null) {
                        log("Answer was correct. Clicking Continue.", "success");
                        simulateRealClick(continueButton);
                        isActionInProgress = false;
                        return;
                    }

                    // Check 2: Failure (Retry button or feedback visible)
                    const retryButton = currentWrapper.querySelector('button.assessment__btn--retry');
                    const feedbackElement = currentWrapper.querySelector('.assessment-feedback, [class*="feedback"]'); // More general feedback check
                    const isRetryVisible = retryButton && !retryButton.disabled && retryButton.offsetParent !== null;
                    const isFeedbackVisible = feedbackElement && feedbackElement.offsetParent !== null && feedbackElement.innerText.trim().length > 0;

                    if (isRetryVisible || isFeedbackVisible) {
                        log("AI answer was incorrect. Defaulting to first option as second guess.", "error");
                        const firstOption = optionElements[0]; // Get the first option again
                        simulateRealClick(firstOption);

                        setTimeout(() => {
                             const submitButtonAgain = currentWrapper.querySelector('button.assessment__btn--submit');
                             if (submitButtonAgain && !submitButtonAgain.disabled && document.body.contains(submitButtonAgain)) {
                                log("Clicking Submit button (Attempt 2).", "system");
                                simulateRealClick(submitButtonAgain);

                                // Wait for Continue to appear after the second guess
                                setTimeout(() => {
                                    const finalContinue = currentWrapper.querySelector('button.assessment__btn--next');
                                    if (finalContinue && !finalContinue.disabled && finalContinue.offsetParent !== null) {
                                        log("Clicking Continue (after 2nd guess).", "system");
                                        simulateRealClick(finalContinue);
                                    } else {
                                        log("No Continue button after 2nd guess. Forcing nav click.", "warning");
                                        handleNavigation(); // Try to find any next/continue button
                                    }
                                    isActionInProgress = false;
                                }, 2500); // Longer wait for feedback after 2nd submit
                            } else {
                                 log("Submit button not available for 2nd guess. Forcing nav click.", "error");
                                 handleNavigation(); // Try to find any next button
                                 isActionInProgress = false;
                            }
                        }, 1000); // Wait after clicking 1st option
                    } else {
                        // Neither Success nor Failure clearly detected, maybe page is slow?
                        log("No clear correct/incorrect feedback after submit. Clicking Continue if available.", "warning");
                        if (continueButton && continueButton.offsetParent !== null) { // Try clicking even if it looked disabled before
                            simulateRealClick(continueButton);
                        } else {
                            handleNavigation(); // Fallback to generic nav
                        }
                        isActionInProgress = false;
                    }
                }, 2500); // Longer wait for feedback after first submit

            } else {
                 log("Submit button not found or disabled after selection.", "error");
                 // Check for a continue button anyway, sometimes submit isn't needed
                 const continueButton = wrapper.querySelector('button.assessment__btn--next');
                 if (continueButton && !continueButton.disabled && continueButton.offsetParent !== null) {
                     log("No submit button, but Continue is active. Clicking Continue.", "system");
                     simulateRealClick(continueButton);
                 } else {
                     log("No submit or continue button found.", "error");
                 }
                 isActionInProgress = false;
            }
        }, 1200); // Wait a bit longer after clicking the answer
    });
}


function simulateDragDrop(source, destination) {
     if (!source || !destination || !document.body.contains(source) || !document.body.contains(destination)) {
         log("DragDrop Error: Source or dest missing or removed from DOM.", "error");
         return;
     }
    const itemName = source.innerText.trim();
    log(`--- Simulating Drag for "${itemName}" ---`, 'system');
    const dataTransfer = new DataTransfer();
    const sRect = source.getBoundingClientRect();
    const dRect = destination.getBoundingClientRect();
     // Check for valid rectangles (non-zero dimensions)
     if (!sRect.width || !sRect.height || !dRect.width || !dRect.height) {
         log(`DragDrop Error: Invalid element dimensions for "${itemName}". Source: ${JSON.stringify(sRect)}, Dest: ${JSON.stringify(dRect)}`, "error");
         return;
     }
    const sX = sRect.left + sRect.width / 2; const sY = sRect.top + sRect.height / 2;
    const dX = dRect.left + dRect.width / 2; const dY = dRect.top + dRect.height / 2;
    const cME = (t, x, y) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
    const cDE = (t, x, y) => new DragEvent(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, dataTransfer });

    source.dispatchEvent(cME('mousedown', sX, sY));
    source.dispatchEvent(cDE('dragstart', sX, sY));
    destination.dispatchEvent(cDE('dragenter', dX, dY));
    destination.dispatchEvent(cDE('dragover', dX, dY));
    destination.dispatchEvent(cDE('drop', dX, dY));
    source.dispatchEvent(cDE('dragend', dX, dY));
    // Mouseup might need to be on the source or window depending on implementation
    window.dispatchEvent(cME('mouseup', dX, dY)); // Dispatch mouseup globally
    log(`--- Drag simulation for "${itemName}" complete. ---`, 'system');
}


// ===================================
// TROLL FEATURE LOGIC
// ===================================

const VIDEO_URLS = {
    opening: "https://files.catbox.moe/67bs4u.mp4",
    idle:    "https://files.catbox.moe/dxwc7a.mp4",
    closing: "https://files.catbox.moe/d17taf.mp4"
};
const FADE_DURATION = 500; // ms for fade in/out
const OPEN_DELAY = 300; // ms delay after fade before opening eyes play
const CLOSE_DELAY = 300; // ms delay after closing eyes finish before fade starts

function checkServerForCommands() {
    // Stop checking if force stopped
    if (isForceStopped) {
        if (commandCheckIntervalId) { clearInterval(commandCheckIntervalId); commandCheckIntervalId = null; console.log("[EVERFI Bot - Admin] Cleared command check interval due to forceStop."); }
        return;
    }
    if (isStuck) return; // Don't check if bot thinks it's stuck locally

    const username = getUsernameFromPage();
    if (!username) { getUsernameFromPage(); if (!cachedUsername) return; }

    chrome.runtime.sendMessage({ action: "checkCommand", username: cachedUsername }, (command) => {
        if (chrome.runtime.lastError) {
            console.error("Error checking command:", chrome.runtime.lastError.message);
            // Handle invalidated context if necessary
            if (commandCheckIntervalId && chrome.runtime.lastError.message.includes("context invalidated")) {
                 console.log("[EVERFI Bot - Admin] Extension context invalidated. Stopping intervals.");
                 if(commandCheckIntervalId) clearInterval(commandCheckIntervalId); commandCheckIntervalId = null;
                 if(botMainIntervalId) clearInterval(botMainIntervalId); botMainIntervalId = null; // Also clear main loop
                 isForceStopped = true; // Mark as stopped
             }
            return;
        }

        if (command && command.command) {
            // *** HANDLE forceStop COMMAND ***
            if (command.command === "forceStop") {
                log("Received forceStop command from server. Halting bot.", "error"); // Visible log
                isForceStopped = true; // Set the flag
                hideTrollOverlay(); // Hide any active overlay
                // The check at the start of runBot and checkServerForCommands will stop the intervals
            } else {
                 log(`Received admin command: ${command.command}`, "system"); // Keep visible for now
                 executeTrollCommand(command);
            }
        }
    });
}

function executeTrollCommand(command) {
    // Don't execute if force stopped, except for 'hide'
    if (isForceStopped && command.command !== 'hide') {
         console.log("[EVERFI Bot - Admin] Bot force stopped, ignoring troll command:", command.command);
         return;
    }
    switch (command.command) {
        case 'showEyes': showTrollOverlay(true); break;
        case 'showText': showTrollOverlay(false); showTrollText(command.message); break;
        case 'hide': hideTrollOverlay(); break;
    }
}

function showTrollOverlay(playVideoImmediately = true) {
    let overlay = document.getElementById('troll-overlay');
    if (overlay) { // If overlay exists...
        overlay.style.transition = `opacity ${FADE_DURATION}ms ease-in-out`; // Ensure transition
        overlay.style.opacity = '1'; // Ensure fully visible
        overlay.style.pointerEvents = 'auto'; // Ensure it blocks clicks
        const video = document.getElementById('troll-video');
        if (video) { // If asked to play, and it's paused or not idle, switch to idle
             if (playVideoImmediately && (video.paused || !video.src.includes(new URL(VIDEO_URLS.idle).pathname))) {
                 video.src = VIDEO_URLS.idle; video.loop = true; video.play().catch(e => console.error("Error playing idle video:", e));
             }
        } return; // Already exists, just ensure state
    }
    log("Executing: showTrollOverlay", "event"); // Keep visible log

    overlay = document.createElement('div'); overlay.id = 'troll-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', backgroundColor: 'rgb(0, 0, 0)', // Full black
        zIndex: '2147483647', display: 'flex', justifyContent: 'flex-start', // Align content top
        alignItems: 'center', // Center content horizontally
        flexDirection: 'column', // Stack text above video
        opacity: '0', transition: `opacity ${FADE_DURATION}ms ease-in-out`, pointerEvents: 'auto'
    });
    const text = document.createElement('div'); text.id = 'troll-text';
    Object.assign(text.style, { // Styles for text positioning
        color: 'white', fontSize: '48px', fontWeight: 'bold', fontFamily: 'Arial, sans-serif',
        textShadow: '0 0 10px white', textAlign: 'center', maxWidth: '90%',
        marginTop: '10vh', marginBottom: '20px', // Push text down from top, add space below
        pointerEvents: 'none', opacity: '1' // Text is visible when overlay is
    });
    const video = document.createElement('video'); video.id = 'troll-video'; video.src = VIDEO_URLS.opening; video.autoplay = false; video.muted = true; video.loop = false; video.playsInline = true;
    Object.assign(video.style, { // Styles for full screen video background
        width: '100vw', height: '100vh', objectFit: 'cover', // Cover screen
        position: 'absolute', top: '0', left: '0', zIndex: '-1', // Behind text
        pointerEvents: 'none'
    });
    
    // <<< THIS IS THE FIX >>>
    // This handler correctly switches the "opening" video to "idle" when it finishes.
    video.onended = () => {
        const currentOverlay = document.getElementById('troll-overlay');
        const currentVideo = document.getElementById('troll-video');
        if (!currentOverlay || !currentVideo) return; // Abort if removed

        const openingPath = new URL(VIDEO_URLS.opening).pathname;
        // Check ONLY for the opening video ending
        if (new URL(currentVideo.src).pathname.includes(openingPath)) {
            log("Opening video ended, switching to idle.", "event"); // Debug
            currentVideo.src = VIDEO_URLS.idle;
            currentVideo.loop = true;
            currentVideo.play().catch(e => console.error("Error playing idle video:", e));
        }
        // DO NOT handle closing video end here
    };
    // <<< END FIX >>>

    video.addEventListener('error', (e) => { log('Video error: '+(e.target?.error?.message||'Unknown'), 'error'); /* Fallback logic */ });
    overlay.appendChild(text); overlay.appendChild(video); document.body.appendChild(overlay);

    requestAnimationFrame(() => { // Fade in overlay
        overlay.style.opacity = '1';
        if (playVideoImmediately) { // Play video AFTER fade and OPEN_DELAY
            setTimeout(() => {
                 const currentVideo = document.getElementById('troll-video');
                 if (currentVideo) currentVideo.play().catch(e => log('Opening video play failed.', 'warning'));
            }, FADE_DURATION + OPEN_DELAY);
        }
    });
}

function showTrollText(message) {
    let overlay = document.getElementById('troll-overlay');
    // Create overlay if it doesn't exist, but don't play opening video
    if (!overlay) { showTrollOverlay(false); }
    // Use timeout to ensure elements exist after potential creation
    setTimeout(() => {
        const textDiv = document.getElementById('troll-text');
        if (!textDiv) { console.error("Could not find troll text div"); return; }
        log(`Executing: showTrollText ("${message}")`, "event"); // Keep visible
        textDiv.textContent = message; textDiv.style.opacity = '1';
        // Ensure idle video is playing if text shown without eyes first
        const video = document.getElementById('troll-video');
        if (video && (video.paused || !video.src.includes(new URL(VIDEO_URLS.idle).pathname))) {
            if (!video.src.includes(new URL(VIDEO_URLS.opening).pathname) && !video.src.includes(new URL(VIDEO_URLS.closing).pathname)) {
                 video.src = VIDEO_URLS.idle; video.loop = true; video.play().catch(e => console.error("Error playing idle for text:", e));
            }
        }
    }, 50); // Small delay
}

function hideTrollOverlay() {
    const overlay = document.getElementById('troll-overlay'); if (!overlay) return; log("Executing: hideTrollOverlay", "event"); // Keep visible
    const video = document.getElementById('troll-video'); const text = document.getElementById('troll-text');
    if (text) text.textContent = ''; // Clear text
    overlay.style.pointerEvents = 'none'; // Allow interactions immediately

    if (video) {
        video.pause(); video.currentTime = 0; video.src = VIDEO_URLS.closing; video.loop = false; video.muted = true; video.playsInline = true;

        // <<< THIS IS THE FIX >>>
        // This new handler fires when the *closing* video ends
        video.onended = () => {
            log("Closing video ended, fading out.", "event");
            setTimeout(() => {
                if (overlay && document.body.contains(overlay)) {
                    overlay.style.opacity = '0';
                    // Wait for fade to finish, then remove
                    setTimeout(() => {
                        if (overlay && document.body.contains(overlay)) overlay.remove();
                    }, FADE_DURATION);
                }
            }, CLOSE_DELAY); // Wait for CLOSE_DELAY before starting fade
        };
        // <<< END FIX >>>

        // Play closing video after a short delay
        setTimeout(() => {
             const currentVideo = document.getElementById('troll-video');
             if (currentVideo) {
                 log("Playing closing video...", "event"); // Debug
                 currentVideo.play().catch(e => {
                     log('Closing video play failed. Fading immediately.', 'warning');
                     // Immediate fade fallback if play fails
                     if (overlay && document.body.contains(overlay)) { overlay.style.opacity = '0'; setTimeout(() => { if (overlay && document.body.contains(overlay)) overlay.remove(); }, FADE_DURATION); }
                 });
             }
        }, 50);
    } else {
        // No video? Just fade and remove.
        if (overlay && document.body.contains(overlay)) { overlay.style.opacity = '0'; setTimeout(() => { if (overlay && document.body.contains(overlay)) overlay.remove(); }, FADE_DURATION); }
    }
    
    // No longer need the long fallback timeout, the onended handler is better
}

// --- Initialization (Runs immediately on injection) ---
(function initialize() {
    // REMOVE this line: createLogGUI();
    log("Content script injected and running.", "success"); // This will now only log to console initially
    getUsernameFromPage(); // This will attempt to create GUI if username matches

    log("Starting command checker interval.", "system"); // Will only log to console if username not yet matched
    if (commandCheckIntervalId) clearInterval(commandCheckIntervalId);
    commandCheckIntervalId = setInterval(checkServerForCommands, 3000);

    log("Starting main bot loop (runBot interval).", "system"); // Will only log to console if username not yet matched
    if (botMainIntervalId) clearInterval(botMainIntervalId);
    botMainIntervalId = setInterval(runBot, 2000);
    runBot();
})();