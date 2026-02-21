const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');

// Canvas State
// Start in the middle of the screen
let cameraX = window.innerWidth / 2; 
let cameraY = window.innerHeight / 2;
let scale = 1;

// Zoom Constraints
const MIN_SCALE = 0.1;
const MAX_SCALE = 3;

// Dragging State
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// --- Smooth Panning Engine ---
let panAnimationId = null;

// Standard ease-in-out cubic function for a smooth glide
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const branchColors = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];

function getRandomColor() {
    return branchColors[Math.floor(Math.random() * branchColors.length)];
}

function panCameraTo(targetX, targetY, duration = 400) {
    // Cancel any existing animation so they don't fight
    if (panAnimationId) cancelAnimationFrame(panAnimationId);

    const startX = cameraX;
    const startY = cameraY;
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = easeInOutCubic(progress);

        cameraX = startX + (targetX - startX) * ease;
        cameraY = startY + (targetY - startY) * ease;
        
        updateCanvas();

        if (progress < 1) {
            panAnimationId = requestAnimationFrame(animate);
        }
    }

    panAnimationId = requestAnimationFrame(animate);
}

// Helper to focus a contenteditable element and highlight all its text
function focusAndSelectAll(el) {
    if (!el) return;
    el.focus();
    
    // Use the browser's Range API to highlight the text inside the div
    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}


// Helper to focus contenteditable elements and move cursor to the end
function focusAndPlaceCursorAtEnd(el) {
    if (!el) return;
    el.focus();
    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); // false means collapse to the end
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}
// --- Selection State ---
let activeNode = null;

function setActiveNode(node) {
    // Remove glow from previously active node
    if (activeNode && activeNode.element) {
        activeNode.element.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-4', 'ring-offset-slate-900');
    }
    
    activeNode = node;
    
    // Add glow to new active node and smoothly pan to it
    if (activeNode && activeNode.element) {
        activeNode.element.classList.add('ring-4', 'ring-blue-500', 'ring-offset-4', 'ring-offset-slate-900');
        
        const targetX = (window.innerWidth / 2) - activeNode.x * scale;
        const targetY = (window.innerHeight / 2) - activeNode.y * scale;
        
        panCameraTo(targetX, targetY);
    }
}

/**
 * Updates the canvas transform and synchronizes the background grid.
 */
function updateCanvas() {
    // 1. Move and scale the canvas
    canvas.style.transform = `translate(${cameraX}px, ${cameraY}px) scale(${scale})`;
    
    // 2. Synchronize the grid background
    // The grid needs to scale up/down with the canvas
    const gridSize = 50 * scale; 
    viewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    // The grid needs to shift exactly as much as the camera shifts
    viewport.style.backgroundPosition = `${cameraX}px ${cameraY}px`;
}
// --- Canvas Event Listeners (Paste this right below updateCanvas) ---

viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (panAnimationId) cancelAnimationFrame(panAnimationId);
    if (e.ctrlKey) {
        // Zoom Logic
        const zoomSpeed = 0.1;
        const zoomDelta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newScale = Math.min(Math.max(scale + zoomDelta, MIN_SCALE), MAX_SCALE);
        const scaleRatio = newScale / scale;
        const mouseXToCamera = e.clientX - cameraX;
        const mouseYToCamera = e.clientY - cameraY;
        
        cameraX = e.clientX - (mouseXToCamera * scaleRatio);
        cameraY = e.clientY - (mouseYToCamera * scaleRatio);
        scale = newScale;
    } else {
        // Pan Logic
        const panSpeed = 1;
        if (e.shiftKey) {
            cameraX -= (e.deltaY || e.deltaX) * panSpeed;
        } else {
            cameraX -= e.deltaX * panSpeed;
            cameraY -= e.deltaY * panSpeed;
        }
    }
    updateCanvas();
}, { passive: false });

