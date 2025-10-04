// Git-Done Frontend Application
class GitDoneApp {
    constructor() {
        this.goals = [];
        this.countdownIntervals = new Map();

        // Check if the dashboard exists on the page (i.e., user is logged in)
        if (document.getElementById('dashboard')) {
            this.bindEvents();
            this.loadGoals();
        }
    }

    bindEvents() {
        document.getElementById('goal-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createGoal();
        });
        
        // Add event listener for completion type change
        const completionTypeSelect = document.getElementById('completion-type');
        const completionConditionInput = document.getElementById('completion-condition');
        
        if (completionTypeSelect && completionConditionInput) {
            completionTypeSelect.addEventListener('change', (e) => {
                if (e.target.value === 'issue') {
                    completionConditionInput.placeholder = 'Issue number (e.g., 42 or #42)';
                } else {
                    completionConditionInput.placeholder = 'Completion tag (e.g., #feature-complete)';
                }
            });
        }
    }

    async createGoal() {
        const form = document.getElementById('goal-form');
        const submitButton = form.querySelector('button[type="submit"]');

        // Add loading state
        const originalText = submitButton.textContent;
        submitButton.textContent = '🚀 Creating...';
        submitButton.disabled = true;
        submitButton.classList.add('loading');

        // The backend knows the user, so we don't need to send user_github_id
        const goalData = {
            description: document.getElementById('description').value,
            deadline: document.getElementById('deadline').value,
            repo_url: document.getElementById('repo-url').value,
            completion_condition: document.getElementById('completion-condition').value,
            completion_type: document.getElementById('completion-type').value
        };

        try {
            const response = await fetch('/api/goals', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(goalData)
            });

            if (response.ok) {
                const newGoal = await response.json();
                console.log('New goal created:', newGoal);
                this.goals.unshift(newGoal); // Add to beginning for newest first
                this.renderGoals();
                form.reset();

                // Show success feedback
                this.showNotification('🎉 Goal created successfully!', 'success');
            } else {
                const errorData = await response.json();
                console.error('Failed to create goal:', errorData);
                this.showNotification(`❌ Failed to create goal: ${errorData.error}`, 'error');
            }
        } catch (error) {
            console.error('Error creating goal:', error);
            this.showNotification('❌ Network error. Please try again.', 'error');
        } finally {
            // Reset button state
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            submitButton.classList.remove('loading');
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: var(--border-radius-sm);
            padding: 1rem 1.5rem;
            color: var(--text-primary);
            backdrop-filter: blur(20px);
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            animation: slideInRight 0.3s ease-out;
            max-width: 300px;
        `;

        if (type === 'success') {
            notification.style.borderColor = 'var(--accent)';
            notification.style.boxShadow = `var(--shadow-lg), 0 0 20px var(--accent-glow)`;
        } else if (type === 'error') {
            notification.style.borderColor = 'var(--danger)';
            notification.style.boxShadow = `var(--shadow-lg), 0 0 20px var(--danger-glow)`;
        }

        document.body.appendChild(notification);

        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    async loadGoals() {
        try {
            // This will now only fetch goals for the logged-in user
            const response = await fetch('/api/goals');
            if (response.ok) {
                this.goals = await response.json();
                console.log('Loaded goals:', this.goals);
                this.renderGoals();
            } else {
                console.error('Failed to load goals:', response.status);
            }
        } catch (error) {
            console.error('Error loading goals:', error);
        }
    }

    renderGoals() {
        const container = document.getElementById('goals-container');
        container.innerHTML = ''; // Clear existing goals

        if (this.goals.length === 0) {
            container.innerHTML = `
                <div class="card fade-in-up" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <h3 style="margin-bottom: 1rem; color: var(--text-primary);">🎯 No goals yet</h3>
                    <p>Create your first goal above to start tracking your progress!</p>
                </div>
            `;
            return;
        }

        this.goals.forEach((goal, index) => {
            const goalElement = this.createGoalWidget(goal);
            // Stagger animations
            goalElement.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(goalElement);
        });
    }

    createGoalWidget(goal) {
        const widget = document.createElement('div');
        widget.className = 'goal-widget card fade-in-up';
        widget.id = `goal-${goal.id}`;

        let statusText = '⏱️ Counting down...';
        let statusClass = '';
        if (goal.status === 'completed') {
            statusText = '🎉 Completed! Well done.';
            statusClass = 'completed';
        } else if (goal.status === 'failed') {
            statusText = "⏰ Time's up!";
            statusClass = 'urgent';
        }

        const embedUrl = goal.embed_url || 'Not available';
        const repoName = goal.repo_url.split('/').slice(-2).join('/');
        
        // Determine completion type display
        const completionTypeDisplay = goal.completion_type === 'issue' 
            ? `🎫 Complete when issue ${goal.completion_condition} is closed`
            : `💬 Complete with commit message: ${goal.completion_condition}`;

        widget.innerHTML = `
            <h3>${goal.description}</h3>
            <p style="margin-bottom: 1.5rem;">
                <strong>📁 Repository:</strong> 
                <a href="${goal.repo_url}" target="_blank" rel="noopener noreferrer">${repoName}</a>
            </p>
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                ${completionTypeDisplay}
            </p>
            <div class="countdown ${goal.status === 'completed' ? 'completed' : ''}" id="countdown-${goal.id}">--:--:--</div>
            <div class="goal-status ${statusClass}" id="status-${goal.id}">${statusText}</div>
            <div class="embed-info">
                <p><strong>🔗 Embed URL:</strong></p>
                <input type="text" value="${embedUrl}" readonly onclick="this.select(); this.copyToClipboard()">
                <small>Copy this URL to embed in Notion or other platforms</small>
            </div>
        `;

        // New Addition ICS Download Button
        const icsButton = document.createElement('button');
        icsButton.textContent = '📅 Download .ics';
        icsButton.className = 'btn-secondary';
        icsButton.style.marginTop = '0.5rem';
        icsButton.addEventListener('click', () => {
            // Download directly from backend
            window.location.href = `/api/goals/${goal.id}/calendar`;
        });
        widget.querySelector('.embed-info').appendChild(icsButton);

        // Add copy functionality to embed URL input
        const embedInput = widget.querySelector('input[readonly]');
        embedInput.addEventListener('click', function () {
            this.select();
            navigator.clipboard.writeText(this.value).then(() => {
                // Show temporary feedback
                const small = this.nextElementSibling;
                const originalText = small.textContent;
                small.textContent = '✅ Copied to clipboard!';
                small.style.color = 'var(--success)';
                setTimeout(() => {
                    small.textContent = originalText;
                    small.style.color = 'var(--text-muted)';
                }, 2000);
            });
        });

        // Start countdown after the widget is added to DOM
        if (goal.status === 'active') {
            setTimeout(() => this.startCountdown(goal), 100);
        } else if (goal.status === 'completed') {
            widget.querySelector(`#countdown-${goal.id}`).textContent = '✅ DONE';
        }

        return widget;
    }

    // New ICS Generation Method
    generateICS(goal) {
    const dtStart = new Date(goal.deadline).toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    const dtEnd = new Date(new Date(goal.deadline).getTime() + 3600000) // 1 hour event
                    .toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Git-Done//Goal Calendar//EN
BEGIN:VEVENT
UID:${goal.id}@gitdone.app
DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${goal.description}
DESCRIPTION:Track your goal on Git-Done. Completion tag: ${goal.completion_condition}
URL:${goal.repo_url}
END:VEVENT
END:VCALENDAR
`.trim();

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    return url;
}


    startCountdown(goal) {
        const countdownElement = document.getElementById(`countdown-${goal.id}`);
        if (!countdownElement) {
            console.error(`Countdown element not found for goal ${goal.id}`);
            return;
        }

        const deadline = new Date(goal.deadline);
        console.log(`Starting countdown for goal ${goal.id}, deadline: ${deadline}`);

        const updateCountdown = () => {
            // Using UTC-based calculation for global compatibility
            const now = new Date();
            const timeLeft = deadline - now;
            const timeRemaining = Math.max(0, Math.floor(timeLeft / 1000)); // Convert to seconds

            if (timeRemaining <= 0) {
                countdownElement.textContent = '⏰ TIME\'S UP';
                countdownElement.classList.add('urgent');
                document.getElementById(`status-${goal.id}`).textContent = "⏰ Time's up! Push that commit!";
                document.getElementById(`status-${goal.id}`).classList.add('urgent');
                clearInterval(this.countdownIntervals.get(goal.id));
                return;
            }

            const days = Math.floor(timeRemaining / 86400);
            const hours = Math.floor((timeRemaining % 86400) / 3600);
            const minutes = Math.floor((timeRemaining % 3600) / 60);
            const seconds = timeRemaining % 60;

            let displayText;
            if (days > 0) {
                displayText = `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                displayText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }

            countdownElement.textContent = displayText;

            // Add urgency classes and status messages based on time remaining
            if (timeRemaining < 3600) { // Less than 1 hour
                countdownElement.classList.add('urgent');
                document.getElementById(`status-${goal.id}`).textContent = "🔥 Less than 1 hour left!";
            } else if (timeRemaining < 86400) { // Less than 1 day
                document.getElementById(`status-${goal.id}`).textContent = "⚡ Less than 1 day left!";
            } else if (timeRemaining < 604800) { // Less than 1 week
                document.getElementById(`status-${goal.id}`).textContent = `📅 ${days} day${days > 1 ? 's' : ''} remaining`;
            } else {
                document.getElementById(`status-${goal.id}`).textContent = `🎯 Deadline: ${deadline.toLocaleDateString()}`;
            }
        };

        // Clear any existing interval for this goal before starting a new one
        if (this.countdownIntervals.has(goal.id)) {
            clearInterval(this.countdownIntervals.get(goal.id));
        }

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        this.countdownIntervals.set(goal.id, interval);
    }
}

