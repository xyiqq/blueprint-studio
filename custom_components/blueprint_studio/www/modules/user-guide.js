/** USER-GUIDE.JS | Purpose: Interactive User Guide for Blueprint Studio */

import { state, elements } from './state.js';
import { t } from './translations.js';

const guideContent = [
    {
        id: 'getting-started',
        group: 'Basics',
        title: 'Getting Started',
        icon: 'rocket_launch',
        content: `
            <h1>Welcome to Blueprint Studio! 🚀</h1>
            <p>Blueprint Studio is a modern, professional-grade IDE for Home Assistant. It's designed to make editing your configuration files as seamless as using VS Code, but directly within your browser.</p>
            
            <div class="user-guide-tip">
                <div class="user-guide-tip-title"><span class="material-icons">info</span> Pro Tip</div>
                Blueprint Studio is <strong>admin-only</strong> for security. Only users with administrator privileges can access it.
            </div>

            <h2>Interface Overview</h2>
            <ul>
                <li><strong>Sidebar (Left):</strong> Navigate your files, search globally, or manage Git changes.</li>
                <li><strong>Editor (Center):</strong> Your primary workspace for editing code. Supports split-view!</li>
                <li><strong>Toolbar (Top):</strong> Quick access to Save, Search, Git, and other tools.</li>
                <li><strong>Status Bar (Bottom):</strong> Cursor info, file type, and theme settings.</li>
            </ul>

            <div class="feature-grid">
                <div class="feature-card">
                    <div class="feature-card-icon"><span class="material-icons">folder</span></div>
                    <div class="feature-card-title">File Explorer</div>
                    <div class="feature-card-desc">Navigate, create, rename, and organize your configuration files.</div>
                </div>
                <div class="feature-card">
                    <div class="feature-card-icon"><span class="material-icons">psychology</span></div>
                    <div class="feature-card-title">AI Copilot</div>
                    <div class="feature-card-desc">Get help writing automations and fixing YAML errors.</div>
                </div>
            </div>
        `
    },
    {
        id: 'editor-features',
        group: 'Basics',
        title: 'The Editor',
        icon: 'edit',
        content: `
            <h1>Powerful Editing Tools</h1>
            <p>Our editor is built on CodeMirror 5, optimized for Home Assistant configuration. It's fast, reliable, and packed with features.</p>
            
            <h2>Syntax Highlighting & Intellense</h2>
            <p>Automatically detects and highlights YAML, JSON, Python, and more. When editing YAML, it provides Home Assistant-specific autocomplete for entities and domains.</p>

            <h2>Real-time YAML Validation <button class="user-guide-show-me" data-target="btn-validate">Show Me</button></h2>
            <p>Catch errors before you save. Blueprint Studio lints your YAML in real-time. Look for the red marks in the gutter or red underlines in the code.</p>

            <h2>Smart Autocomplete</h2>
            <p>Type <code>light.</code> or <code>switch.</code> to see a list of your real Home Assistant entities. It also suggests keys for common HA patterns like <code>service:</code> or <code>entity_id:</code>.</p>

            <h2>Format & Indent <button class="user-guide-show-me" data-target="btn-format">Show Me</button></h2>
            <p>Messy YAML? Click the Format button or press <code>Shift+Alt+F</code> to instantly clean up your indentation and structure.</p>

            <h2>Split View <button class="user-guide-show-me" data-target="btn-split-vertical">Show Me</button></h2>
            <p>Edit two files side-by-side. Click the split icon in the toolbar or press <code>Ctrl+\\</code> (or <code>Cmd+\\</code>) to toggle split view. You can drag and drop tabs between panes.</p>
        `
    },
    {
        id: 'shortcuts',
        group: 'Basics',
        title: 'Keyboard Shortcuts',
        icon: 'keyboard',
        content: `
            <h1>Boost Your Productivity ⚡</h1>
            <p>Blueprint Studio supports professional keyboard shortcuts to help you work faster. Most shortcuts match VS Code standards.</p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <th style="text-align: left; padding: 12px;">Action</th>
                    <th style="text-align: left; padding: 12px;">Shortcut</th>
                </tr>
                <tr><td style="padding: 8px;"><strong>Save Current File</strong></td><td style="padding: 8px;"><code>Ctrl+S</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Save All Files</strong></td><td style="padding: 8px;"><code>Ctrl+Shift+S</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Command Palette</strong></td><td style="padding: 8px;"><code>Ctrl+K</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Quick Open File</strong></td><td style="padding: 8px;"><code>Ctrl+E</code> or <code>Ctrl+P</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Local Find</strong></td><td style="padding: 8px;"><code>Ctrl+F</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Local Replace</strong></td><td style="padding: 8px;"><code>Ctrl+H</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Global Search</strong></td><td style="padding: 8px;"><code>Ctrl+Shift+F</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Toggle Sidebar</strong></td><td style="padding: 8px;"><code>Ctrl+B</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Toggle Split View</strong></td><td style="padding: 8px;"><code>Ctrl+\\</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Toggle Terminal</strong></td><td style="padding: 8px;"><code>Ctrl+\`</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Format YAML</strong></td><td style="padding: 8px;"><code>Shift+Alt+F</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Insert UUID</strong></td><td style="padding: 8px;"><code>Ctrl+Shift+U</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Next Tab</strong></td><td style="padding: 8px;"><code>Ctrl+Shift+]</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Previous Tab</strong></td><td style="padding: 8px;"><code>Ctrl+Shift+[</code></td></tr>
                <tr><td style="padding: 8px;"><strong>Close Tab</strong></td><td style="padding: 8px;"><code>Alt+W</code></td></tr>
            </table>

            <div class="user-guide-tip">
                <div class="user-guide-tip-title"><span class="material-icons">bolt</span> Command Palette</div>
                Press <strong>Ctrl+K</strong> to open the Command Palette. It's the fastest way to run any command, change themes, or navigate files without touching your mouse.
            </div>
        `
    },
    {
        id: 'search-replace',
        group: 'Management',
        title: 'Search & Replace',
        icon: 'search',
        content: `
            <h1>Finding Everything</h1>
            <p>Blueprint Studio offers three levels of search to help you find exactly what you need.</p>
            
            <h2>1. Local Search (Ctrl+F) <button class="user-guide-show-me" data-target="btn-search">Show Me</button></h2>
            <p>Search within the currently active file. Supports Match Case, Whole Word, and Regular Expressions.</p>

            <h2>2. Quick File Search (Ctrl+E)</h2>
            <p>The fastest way to jump between files. Just type a part of the filename and hit Enter.</p>

            <h2>3. Global Search (Ctrl+Shift+F) <button class="user-guide-show-me" data-target="activity-search">Show Me</button></h2>
            <p>Search across your <strong>entire</strong> configuration folder. You can filter by file extensions (e.g., <code>*.yaml</code>) or exclude folders (e.g., <code>!blueprints/</code>).</p>

            <h2>Global Replace <button class="user-guide-show-me" data-target="btn-toggle-replace-all">Show Me</button></h2>
            <p>Need to rename an entity everywhere? Global Replace lets you preview changes across multiple files before committing them all at once.</p>
        `
    },
    {
        id: 'file-management',
        group: 'Management',
        title: 'File Management',
        icon: 'folder_copy',
        content: `
            <h1>Organizing Your Workspace</h1>
            <p>Manage your entire configuration directory with ease.</p>
            
            <h2>Creating & Organizing <button class="user-guide-show-me" data-target="btn-new-file">Show Me</button></h2>
            <ul>
                <li><strong>New File/Folder:</strong> Click the <code>+</code> icons in the toolbar or right-click in the file tree.</li>
                <li><strong>Drag & Drop:</strong> Move files between folders by simply dragging them.</li>
                <li><strong>Favorites:</strong> Right-click important files and select "Pin to Favorites" to keep them at the top.</li>
            </ul>

            <h2>Advanced Operations</h2>
            <p>Right-click any file to access: <strong>Duplicate</strong>, <strong>Move</strong>, <strong>Rename</strong>, and <strong>Download</strong>.</p>

            <h2>Bulk Actions <button class="user-guide-show-me" data-target="btn-toggle-select">Show Me</button></h2>
            <p>Click the selection icon to enter Multi-Select mode. You can delete or download multiple files at once.</p>

            <h2>SFTP / Remote Support <button class="user-guide-show-me" data-target="activity-sftp">Show Me</button></h2>
            <p>Connect to remote servers via SSH/SFTP. Browse and edit files on other Home Assistant instances or remote machines as if they were local.</p>
        `
    },
    {
        id: 'ai-copilot',
        group: 'Advanced',
        title: 'AI Studio Copilot',
        icon: 'psychology',
        content: `
            <h1>Your AI Pairing Partner 🧠</h1>
            <p>AI Copilot is a senior Home Assistant expert that lives in your sidebar. It understands your specific entities and configuration.</p>
            
            <h2>Example Prompts</h2>
            <ul>
                <li><em>"Write an automation that turns on the living room light when my motion sensor detects movement."</em></li>
                <li><em>"Why is this YAML giving me an error? [paste code]"</em></li>
                <li><em>"Create a movie scene that dims the lights and turns on the TV."</em></li>
                <li><em>"Explain how the choose action works in Home Assistant."</em></li>
            </ul>

            <h2>Key Features <button class="user-guide-show-me" data-target="btn-ai-studio">Show Me</button></h2>
            <ul>
                <li><strong>One-Click Insert:</strong> AI generates code; you click one button to insert it directly into your file.</li>
                <li><strong>Entity Context:</strong> It scans your real entities so it never makes up names.</li>
                <li><strong>Local or Cloud:</strong> Use Google Gemini, OpenAI, or run fully locally with Ollama.</li>
            </ul>

            <div class="user-guide-tip">
                <div class="user-guide-tip-title"><span class="material-icons">lock</span> Security</div>
                The AI Copilot only accesses your files when you interact with it. Your API keys are stored locally and securely within your Home Assistant instance.
            </div>
        `
    },
    {
        id: 'git-integration',
        group: 'Advanced',
        title: 'Git & GitHub',
        icon: 'account_tree',
        content: `
            <h1>Version Control Made Easy 🔗</h1>
            <p>Stop worrying about breaking your config. Version control lets you travel back in time.</p>
            
            <h2>The Standard Workflow <button class="user-guide-show-me" data-target="btn-git-status">Show Me</button></h2>
            <ol>
                <li><strong>Pull:</strong> Get latest changes from GitHub.</li>
                <li><strong>Edit:</strong> Make your changes in the editor.</li>
                <li><strong>Stage (+):</strong> Select which files you want to include in your next "save-point".</li>
                <li><strong>Commit:</strong> Save those changes to your local history with a message.</li>
                <li><strong>Push:</strong> Upload your local history to GitHub.</li>
            </ol>

            <h2>Safety Features</h2>
            <ul>
                <li><strong>Visual Diff:</strong> Click a modified file in the Git panel to see exactly what you changed side-by-side.</li>
                <li><strong>Git Exclusions:</strong> Easily manage your <code>.gitignore</code> through a simple UI to keep secrets out of GitHub.</li>
                <li><strong>Gitea Support:</strong> We also support self-hosted Gitea instances.</li>
            </ul>
        `
    },
    {
        id: 'blueprint-generator',
        group: 'Advanced',
        title: 'Blueprint Tools 📐',
        icon: 'architecture',
        content: `
            <h1>Mastering Blueprints</h1>
            <p>Blueprint Studio provides a complete toolset for both using and creating Blueprints.</p>
            
            <h2>1. Use Blueprint (Generator) <button class="user-guide-show-me" data-target="btn-use-blueprint">Show Me</button></h2>
            <p>When you open any Blueprint file, click <strong>Use Blueprint</strong> to open a visual form. It uses your real Home Assistant data (Entities, Areas, etc.) to generate a ready-to-use automation.</p>

            <h2>2. Automation to Blueprint Converter</h2>
            <p>Have a great automation you want to share or reuse? You can convert it to a Blueprint in seconds!</p>
            <ul>
                <li><strong>Full File:</strong> Open your automation file, press <code>Ctrl+K</code>, and select <strong>"Convert to Blueprint"</strong>.</li>
                <li><strong>Selection:</strong> Highlight just the part of the code you want to convert, press <code>Ctrl+K</code>, and select <strong>"Convert to Blueprint (or Selection)"</strong>.</li>
            </ul>
            <p>Blueprint Studio will analyze the YAML, identify the entities/inputs, and generate a new Blueprint file in your <code>blueprints/automation/</code> folder.</p>

            <h2>3. New Blueprint Template</h2>
            <p>Starting from scratch? Use the <strong>"New Blueprint"</strong> command in the Command Palette (<code>Ctrl+K</code>) to generate a perfectly formatted boilerplate with all the required Home Assistant metadata.</p>
        `
    },
    {
        id: 'ha-tools',
        group: 'Advanced',
        title: 'Home Assistant Tools',
        icon: 'settings_remote',
        content: `
            <h1>Integrated HA Tools</h1>
            <p>Blueprint Studio is deeply integrated with Home Assistant core services.</p>
            
            <h2>Config Check & Restart <button class="user-guide-show-me" data-target="btn-restart-ha">Show Me</button></h2>
            <p>Finished editing? Run a configuration check directly from the toolbar. If it passes, you can restart Home Assistant without leaving the app.</p>

            <h2>Terminal (SSH) <button class="user-guide-show-me" data-target="btn-terminal">Show Me</button></h2>
            <p>Need the command line? Open the integrated terminal to run shell commands, check logs, or manage Docker containers. You can even save multiple SSH host profiles.</p>
        `
    },
    {
        id: 'privacy-connectivity',
        group: 'Advanced',
        title: 'Privacy & Connectivity',
        icon: 'security',
        content: `
            <h1>Local-First & Privacy</h1>
            <p>Blueprint Studio is designed with a "Local-First" philosophy, but some features require internet connectivity.</p>
            
            <h2>Does it require Cloudflare?</h2>
            <p>Blueprint Studio does <strong>not</strong> require a Cloudflare Tunnel or account. All editor libraries (CodeMirror, Highlight.js, fonts, etc.) are bundled locally and served directly from your Home Assistant instance — no internet connection is required.</p>
            <div class="user-guide-tip">
                <div class="user-guide-tip-title"><span class="material-icons">lan</span> Offline Use</div>
                While most assets are cached by the Service Worker for offline use, an initial internet connection is required to load these libraries for the first time.
            </div>

            <h2>What is strictly local?</h2>
            <ul>
                <li><strong>File Operations:</strong> Reading, writing, and managing your configuration files.</li>
                <li><strong>Editor Logic:</strong> All YAML validation and syntax highlighting happens in your browser.</li>
                <li><strong>Terminal:</strong> Local SSH connections to your Home Assistant instance.</li>
            </ul>

            <h2>What requires Internet?</h2>
            <ul>
                <li><strong>GitHub/Gitea:</strong> Pushing and pulling changes to remote repositories.</li>
                <li><strong>AI Copilot (Cloud):</strong> Using Google Gemini or OpenAI providers.</li>
                <li><strong>CDN Assets:</strong> Initial loading of professional editor libraries.</li>
            </ul>
            
            <p>If you use <strong>Local AI (Ollama)</strong> and have pre-loaded the editor libraries, Blueprint Studio can operate almost entirely within your local network.</p>
        `
    },
    {
        id: 'customization',
        group: 'Settings',
        title: 'Customization',
        icon: 'palette',
        content: `
            <h1>Personalize Your IDE 🎨</h1>
            <p>Blueprint Studio is designed to be as comfortable as your desktop editor.</p>
            
            <h2>Visual Themes <button class="user-guide-show-me" data-target="theme-toggle">Show Me</button></h2>
            <p>Choose from professional themes: <strong>Dark</strong>, <strong>Ocean</strong>, <strong>Dracula</strong>, <strong>Glass</strong>, and more. Or use <strong>Auto</strong> to match your Home Assistant theme.</p>

            <h2>Editor Settings <button class="user-guide-show-me" data-target="btn-app-settings">Show Me</button></h2>
            <ul>
                <li><strong>Fonts:</strong> Support for JetBrains Mono, Fira Code, and other popular coding fonts.</li>
                <li><strong>Layout:</strong> Adjust font size, tab spacing, and sidebar width.</li>
                <li><strong>Behavior:</strong> Toggle word wrap, line numbers, and auto-save.</li>
            </ul>

            <h2>Syntax Colors</h2>
            <p>Don't like the default colors? You can customize the color of every syntax element: comments, keywords, strings, and numbers.</p>
        `
    }
];