viewport.addEventListener('mousedown', (e) => {
    if (panAnimationId) cancelAnimationFrame(panAnimationId);
    if (e.target === viewport) {
        isDragging = true;
        dragStartX = e.clientX - cameraX;
        dragStartY = e.clientY - cameraY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    cameraX = e.clientX - dragStartX;
    cameraY = e.clientY - dragStartY;
    updateCanvas();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// --- Smart Centering ---
function findFirstIncompleteTask(nodes) {
    for (let node of nodes) {
        if (!node.isCompleted) return node;
        if (node.children.length > 0) {
            const foundInChild = findFirstIncompleteTask(node.children);
            if (foundInChild) return foundInChild;
        }
    }
    return null;
}

function recenterCamera() {
    if (rootTasks.length === 0) {
        panCameraTo(window.innerWidth / 2, window.innerHeight / 2);
        return;
    }

    // 1. Find the first incomplete task in the tree
    let targetNode = findFirstIncompleteTask(rootTasks);

    // 2. Fallback: If EVERYTHING is completed, just target the first root node
    if (!targetNode) {
        targetNode = rootTasks[0];
    }

    // 3. Reset zoom scale to 1 for a clean view, then pan to the target node
    scale = 1; 
    
    // Set the target node as active (which automatically calls panCameraTo for us!)
    setActiveNode(targetNode); 
}

window.addEventListener('keydown', (e) => {
    // --- Intercept Modal Controls ---
    const linkModal = document.getElementById('link-modal');
    const confirmModal = document.getElementById('confirm-modal');

    // 1. Link Modal
    if (linkModal && !linkModal.classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('modal-save').click();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            document.getElementById('modal-cancel').click();
        }
        return; // Stop processing other hotkeys
    }

    // 2. Confirm Modal
    if (confirmModal && !confirmModal.classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('confirm-yes').click();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            document.getElementById('confirm-cancel').click();
        }
        return; // Stop processing other hotkeys
    }
    // 1. Check if the user is currently typing
    const isTyping = document.activeElement.tagName === 'INPUT' || 
                     document.activeElement.tagName === 'TEXTAREA' || 
                     document.activeElement.isContentEditable;

    // Works whether you are typing or just navigating!
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault(); // CRITICAL: Stops the browser from focusing the URL bar
        if (activeNode) {
            const linkBtn = activeNode.element.querySelector('.node-add-link'); 
            if (linkBtn) linkBtn.click();
        }
        return;
    }

    // --- NEW: Tab from Title to Description ---
    if (isTyping && e.key === 'Tab' && activeNode) {
        const titleEl = activeNode.element.querySelector('.node-title');
        const descEl = activeNode.element.querySelector('.node-desc');
        
        // If we are currently focused on the title, Tab moves to description
        if (document.activeElement === titleEl) {
            e.preventDefault(); // Stop default browser tabbing
            focusAndPlaceCursorAtEnd(descEl);
            return;
        }
    }

    // If we are currently typing in a title or description field
    if (isTyping && e.key === 'Escape') {
            e.preventDefault();
            document.activeElement.blur(); // Removes focus, which triggers your save logic
            window.getSelection().removeAllRanges(); // Clears the blue text highlight
    }


    //Ctrl + N (New Root Task) ---
    if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault(); // CRITICAL: Stops the browser from opening a new window!
        
        const newBtn = document.getElementById('add-root-btn');
        if (newBtn) newBtn.click(); // Triggers your existing spawn & focus logic
        
        return; 
    }

// If we are typing, ignore all navigation hotkeys below this line
    if (isTyping) return;

    //Enter to Edit Title (Make sure Shift is NOT pressed) ---
    if (e.key === 'Enter' && !e.shiftKey && activeNode) {
        e.preventDefault();
        const titleEl = activeNode.element.querySelector('.node-title');
        focusAndPlaceCursorAtEnd(titleEl);
        return;
    }

    //Add Subtask (Shift + Enter) ---
    if (e.key === 'Enter' && e.shiftKey && activeNode) {
        e.preventDefault();
        const subtaskBtn = activeNode.element.querySelector('.node-add-subtask');
        if (subtaskBtn) subtaskBtn.click();
        return;
    }

    //Toggle Complete (Spacebar) ---
    if (e.key === ' ' && activeNode) {
        e.preventDefault(); // CRITICAL: Stops the spacebar from scrolling the page down
        const checkbox = activeNode.element.querySelector('.node-complete-cb');
        if (checkbox) checkbox.click(); 
        return;
    }

    //Delete Node (Delete key) ---
    if (e.key === 'Delete' && activeNode) {
        e.preventDefault();
        const deleteBtn = activeNode.element.querySelector('.node-delete');
        if (deleteBtn) deleteBtn.click(); // Naturally triggers your confirm modal!
        return;
    }

    // 3. Recenter Camera ('C' or 'Home')
    if (e.key === 'c' || e.key === 'C' || e.key === 'Home') {
        e.preventDefault();
        recenterCamera(); 
        return;
    }

    // 4. Expand / Collapse ('+' or '-')
    if (activeNode) {
        // Handle + (Numpad Add, or Shift+=) and = (in case they forget Shift)
        if (e.key === '+' || e.key === '=') {
            if (!activeNode.isExpanded && activeNode.children.length > 0) {
                activeNode.isExpanded = true;
                updateTreeLayout();
                setActiveNode(activeNode); // Keep it centered after expanding
            }
            return;
        }
        
        // Handle - (Numpad Subtract, or standard dash)
        if (e.key === '-' || e.key === '_') {
            if (activeNode.isExpanded && activeNode.children.length > 0) {
                activeNode.isExpanded = false;
                updateTreeLayout();
                setActiveNode(activeNode); // Keep it centered after collapsing
            }
            return;
        }
    }

    // 5. Arrow Key Navigation
    if (!activeNode) {
        if (rootTasks.length > 0 && e.key.startsWith('Arrow')) setActiveNode(rootTasks[0]);
        return;
    }

    const siblings = activeNode.parent ? activeNode.parent.children : rootTasks;
    const currentIndex = siblings.indexOf(activeNode);

    switch (e.key) {
        case 'ArrowRight':
            if (activeNode.children.length > 0) {
                if (!activeNode.isExpanded) {
                    activeNode.isExpanded = true;
                    updateTreeLayout();
                }
                setActiveNode(activeNode.children[0]);
            }
            break;
        case 'ArrowLeft':
            if (activeNode.parent) {
                setActiveNode(activeNode.parent);
            }
            break;
        case 'ArrowUp':
            if (currentIndex > 0) {
                setActiveNode(siblings[currentIndex - 1]);
            }
            break;
        case 'ArrowDown':
            if (currentIndex < siblings.length - 1) {
                setActiveNode(siblings[currentIndex + 1]);
            }
            break;
    }
});