// Theme Toggle Functionality
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.init();
    }

    init() {
        // Set initial theme
        document.documentElement.setAttribute('data-theme', this.currentTheme);

        // Bind toggle button
        const toggleButton = document.getElementById('theme-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => this.toggleTheme());
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        localStorage.setItem('theme', this.currentTheme);

        // Add a subtle animation effect
        document.body.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            document.body.style.transition = '';
        }, 300);
    }
}

// PWA Service Worker Registration
class PWAManager {
    constructor() {
        this.registerServiceWorker();
        this.handleInstallPrompt();
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('PWA: Service Worker registered successfully', registration);
                
                // Listen for updates
                registration.addEventListener('updatefound', () => {
                    console.log('PWA: New service worker version available');
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Show update notification
                            this.showUpdateNotification();
                        }
                    });
                });
                
            } catch (error) {
                console.error('PWA: Service Worker registration failed', error);
            }
        } else {
            console.log('PWA: Service Worker not supported');
        }
    }

    handleInstallPrompt() {
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('PWA: Install prompt available');
            e.preventDefault();
            deferredPrompt = e;
            
            // Show custom install button (optional)
            this.showInstallButton(deferredPrompt);
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA: App installed successfully');
            deferredPrompt = null;
            this.hideInstallButton();
        });
    }

    showInstallButton(deferredPrompt) {
        // Create install button if it doesn't exist
        let installButton = document.getElementById('pwa-install-btn');
        if (!installButton) {
            installButton = document.createElement('button');
            installButton.id = 'pwa-install-btn';
            installButton.className = 'btn-secondary';
            installButton.innerHTML = '📱 Install App';
            
            installButton.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log('PWA: Install prompt outcome:', outcome);
                    deferredPrompt = null;
                    this.hideInstallButton();
                }
            });
            
            document.body.appendChild(installButton);
        }
        
        installButton.style.display = 'block';
    }

    hideInstallButton() {
        const installButton = document.getElementById('pwa-install-btn');
        if (installButton) {
            installButton.style.display = 'none';
        }
    }

    showUpdateNotification() {
        // Simple update notification
        const notification = document.createElement('div');
        notification.className = 'pwa-update-notification';
        notification.innerHTML = `
            📱 App updated! Refresh to get the latest version.
            <button onclick="window.location.reload()">Refresh</button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GitDoneApp();
    new ThemeManager();
    new PWAManager();
});