/**
 * Shows the User Guide modal
 */
export function showUserGuide() {
    let modalOverlay = document.getElementById('modal-user-guide-overlay');
    
    if (!modalOverlay) {
        modalOverlay = createUserGuideModal();
    }
    
    modalOverlay.classList.add('visible');
    
    // Select first item by default
    const firstItem = modalOverlay.querySelector('.user-guide-nav-item');
    if (firstItem) firstItem.click();
}

/**
 * Creates the User Guide modal DOM
 */
function createUserGuideModal() {
    const overlay = document.createElement('div');
    overlay.id = 'modal-user-guide-overlay';
    overlay.className = 'modal-overlay';
    
    overlay.innerHTML = `
        <div class="modal user-guide-modal">
            <div class="modal-header">
                <div class="modal-title">Blueprint Studio User Guide</div>
                <button class="modal-close" id="btn-close-user-guide">
                    <span class="material-icons">close</span>
                </button>
            </div>
            <div class="user-guide-container">
                <div class="user-guide-sidebar">
                    <div class="user-guide-search">
                        <input type="text" id="user-guide-search-input" placeholder="Search guide...">
                    </div>
                    <div class="user-guide-nav" id="user-guide-nav">
                        <!-- Nav items will be injected here -->
                    </div>
                </div>
                <div class="user-guide-content" id="user-guide-content">
                    <!-- Content will be injected here -->
                </div>
            </div>
        </div>
        <div class="guide-overlay" id="guide-pulse-overlay"></div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    overlay.querySelector('#btn-close-user-guide').addEventListener('click', () => {
        overlay.classList.remove('visible');
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('visible');
    });
    
    const navContainer = overlay.querySelector('#user-guide-nav');
    renderNav(navContainer);
    
    const searchInput = overlay.querySelector('#user-guide-search-input');
    searchInput.addEventListener('input', (e) => {
        renderNav(navContainer, e.target.value);
    });
    
    return overlay;
}

/**
 * Renders the navigation sidebar
 */
function renderNav(container, filter = '') {
    container.innerHTML = '';
    
    const filtered = guideContent.filter(item => 
        item.title.toLowerCase().includes(filter.toLowerCase()) ||
        item.group.toLowerCase().includes(filter.toLowerCase())
    );
    
    let currentGroup = '';
    
    filtered.forEach(item => {
        if (item.group !== currentGroup) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'user-guide-nav-group';
            groupDiv.textContent = item.group;
            container.appendChild(groupDiv);
            currentGroup = item.group;
        }
        
        const navItem = document.createElement('div');
        navItem.className = 'user-guide-nav-item';
        navItem.innerHTML = `
            <span class="material-icons" style="font-size: 18px;">${item.icon}</span>
            <span>${item.title}</span>
        `;
        
        navItem.addEventListener('click', () => {
            // Update active state
            container.querySelectorAll('.user-guide-nav-item').forEach(el => el.classList.remove('active'));
            navItem.classList.add('active');
            
            // Render content
            renderContent(item);
        });
        
        container.appendChild(navItem);
    });
}

/**
 * Renders the content area
 */
function renderContent(item) {
    const contentArea = document.getElementById('user-guide-content');
    contentArea.innerHTML = item.content;
    
    // Scroll to top
    contentArea.scrollTop = 0;
    
    // Add "Show Me" listeners
    contentArea.querySelectorAll('.user-guide-show-me').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            showMe(targetId);
        });
    });
}

/**
 * "Show Me" feature - highlights a UI element
 */
function showMe(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Close the guide modal temporarily?
    const guideModal = document.getElementById('modal-user-guide-overlay');
    guideModal.classList.remove('visible');
    
    // Show overlay
    const pulseOverlay = document.getElementById('guide-pulse-overlay');
    pulseOverlay.classList.add('visible');
    
    // Add highlight class
    element.classList.add('guide-highlight');
    
    // Ensure element is visible (e.g. if in a hidden toolbar group)
    const parentGroup = element.closest('.toolbar-group');
    let originalDisplay = '';
    if (parentGroup && window.getComputedStyle(parentGroup).display === 'none') {
        originalDisplay = parentGroup.style.display;
        parentGroup.style.display = 'flex';
    }

    // Scroll into view if needed
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // After 3 seconds, remove highlight and show guide again
    setTimeout(() => {
        element.classList.remove('guide-highlight');
        pulseOverlay.classList.remove('visible');
        if (parentGroup && originalDisplay !== undefined) {
            parentGroup.style.display = originalDisplay;
        }
        guideModal.classList.add('visible');
    }, 3000);
}