// --- Modal Manager ---
const modal = document.getElementById('link-modal');
const modalUrl = document.getElementById('modal-url');
const modalText = document.getElementById('modal-text');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');

let modalCallback = null; // Stores the function to run when "Save" is clicked

function openLinkModal(callback) {
    modalCallback = callback;
    modalUrl.value = '';
    modalText.value = '';
    modal.classList.remove('hidden');
    modalUrl.focus();
}

function closeLinkModal() {
    modal.classList.add('hidden');
    modalCallback = null;
}

modalCancel.addEventListener('click', closeLinkModal);

modalSave.addEventListener('click', () => {
    if (modalCallback && modalUrl.value) {
        modalCallback(modalUrl.value, modalText.value);
    }
    closeLinkModal();
});

// --- Confirm Modal Manager ---
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmYes = document.getElementById('confirm-yes');

let confirmCallback = null;

function openConfirmModal(callback, message = "Are you sure?", title = "Confirm Action", buttonText = "Yes, Proceed") {
    confirmCallback = callback;
    
    // Inject the custom text into the DOM
    confirmTitle.innerText = title;
    confirmMessage.innerText = message;
    confirmYes.innerText = buttonText;
    
    // Change button color to red if it's a destructive action (optional but nice)
    if (buttonText.toLowerCase().includes('delete') || buttonText.toLowerCase().includes('overwrite')) {
        confirmYes.className = 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors';
    } else {
        confirmYes.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors';
    }
    
    confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
    confirmModal.classList.add('hidden');
    confirmCallback = null;
}

confirmCancel.addEventListener('click', closeConfirmModal);
confirmYes.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
});


// --- App State ---
const rootTasks = []; 

document.getElementById('add-root-btn').addEventListener('click', () => {
    // Add new roots to the array
    const newRoot = new TodoNode("New Task", 200, 200);
    rootTasks.push(newRoot);
    updateTreeLayout();
    setActiveNode(newRoot);
    //Focus and select the title text
    setTimeout(() => {
        const titleEl = newRoot.element.querySelector('.node-title');
        focusAndSelectAll(titleEl);
    }, 10);
});

// --- Node Class ---

class TodoNode {
    constructor(title, x, y, parent = null, savedColor = null) {
        this.id = 'node_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        this.title = title;
        this.description = '';
        this.dueDate = '';
        this.links = []; 
        
        // New State Properties
        this.progress = 0;
        this.isCompleted = false;
        
        this.parent = parent;
        this.color = savedColor || (parent ? parent.color : getRandomColor());
        this.children = [];
        this.isExpanded = true;
        
        this.x = x;
        this.y = y;
        
        this.linksContainer = null; 
        this.element = this.createDOMElement();
        this.updatePosition();
        
        document.getElementById('canvas').appendChild(this.element);
        
        // Ensure progress is calculated on creation (important for children)
        this.calculateProgress(); 
    }

    createDOMElement() {
        const template = document.getElementById('node-template');
        const clone = template.content.cloneNode(true); 
        
        const div = clone.querySelector('.node-container');
        div.id = this.id;
        // 1. Make the left border thick and prominent
        // We remove the default slate border so it doesn't clash
        div.classList.remove('border-slate-600');
        div.style.border = `1px solid #475569`; // Reset thin border
        div.style.borderLeft = `8px solid ${this.color}`; // Apply thick accent border        // Checkbox Logic
        
        this.checkbox = div.querySelector('.node-complete-cb');
        this.checkbox.checked = this.isCompleted;
        this.checkbox.addEventListener('change', (e) => this.handleCompleteToggle(e));
        // Stop canvas drag when clicking checkbox
        this.checkbox.addEventListener('mousedown', (e) => e.stopPropagation()); 

        // Title Logic
        const titleEl = div.querySelector('.node-title');
        titleEl.innerText = this.title;
        titleEl.addEventListener('input', () => updateTreeLayout());
        titleEl.addEventListener('blur', (e) => {
            // If it's just whitespace or empty, force it truly empty
            if (e.target.innerText.trim() === '') {
                e.target.innerHTML = '';
                this.title = '';
            } else {
                this.title = e.target.innerText;
            }
            saveToLocalStorage();
        });

        // Description Logic
        const descEl = div.querySelector('.node-desc');
        descEl.innerText = this.description;
        descEl.addEventListener('input', () => updateTreeLayout());
        descEl.addEventListener('blur', (e) => {
            // Scrub the hidden <br> tags if the user cleared the text
            if (e.target.innerText.trim() === '') {
                e.target.innerHTML = ''; // This tells the CSS :empty placeholder to reappear!
                this.description = '';
            } else {
                this.description = e.target.innerText;
            }
            saveToLocalStorage();
        });

        // Date Logic
        const dateInput = div.querySelector('.node-date');
        dateInput.value = this.dueDate;
        dateInput.addEventListener('change', (e) => {
            this.dueDate = e.target.value;
            saveToLocalStorage();
        });
        const addLinkBtn = div.querySelector('.node-add-link');
        addLinkBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            openLinkModal((url, text) => {
                const validUrl = url.startsWith('http') ? url : `https://${url}`;
                const displayText = text.trim() || validUrl.replace(/^https?:\/\//, ''); 
                this.links.push({ url: validUrl, text: displayText });
                this.renderLinks();
            });
        });

        this.linksContainer = div.querySelector('.node-links');
        
        this.progressBar = div.querySelector('.node-progress');
        this.progressText = div.querySelector('.node-progress-text'); // The percentage text

        // IMPORTANT: Remove the default Tailwind blue class first!
        this.progressBar.classList.remove('bg-blue-500'); 
        this.progressBar.style.backgroundColor = this.color;

        const addSubtaskBtn = div.querySelector('.node-add-subtask');
        // 3. Color the "Add Subtask" button
        // Remove default blue backgrounds
        addSubtaskBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500', 'text-white');
        // Apply branch color and use dark text for contrast against pastel colors
        addSubtaskBtn.style.backgroundColor = this.color;
        addSubtaskBtn.classList.add('text-slate-900', 'font-bold', 'hover:opacity-90');
        addSubtaskBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.addChild();
        });

        // NEW: Delete Button Logic
        const deleteBtn = div.querySelector('.node-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.requestDelete();
        });
        div.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            setActiveNode(this);
        });
        //Collapse Button Logic
        this.collapseBtn = div.querySelector('.node-collapse-btn');
        this.collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.isExpanded = !this.isExpanded;
            updateTreeLayout(); // Redraw everything!
        });

        return div;
    }

    /**
     * Checks if the node is pristine/blank. If yes, deletes immediately.
     * If edited or has children, prompts the user.
     */
    requestDelete() {
            const isDefaultTitle = this.title === "New Subtask" || this.title === "New Task" || this.title.trim() === "";
            const noDescription = this.description.trim() === "";
            const noLinks = this.links.length === 0;
            const noChildren = this.children.length === 0;

            if (isDefaultTitle && noDescription && noLinks && noChildren) {
                this.removeNode(); // It's blank, just trash it
            } else {
                // Replaced openDeleteModal with our dynamic Confirm Modal
                openConfirmModal(
                    () => this.removeNode(),
                    "Are you sure you want to delete this task? This will also delete all of its subtasks.",
                    "Delete Task",
                    "Yes, Delete"
                );
            }
    }

    /**
     * Completely removes the node from the DOM and data structure.
     */
    removeNode() {
        //Recursively delete all children first so we don't leave orphaned DOM elements!
        [...this.children].forEach(child => child.removeNode());


        // 1. Remove from DOM
        if (activeNode === this) {
            setActiveNode(this.parent || rootTasks[0] || null);
        }
        this.element.remove();
        
        // 2. Remove from Data Structure
        if (this.parent) {
            this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent.calculateProgress(); 
        } else {
            const index = rootTasks.indexOf(this);
            if (index > -1) {
                rootTasks.splice(index, 1);
            }
        }
        
        // 3. Re-draw the tree
        // Note: we only want to call this once at the end of the chain. 
        // If it's a root or it's directly triggered by the user, we call layout.
        if (!this.parent || typeof updateTreeLayout === 'function') {
            updateTreeLayout();
        }
    }

    renderLinks() {
            if (!this.linksContainer) return;
            this.linksContainer.innerHTML = ''; 
            
            const template = document.getElementById('link-template');

            this.links.forEach((linkObj, index) => {
                const clone = template.content.cloneNode(true); 
                
                const deleteBtn = clone.querySelector('.link-delete-btn');
                const linkEl = clone.querySelector('.link-url');

                // Setup Delete Button
                deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation()); 
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.links.splice(index, 1);
                    this.renderLinks();
                });

                // Setup Link
                linkEl.href = linkObj.url;
                linkEl.innerText = linkObj.text; 
                linkEl.addEventListener('mousedown', (e) => e.stopPropagation());

                // Append to the DOM
                this.linksContainer.appendChild(clone);
            });
            
            if (typeof updateTreeLayout === 'function') {
                updateTreeLayout();
            }
        }

    updatePosition() {
        // NODE_WIDTH is 288. We'll assume a standard height of ~160 for the offset
        // This aligns the HTML element's center with its internal X and Y
        const offsetX = 288 / 2;
        const offsetY = (this.element.offsetHeight || 160) / 2;

        this.element.style.left = `${this.x - offsetX}px`;
        this.element.style.top = `${this.y - offsetY}px`;
    }

    addChild() {
        const newChild = new TodoNode("New Subtask", this.x, this.y, this);
        this.children.push(newChild);
        
        this.calculateProgress(); 
        
        // Ensure the parent is expanded so the user can see the new child!
        this.isExpanded = true; 
        
        updateTreeLayout();
        setActiveNode(newChild);
        setTimeout(() => {
            const titleEl = newChild.element.querySelector('.node-title');
            focusAndSelectAll(titleEl);
        }, 10);
    }



    // --- NEW PROGRESS & COMPLETION LOGIC ---

    /**
     * Handles the user clicking the checkbox.
     */
    handleCompleteToggle(e) {
        const isChecking = e.target.checked;
        
        // If checking, and we have incomplete children, ask for confirmation
        if (isChecking && this.hasIncompleteChildren()) {
            e.preventDefault(); 
            this.checkbox.checked = false; 
            
            openConfirmModal(
                () => { this.setCompleteState(true, true); },
                "Marking this parent task as complete will automatically complete all of its subtasks.",
                "Complete All Subtasks?",
                "Yes, Complete All"
            );
        } else {
            // Normal toggle
            this.setCompleteState(isChecking, false);
        }
    }

    hasIncompleteChildren() {
        // Returns true if ANY child has a progress less than 100
        return this.children.some(child => child.progress < 100);
    }


setCompleteState(isComplete, recursive) {
        this.isCompleted = isComplete;
        this.checkbox.checked = isComplete;
        
        if (recursive && isComplete) {
            // FIX: We wrap this.children in [... ] to create a shallow copy. 
            // This prevents the sorting algorithm from disrupting our loop!
            [...this.children].forEach(child => child.setCompleteState(true, true));
        }
        
        this.updateVisualStyle();
        this.calculateProgress();
        
        updateTreeLayout();
    }

    /**
     * Calculates the % progress based on children, or directly from the checkbox if a leaf node.
     */
    calculateProgress() {
        if (this.children.length === 0) {
            // Leaf node: progress is either 0 or 100
            this.progress = this.isCompleted ? 100 : 0;
        } else {
            // Branch node: progress is the average of all children
            const totalProgress = this.children.reduce((sum, child) => sum + child.progress, 0);
            this.progress = Math.floor(totalProgress / this.children.length);
            
            // Auto-update completed state if progress reaches 100 naturally
            this.isCompleted = (this.progress === 100);
            this.checkbox.checked = this.isCompleted;
            this.updateVisualStyle();
        }
        
        // Update the UI
        this.progressBar.style.width = `${this.progress}%`;
        this.progressText.innerText = `${this.progress}%`;
        
        // Crucial: Tell the parent to recalculate its own progress!
        if (this.parent) {
            this.parent.calculateProgress();
        }
    }

    /**
     * Adds Tailwind classes to dim the node when complete, but restores on hover.
     */
    updateVisualStyle() {
        if (this.isCompleted) {
            this.element.classList.add('opacity-50', 'grayscale', 'hover:opacity-100', 'hover:grayscale-0');
        } else {
            this.element.classList.remove('opacity-50', 'grayscale', 'hover:opacity-100', 'hover:grayscale-0');
        }
    }
}





// --- Layout Engine ---
const HORIZONTAL_SPACING = 380; 
const VERTICAL_GAP = 30;        

function calculateSubtreeHeight(node) {
    node.children.sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
    const nodeHeight = node.element.offsetHeight || 150; 
    
    // FIX: If node has no children OR is collapsed, its branch height is just itself
    if (node.children.length === 0 || !node.isExpanded) {
        node.subtreeHeight = nodeHeight;
        return node.subtreeHeight;
    }
    
    let childrenHeight = 0;
    node.children.forEach(child => {
        childrenHeight += calculateSubtreeHeight(child) + VERTICAL_GAP;
    });
    childrenHeight -= VERTICAL_GAP; 
    
    node.subtreeHeight = Math.max(nodeHeight, childrenHeight);
    return node.subtreeHeight;
}

function assignPositions(node, x, centerY) {
    // 1. Reveal this specific node (because it is part of an expanded path)
    node.element.classList.remove('hidden');

    // 2. Position it
    node.x = x;
    node.y = centerY;
    node.updatePosition();
    
    // 3. Update the Expand/Collapse Button UI
    if (node.collapseBtn) {
        if (node.children.length > 0) {
            node.collapseBtn.classList.remove('hidden');
            // Show a Minus if expanded, a Plus if collapsed
            node.collapseBtn.innerText = node.isExpanded ? '−' : '+'; 
        } else {
            node.collapseBtn.classList.add('hidden');
        }
    }

    // 4. STOP HERE if collapsed or if it has no children
    if (node.children.length === 0 || !node.isExpanded) return;
    
    // 5. Otherwise, proceed to position children
    let currentY = centerY - (node.subtreeHeight / 2);
    node.children.forEach(child => {
        let childCenterY = currentY + (child.subtreeHeight / 2);
        assignPositions(child, x + HORIZONTAL_SPACING, childCenterY);
        currentY += child.subtreeHeight + VERTICAL_GAP; 
    });
}

// --- SVG Connection Lines ---
const svgLayer = document.getElementById('connections-layer');
const NODE_WIDTH = 288;

function drawLines() {
    const activePathIds = new Set();

    function drawConnection(parent, child) {
        const pathId = `path_${child.id}`;
        activePathIds.add(pathId);

        const startX = parent.x + (NODE_WIDTH / 2);
        const startY = parent.y;
        const endX = child.x - (NODE_WIDTH / 2);
        const endY = child.y;

        const curvature = 0.5; 
        const deltaX = endX - startX;
        const pathString = `M ${startX} ${startY} C ${startX + (deltaX * curvature)} ${startY}, ${endX - (deltaX * curvature)} ${endY}, ${endX} ${endY}`;

        let path = document.getElementById(pathId);
        if (!path) {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.id = pathId;
            path.classList.add('drawing');
            svgLayer.appendChild(path);
        }

        path.setAttribute('d', pathString);
        path.setAttribute('fill', 'none');
        
        const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)) * 1.5;
        path.style.setProperty('--path-length', length);

        if (child.isCompleted) {
            path.setAttribute('stroke', '#475569'); 
            path.setAttribute('stroke-width', '2');
            path.setAttribute('opacity', '0.4');
        } else {
            path.setAttribute('stroke', '#3b82f6'); 
            path.setAttribute('stroke-width', '3');
            path.setAttribute('opacity', '1');
        }

        // FIX: Only draw lines to grandchildren if THIS child is expanded!
        if (child.isExpanded && child.children.length > 0) {
            child.children.forEach(grandchild => drawConnection(child, grandchild));
        }
    }

    // FIX: Only draw lines from roots if the root is expanded!
    rootTasks.forEach(root => {
        if (root.isExpanded && root.children.length > 0) {
            root.children.forEach(child => drawConnection(root, child));
        }
    });

    Array.from(svgLayer.querySelectorAll('path')).forEach(path => {
        if (!activePathIds.has(path.id)) path.remove();
    });
}

function updateTreeLayout() {
    if (rootTasks.length === 0) return;

    // STEP 1: Temporarily unhide ALL nodes across the entire app. 
    // We MUST do this so their HTML elements have a physical height for calculateSubtreeHeight to measure!
    const allNodes = [];
    const gatherNodes = (node) => { allNodes.push(node); node.children.forEach(gatherNodes); };
    rootTasks.forEach(gatherNodes);
    rootTasks.sort((a, b) => {
        // Booleans cast to numbers: false is 0, true is 1.
        // 0 - 1 = -1 (incomplete goes up)
        // 1 - 0 = 1 (complete goes down)
        return a.isCompleted - b.isCompleted;
    });
    allNodes.forEach(node => node.element.classList.remove('hidden'));

    // STEP 2: Measure everything
    void document.body.offsetHeight;
    rootTasks.forEach(root => calculateSubtreeHeight(root));
    
    // STEP 3: Hide them all again!
    allNodes.forEach(node => node.element.classList.add('hidden'));

    // STEP 4: Calculate positions (assignPositions will automatically unhide the nodes that are supposed to be visible)
    const rootStartX = 0; 
    const ROOT_GAP = 100; 
    
    const totalForestHeight = rootTasks.reduce((sum, root) => sum + root.subtreeHeight, 0) 
                              + ((rootTasks.length - 1) * ROOT_GAP);
    
    let currentTopY = -(totalForestHeight / 2);
    
    rootTasks.forEach(root => {
        const rootCenterY = currentTopY + (root.subtreeHeight / 2);
        assignPositions(root, rootStartX, rootCenterY);
        currentTopY += root.subtreeHeight + ROOT_GAP;
    });

    drawLines();
    saveToLocalStorage();
}

function downloadBackup() {
    // 1. Grab the live data directly from the array, NOT local storage.
    // This ensures you can download even if the user hasn't made a change yet.
    const data = {
        timestamp: Date.now(), // Create a fresh timestamp for the backup file
        roots: rootTasks.map(root => serializeNode(root)) // We will define serializeNode next
    };

    // 2. Convert to JSON and create a Blob
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // 3. Create the temporary download link
    const a = document.createElement('a');
    a.href = url;
    
    // Create a clean filename like: todo-backup-2023-10-27T14-30-00.json
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `todo-backup-${dateStr}.json`;
    
    // 4. Append, Click, and Cleanup (Crucial for Firefox and Safari)
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
// --- Gear Menu Toggle ---
const gearBtn = document.getElementById('gear-btn');
const gearMenu = document.getElementById('gear-menu');

gearBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from immediately closing it
    gearMenu.classList.toggle('opacity-0');
    gearMenu.classList.toggle('scale-95');
    gearMenu.classList.toggle('pointer-events-none');
    gearBtn.classList.toggle('rotate-90');
});

// Close menu if clicking anywhere else on the canvas
document.addEventListener('click', () => {
    gearMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    gearBtn.classList.remove('rotate-90');
});

// --- Clear List Logic ---
function confirmClearList() {
    // 1. Close the gear menu immediately so it's not hovering open behind the modal
    gearMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    gearBtn.classList.remove('rotate-90');

    // 2. Trigger the modal
    openConfirmModal(
        () => {
            // Wipe the current canvas completely clean
            [...rootTasks].forEach(root => root.removeNode()); 
            
            // Safety net: Destroy any lingering DOM elements
            document.querySelectorAll('.node-container').forEach(el => el.remove());
            
            // Reset state arrays and layers
            rootTasks.length = 0;
            svgLayer.innerHTML = '';
            
            // Spawn the starting task (this handles updateTreeLayout and saveToLocalStorage for us)
            spawnDefaultTask();
            
            // Re-center the camera
            cameraX = window.innerWidth / 2;
            cameraY = window.innerHeight / 2;
            scale = 1;
            updateCanvas();
        },
        "Are you sure you want to completely clear your board? This cannot be undone unless you have a downloaded backup.",
        "Clear Entire Board",
        "Yes, Delete Everything"
    );
}

// --- Data Persistence (Save & Load) ---
function saveToLocalStorage() {
    const data = {
        timestamp: Date.now(),
        roots: rootTasks.map(root => serializeNode(root))
    };
    localStorage.setItem('todoTreeData', JSON.stringify(data));
}

function serializeNode(node) {
    return {
        title: node.title,
        description: node.description,
        dueDate: node.dueDate,
        links: node.links,
        isCompleted: node.isCompleted,
        isExpanded: node.isExpanded,
        color: node.color,
        children: node.children.map(child => serializeNode(child))
    };
}

function deserializeNode(data, parent = null) {
    const node = new TodoNode(data.title, 0, 0, parent, data.color);
    node.description = data.description || '';
    node.dueDate = data.dueDate || '';
    node.links = data.links || [];
    node.isCompleted = data.isCompleted || false;
    node.isExpanded = data.isExpanded !== undefined ? data.isExpanded : true; 

    node.element.querySelector('.node-title').innerText = node.title;
    node.element.querySelector('.node-desc').innerText = node.description;
    if (node.dueDate) node.element.querySelector('.node-date').value = node.dueDate;
    
    node.checkbox.checked = node.isCompleted;
    node.renderLinks();

    // 2. Attach all children first
    if (data.children) {
        node.children = data.children.map(childData => deserializeNode(childData, node));
    }
    
    node.updateVisualStyle();
    
    // 3. FIX: Now that all children are attached, force the node to calculate 
    // its progress organically based on its actual tree structure.
    node.calculateProgress(); 

    return node;
}
function loadFromData(data) {
    // 1. Wipe the current canvas completely clean
    // FIX: Spread into a new array so we don't skip items while deleting
    [...rootTasks].forEach(root => root.removeNode()); 
    
    // Safety net: Destroy any lingering DOM elements just in case
    document.querySelectorAll('.node-container').forEach(el => el.remove());
    
    rootTasks.length = 0;
    svgLayer.innerHTML = '';

    // 2. Rebuild the nodes from the JSON data
    if (data && data.roots && data.roots.length > 0) {
        data.roots.forEach(rootData => {
            const rootNode = deserializeNode(rootData, null);
            rootTasks.push(rootNode);
        });
    } else {
        // Fallback if they upload an empty or malformed file
        spawnDefaultTask();
    }

    // 3. Force layout to arrange the newly loaded nodes & save
    updateTreeLayout();
}



function uploadBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const uploadedData = JSON.parse(e.target.result);
            const currentDataStr = localStorage.getItem('todoTreeData');
            
            if (currentDataStr) {
                const currentData = JSON.parse(currentDataStr);
                
                // Compare timestamps. If current is newer, warn them.
                if (currentData.timestamp && uploadedData.timestamp < currentData.timestamp) {
                    openConfirmModal(
                        () => { loadFromData(uploadedData); }, 
                        "The file you are uploading is older than your current list. Overwriting will cause you to lose recent changes.", 
                        "Older Backup Detected", 
                        "Overwrite Anyway"
                    );
                    event.target.value = ''; 
                    return; 
                }
            }
            
            // If no conflict, just load it
            loadFromData(uploadedData);

            
        } catch (error) {
            console.error("Failed to parse backup:", error);
            alert("Invalid backup file.");
        }
        event.target.value = ''; // Reset input so you can re-upload the same file if needed
    };
    reader.readAsText(file);
}
// --- Initialize App ---
const savedData = localStorage.getItem('todoTreeData');

if (savedData) {
    try {
        loadFromData(JSON.parse(savedData));
        updateTreeLayout();
    } catch (e) {
        console.error("Failed to load saved data", e);
        spawnDefaultTask();
    }
} else {
    spawnDefaultTask();
}

function spawnDefaultTask() {
    const initialTask = new TodoNode("Make List...", 0, 0);
    initialTask.description = "The first task on your to-do list should always be make list so you have something to check off.";
    initialTask.element.querySelector('.node-desc').innerText = initialTask.description;
    rootTasks.push(initialTask);
    setActiveNode(initialTask);
}


// Calculate layout and force initial visual paint

updateTreeLayout();
recenterCamera();

setTimeout(() => {
    updateTreeLayout();
    recenterCamera();
}, 500);
