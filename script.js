/* ====================================
   Learning Diary v4.1.1 - Fix Modal Autoopen
   ==================================== */

const CONFIG = {
    DEBOUNCE_DELAY: 300,
    TOAST_DURATION: 3000,
    MAX_CACHE_SIZE: 50,
    CHAR_COUNT_UPDATE_DELAY: 100,
    UNDO_DELETE_TIMEOUT: 5000,
    SCROLL_TO_TOP_THRESHOLD: 300,
    STORAGE_KEY: 'learningEntries',
    THEME_KEY: 'learningDiaryTheme',
    HINT_DISMISSED_KEY: 'keyboardHintDismissed',
    VALIDATION: {
        topic: { minLength: 3, maxLength: 200, required: true },
        content: { minLength: 10, maxLength: 10000, required: true }
    },
    KEYBOARD_SHORTCUTS: {
        SEARCH: { key: 'k', ctrl: true },
        NEW_ENTRY: { key: 'n', ctrl: true },
        EXPORT: { key: 's', ctrl: true },
        HELP: { key: '?' }
    }
};

/* ====================================
   APP INITIALIZATION FLAG
   ==================================== */

let appInitialized = false;

/* ====================================
   UTILITY: DETECT OPERATING SYSTEM
   ==================================== */

const OS = {
    isMac: navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
        navigator.userAgent.toUpperCase().indexOf('MAC') >= 0,

    modifierKey() {
        return this.isMac ? 'Cmd' : 'Ctrl';
    },

    checkModifier(event) {
        return this.isMac ? event.metaKey : event.ctrlKey;
    }
};

/* ====================================
   RIPPLE EFFECT UTILITY
   ==================================== */

const RippleEffect = {
    create(event, element) {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');

        element.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);
    },

    initAll() {
        document.addEventListener('click', (e) => {
            const button = e.target.closest('.btn');
            if (button && !button.disabled) {
                this.create(e, button);
            }
        });
    }
};

/* ====================================
   TRUE LRU CACHE IMPLEMENTATION
   ==================================== */

class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;

        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);

        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        if (this.cache.size >= this.capacity) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }
}

/* ====================================
   STATE MANAGEMENT
   ==================================== */

const AppState = (() => {
    let entries = [];
    let deletedEntry = null;
    let deleteTimer = null;
    const observers = [];

    return {
        getEntries() {
            return Object.freeze([...entries]);
        },

        addEntry(entry) {
            entries.unshift(entry);
            this.notify('add', entry);
            this.save();
        },

        updateEntry(id, updatedData) {
            const index = entries.findIndex(e => e.id === id);
            if (index === -1) return false;

            entries[index] = {
                ...entries[index],
                ...updatedData,
                timestamp: entries[index].timestamp
            };

            this.notify('update', entries[index]);
            this.save();
            return true;
        },

        deleteEntry(id) {
            const index = entries.findIndex(e => e.id === id);
            if (index === -1) return false;

            deletedEntry = { entry: entries[index], index };
            entries.splice(index, 1);

            this.notify('delete', id);
            this.save();
            this.startUndoTimer(id);

            return true;
        },

        undoDelete() {
            if (!deletedEntry || !deleteTimer) return false;

            clearTimeout(deleteTimer);
            deleteTimer = null;

            entries.splice(deletedEntry.index, 0, deletedEntry.entry);

            const restored = deletedEntry.entry;
            deletedEntry = null;

            this.notify('restore', restored);
            this.save();

            return true;
        },

        startUndoTimer(id) {
            if (deleteTimer) {
                clearTimeout(deleteTimer);
            }

            deleteTimer = setTimeout(() => {
                deletedEntry = null;
                deleteTimer = null;
                this.notify('deleteConfirmed', id);
            }, CONFIG.UNDO_DELETE_TIMEOUT);
        },

        clearAll() {
            entries = [];
            deletedEntry = null;
            if (deleteTimer) {
                clearTimeout(deleteTimer);
                deleteTimer = null;
            }
            this.notify('clear');
            this.save();
        },

        setEntries(newEntries) {
            entries = newEntries;
            this.notify('load');
            this.save();
        },

        getEntryById(id) {
            return entries.find(e => e.id === id);
        },

        subscribe(observer) {
            observers.push(observer);
        },

        notify(action, data) {
            observers.forEach(observer => observer(action, data));
        },

        save() {
            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(entries));
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
                ToastManager.show('Impossibile salvare i dati. Storage pieno?', 'error');
            }
        },

        load() {
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (data) {
                    entries = JSON.parse(data);
                    this.notify('load');
                }
            } catch (e) {
                console.error('Failed to load from localStorage:', e);
                ToastManager.show('Errore nel caricamento dei dati', 'error');
            }
        }
    };
})();

/* ====================================
   VALIDATION SYSTEM
   ==================================== */

const Validator = {
    validateEntry(data) {
        const errors = [];

        if (!data.topic || data.topic.length < CONFIG.VALIDATION.topic.minLength) {
            errors.push(`L'argomento deve avere almeno ${CONFIG.VALIDATION.topic.minLength} caratteri`);
        }
        if (data.topic && data.topic.length > CONFIG.VALIDATION.topic.maxLength) {
            errors.push(`L'argomento non può superare ${CONFIG.VALIDATION.topic.maxLength} caratteri`);
        }

        if (!data.content || data.content.length < CONFIG.VALIDATION.content.minLength) {
            errors.push(`Il contenuto deve avere almeno ${CONFIG.VALIDATION.content.minLength} caratteri`);
        }
        if (data.content && data.content.length > CONFIG.VALIDATION.content.maxLength) {
            errors.push(`Il contenuto non può superare ${CONFIG.VALIDATION.content.maxLength} caratteri`);
        }

        if (data.link && !this.isValidUrl(data.link)) {
            errors.push('Il link non è un URL valido');
        }
        if (data.link && !this.isHttpUrl(data.link)) {
            errors.push('Il link deve iniziare con http:// o https://');
        }

        if (data.imageUrl && !this.isValidUrl(data.imageUrl)) {
            errors.push('L\'URL dell\'immagine non è valido');
        }
        if (data.imageUrl && !this.isHttpUrl(data.imageUrl)) {
            errors.push('L\'URL dell\'immagine deve iniziare con http:// o https://');
        }

        return { valid: errors.length === 0, errors };
    },

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch {
            return false;
        }
    },

    isHttpUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }
};

/* ====================================
   SEARCH MANAGER WITH TRUE LRU CACHE
   ==================================== */

const SearchManager = {
    cache: new LRUCache(CONFIG.MAX_CACHE_SIZE),

    search(query, entries) {
        if (!query.trim()) {
            this.cache.clear();
            return entries;
        }

        const cacheKey = query.toLowerCase();
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const results = entries.filter(entry => {
            const searchText = [
                entry.topic,
                entry.content,
                entry.link || ''
            ].join(' ').toLowerCase();

            return terms.every(term => searchText.includes(term));
        });

        this.cache.set(cacheKey, results);
        return results;
    },

    clearCache() {
        this.cache.clear();
    }
};

/* ====================================
   DEBOUNCE UTILITY
   ==================================== */

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/* ====================================
   STATISTICS CALCULATOR WITH RAF
   ==================================== */

const StatisticsCalculator = {
    calculate(entries) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        return {
            total: entries.length,
            today: entries.filter(e => {
                const entryDate = new Date(e.timestamp);
                return entryDate >= today;
            }).length,
            week: entries.filter(e => {
                const entryDate = new Date(e.timestamp);
                return entryDate >= weekAgo;
            }).length
        };
    },

    animateCounter(element, target) {
        const current = parseInt(element.textContent) || 0;
        if (current === target) return;

        const duration = 400;
        const startTime = performance.now();
        const difference = target - current;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const easeOut = 1 - Math.pow(1 - progress, 3);
            const value = Math.round(current + (difference * easeOut));

            element.textContent = value;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.textContent = target;
            }
        };

        requestAnimationFrame(animate);
    },

    update(entries) {
        const stats = this.calculate(entries);

        this.animateCounter(document.getElementById('statTotal'), stats.total);
        this.animateCounter(document.getElementById('statToday'), stats.today);
        this.animateCounter(document.getElementById('statWeek'), stats.week);
    }
};

/* ====================================
   CHARACTER COUNTER WITH DEBOUNCING
   ==================================== */

const CharacterCounter = {
    update: debounce(function (textarea, counter) {
        const current = textarea.value.length;
        const max = CONFIG.VALIDATION.content.maxLength;
        const percentage = (current / max) * 100;

        counter.textContent = `${current} / ${max}`;

        counter.classList.remove('warning', 'danger');
        if (percentage >= 100) {
            counter.classList.add('danger');
        } else if (percentage >= 90) {
            counter.classList.add('warning');
        }
    }, CONFIG.CHAR_COUNT_UPDATE_DELAY)
};

/* ====================================
   TOAST MANAGER
   ==================================== */

const ToastManager = {
    container: null,

    init() {
        this.container = document.getElementById('toastContainer');
    },

    show(message, type = 'info', options = {}) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'alert');

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
            undo: '↶'
        };

        let html = `
            <span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
        `;

        if (options.showUndo) {
            html += `
                <div class="toast-actions">
                    <button class="btn btn-secondary" data-action="undo">Annulla</button>
                </div>
            `;
        }

        html += `<button class="toast-close" aria-label="Chiudi notifica">×</button>`;

        toast.innerHTML = html;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        if (options.showUndo) {
            const undoBtn = toast.querySelector('[data-action="undo"]');
            undoBtn.addEventListener('click', () => {
                if (options.onUndo) options.onUndo();
                this.remove(toast);
            });
        }

        this.container.appendChild(toast);

        if (!options.showUndo) {
            setTimeout(() => this.remove(toast), CONFIG.TOAST_DURATION);
        }

        return toast;
    },

    remove(toast) {
        if (!toast.parentNode) return;

        toast.style.animation = 'slideIn 200ms reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 200);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

/* ====================================
   THEME MANAGER
   ==================================== */

const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem(CONFIG.THEME_KEY);

        if (savedTheme) {
            this.setTheme(savedTheme);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.setTheme(prefersDark ? 'dark' : 'light');
        }

        this.updateIcon();
    },

    toggle() {
        const currentTheme = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    },

    setTheme(theme) {
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem(CONFIG.THEME_KEY, theme);
        this.updateIcon();
    },

    updateIcon() {
        const icon = document.getElementById('themeIcon');
        if (!icon) return;

        const isDark = document.body.classList.contains('theme-dark');
        icon.textContent = isDark ? '☀️' : '🌙';
    }
};

/* ====================================
   SCROLL TO TOP MANAGER
   ==================================== */

const ScrollToTopManager = {
    button: null,

    init() {
        this.button = document.getElementById('scrollToTop');
        if (!this.button) return;

        window.addEventListener('scroll', () => this.handleScroll());
    },

    handleScroll() {
        const scrolled = window.pageYOffset || document.documentElement.scrollTop;

        if (scrolled > CONFIG.SCROLL_TO_TOP_THRESHOLD) {
            this.show();
        } else {
            this.hide();
        }
    },

    show() {
        if (this.button) {
            this.button.classList.add('visible');
            this.button.removeAttribute('hidden');
        }
    },

    hide() {
        if (this.button) {
            this.button.classList.remove('visible');
        }
    },

    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
};

/* ====================================
   FORM MANAGER (Collapsible)
   ==================================== */

const FormManager = {
    formSection: null,
    form: null,
    editId: null,

    init() {
        this.formSection = document.getElementById('formSection');
        this.form = document.getElementById('addForm');
    },

    open() {
        if (!this.formSection) return;

        this.formSection.removeAttribute('hidden');
        this.formSection.style.display = '';

        const toggleBtn = document.getElementById('toggleFormBtn');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
        }

        setTimeout(() => {
            const topicField = document.getElementById('topic');
            if (topicField) {
                topicField.focus();
            }
        }, 100);

        this.formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    close() {
        if (!this.formSection) return;

        this.formSection.setAttribute('hidden', '');
        this.formSection.style.display = 'none';

        const toggleBtn = document.getElementById('toggleFormBtn');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
        }

        this.resetForm();
    },

    toggle() {
        if (this.formSection && this.formSection.hasAttribute('hidden')) {
            this.open();
        } else {
            this.close();
        }
    },

    openForEdit(entry) {
        this.open();

        document.getElementById('topic').value = entry.topic;
        document.getElementById('content').value = entry.content;
        document.getElementById('link').value = entry.link || '';
        document.getElementById('imageUrl').value = entry.imageUrl || '';
        document.getElementById('editId').value = entry.id;

        document.getElementById('formTitle').textContent = 'Modifica apprendimento';

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.innerHTML = '<span aria-hidden="true">💾</span> <span id="submitText">Salva modifiche</span>';
            submitBtn.classList.remove('btn-primary');
            submitBtn.classList.add('btn-success');
        }

        const contentTextarea = document.getElementById('content');
        const contentCounter = document.getElementById('contentCounter');
        if (contentTextarea && contentCounter) {
            CharacterCounter.update(contentTextarea, contentCounter);
        }

        this.editId = entry.id;
    },

    resetForm() {
        if (this.form) {
            this.form.reset();
        }

        document.getElementById('editId').value = '';

        const contentCounter = document.getElementById('contentCounter');
        if (contentCounter) {
            contentCounter.textContent = '0 / 10000';
            contentCounter.classList.remove('warning', 'danger');
        }

        document.getElementById('formTitle').textContent = 'Aggiungi nuovo apprendimento';

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.innerHTML = '<span aria-hidden="true">➕</span> <span id="submitText">Aggiungi</span>';
            submitBtn.classList.remove('btn-success');
            submitBtn.classList.add('btn-primary');
        }

        this.editId = null;
    }
};

/* ====================================
   KEYBOARD MANAGER WITH MAC SUPPORT
   ==================================== */

const KeyboardManager = {
    init() {
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.updateModalForOS();
    },

    handleKeydown(e) {
        if (OS.checkModifier(e) && e.key.toLowerCase() === CONFIG.KEYBOARD_SHORTCUTS.SEARCH.key) {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.focus();
            return;
        }

        if (OS.checkModifier(e) && e.key.toLowerCase() === CONFIG.KEYBOARD_SHORTCUTS.NEW_ENTRY.key) {
            e.preventDefault();
            FormManager.toggle();
            return;
        }

        if (OS.checkModifier(e) && e.key.toLowerCase() === CONFIG.KEYBOARD_SHORTCUTS.EXPORT.key) {
            e.preventDefault();
            DataManager.export();
            return;
        }

        if (e.key === CONFIG.KEYBOARD_SHORTCUTS.HELP.key) {
            e.preventDefault();
            ModalManager.toggle();
            return;
        }

        if (e.key === 'Escape') {
            if (DayViewModal.isOpen()) {
                DayViewModal.close();
            } else if (ModalManager.isOpen()) {
                ModalManager.close();
            } else if (FormManager.formSection && !FormManager.formSection.hasAttribute('hidden')) {
                FormManager.close();
            } else if (e.target.matches('input, textarea')) {
                e.target.blur();
            }
        }
    },

    updateModalForOS() {
        const modal = document.getElementById('keyboardModal');
        if (!modal) return;

        const rows = modal.querySelectorAll('tbody tr');
        const modifierKey = OS.modifierKey();

        rows.forEach(row => {
            const keyCell = row.querySelector('td:first-child');
            if (keyCell && keyCell.textContent.includes('Ctrl')) {
                const originalHtml = keyCell.innerHTML;
                keyCell.innerHTML = originalHtml.replace(/Ctrl/g, modifierKey);
            }
        });
    }
};

/* ====================================
   MODAL MANAGER WITH FOCUS TRAP (KEYBOARD SHORTCUTS)
   ==================================== */

const ModalManager = {
    modal: null,
    focusableElements: [],
    firstFocusable: null,
    lastFocusable: null,
    previousFocus: null,

    init() {
        this.modal = document.getElementById('keyboardModal');
        if (!this.modal) return;

        this.modal.addEventListener('keydown', (e) => this.handleFocusTrap(e));
    },

    open() {
        if (!this.modal) return;

        this.previousFocus = document.activeElement;

        this.modal.removeAttribute('hidden');
        this.modal.style.display = 'flex';
        this.modal.setAttribute('aria-hidden', 'false');

        this.updateFocusableElements();

        if (this.firstFocusable) {
            this.firstFocusable.focus();
        }

        document.body.style.overflow = 'hidden';
    },

    close() {
        if (!this.modal) return;

        this.modal.setAttribute('hidden', '');
        this.modal.style.display = 'none';
        this.modal.setAttribute('aria-hidden', 'true');

        document.body.style.overflow = '';

        if (this.previousFocus) {
            this.previousFocus.focus();
        }
    },

    toggle() {
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    },

    isOpen() {
        return this.modal && !this.modal.hasAttribute('hidden');
    },

    updateFocusableElements() {
        const focusableSelectors = [
            'button:not([disabled])',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        this.focusableElements = Array.from(
            this.modal.querySelectorAll(focusableSelectors)
        ).filter(el => {
            return el.closest('.modal-content');
        });

        this.firstFocusable = this.focusableElements[0];
        this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
    },

    handleFocusTrap(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === this.firstFocusable) {
                e.preventDefault();
                if (this.lastFocusable) this.lastFocusable.focus();
            }
        } else {
            if (document.activeElement === this.lastFocusable) {
                e.preventDefault();
                if (this.firstFocusable) this.firstFocusable.focus();
            }
        }
    }
};

/* ====================================
   DAY VIEW MODAL - FIX AUTOOPEN BUG
   ==================================== */

const DayViewModal = {
    modal: null,
    modalBody: null,
    closeBtn: null,
    backdrop: null,
    previousFocus: null,
    currentDate: null,

    init() {
        this.modal = document.getElementById('dayViewModal');
        this.modalBody = document.getElementById('dayViewBody');
        this.closeBtn = document.getElementById('closeDayView');
        this.backdrop = this.modal?.querySelector('.modal-backdrop');

        // Assicurati che il modal sia hidden all'init
        if (this.modal) {
            this.modal.setAttribute('hidden', '');
            this.modal.style.display = 'none';
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.close());
        }
    },

    open(date, entries) {
        // CRITICAL FIX: Blocca apertura se app non è inizializzata
        if (!appInitialized) {
            console.log('DayViewModal: Blocked open during app initialization');
            return;
        }

        if (!this.modal || !this.modalBody) return;

        this.currentDate = date;
        this.previousFocus = document.activeElement;

        this.modal.removeAttribute('hidden');
        this.modal.style.display = 'flex';
        this.modal.setAttribute('aria-hidden', 'false');

        document.body.style.overflow = 'hidden';

        this.renderDayView(date, entries);

        if (this.closeBtn) {
            this.closeBtn.focus();
        }
    },

    close() {
        if (!this.modal) return;

        this.modal.setAttribute('hidden', '');
        this.modal.style.display = 'none';
        this.modal.setAttribute('aria-hidden', 'true');

        document.body.style.overflow = '';

        this.modalBody.innerHTML = '';
        this.currentDate = null;

        if (this.previousFocus) {
            this.previousFocus.focus();
        }
    },

    isOpen() {
        return this.modal && !this.modal.hasAttribute('hidden');
    },

    renderDayView(date, entries) {
        const title = document.getElementById('dayViewTitle');
        if (title) {
            title.textContent = RenderManager.formatDate(entries[0].timestamp);
        }

        const fragment = document.createDocumentFragment();

        const stats = document.createElement('div');
        stats.className = 'day-view-stats';
        stats.innerHTML = `
            <p style="text-align: center; color: var(--color-text-light); margin-bottom: var(--spacing-lg);">
                <strong>${entries.length}</strong> apprendiment${entries.length === 1 ? 'o' : 'i'} in questo giorno
            </p>
        `;
        fragment.appendChild(stats);

        entries.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'entry';
            entryDiv.style.borderBottom = index < entries.length - 1 ? '1px solid var(--color-border-light)' : 'none';
            entryDiv.style.paddingBottom = 'var(--spacing-lg)';
            entryDiv.style.marginBottom = 'var(--spacing-lg)';

            const header = document.createElement('div');
            header.className = 'entry-header';

            const title = document.createElement('h3');
            title.className = 'entry-title';
            title.textContent = entry.topic;

            const time = document.createElement('time');
            time.className = 'entry-time';
            time.setAttribute('datetime', new Date(entry.timestamp).toISOString());
            time.textContent = RenderManager.formatTime(entry.timestamp);

            header.appendChild(title);
            header.appendChild(time);
            entryDiv.appendChild(header);

            const content = document.createElement('div');
            content.className = 'entry-content';
            content.textContent = entry.content;
            entryDiv.appendChild(content);

            if (entry.link) {
                const link = document.createElement('a');
                link.href = entry.link;
                link.className = 'entry-link';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.innerHTML = `
                    <span aria-hidden="true">🔗</span>
                    <span>${RenderManager.escapeHtml(entry.link)}</span>
                `;
                entryDiv.appendChild(link);
            }

            if (entry.imageUrl) {
                const img = document.createElement('img');
                img.src = entry.imageUrl;
                img.alt = `Immagine per ${entry.topic}`;
                img.className = 'entry-image';
                img.loading = 'lazy';
                entryDiv.appendChild(img);
            }

            const actions = document.createElement('div');
            actions.className = 'entry-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary';
            editBtn.setAttribute('data-action', 'edit');
            editBtn.setAttribute('data-id', entry.id);
            editBtn.innerHTML = '<span aria-hidden="true">✏️</span> Modifica';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.setAttribute('data-action', 'delete');
            deleteBtn.setAttribute('data-id', entry.id);
            deleteBtn.innerHTML = '<span aria-hidden="true">🗑</span> Elimina';

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            entryDiv.appendChild(actions);

            fragment.appendChild(entryDiv);
        });

        this.modalBody.innerHTML = '';
        this.modalBody.appendChild(fragment);
    }
};

/* ====================================
   RENDERING MANAGER
   ==================================== */

const RenderManager = {
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    highlightText(text, query) {
        if (!query.trim()) return this.escapeHtml(text);

        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        let escaped = this.escapeHtml(text);

        terms.forEach(term => {
            const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
            escaped = escaped.replace(regex, '<mark class="highlight">$1</mark>');
        });

        return escaped;
    },

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const isToday = date.toDateString() === today.toDateString();
        const isYesterday = date.toDateString() === yesterday.toDateString();

        if (isToday) return 'Oggi';
        if (isYesterday) return 'Ieri';

        return date.toLocaleDateString('it-IT', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    showSkeleton() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.removeAttribute('hidden');
        }
    },

    hideSkeleton() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.setAttribute('hidden', '');
        }
    },

    render(entries, query = '') {
        const container = document.getElementById('entriesContainer');
        const emptyState = document.getElementById('emptyState');

        this.hideSkeleton();

        if (entries.length === 0) {
            if (emptyState) emptyState.removeAttribute('hidden');
            this.clearEntries();
            return;
        }

        if (emptyState) emptyState.setAttribute('hidden', '');

        const groupedByDate = this.groupByDate(entries);
        const fragment = document.createDocumentFragment();

        for (const [date, dateEntries] of Object.entries(groupedByDate)) {
            const card = document.createElement('div');
            card.className = 'entry-card';
            card.setAttribute('role', 'article');

            const dateHeader = document.createElement('div');
            dateHeader.className = 'date-header';
            dateHeader.textContent = this.formatDate(dateEntries[0].timestamp);
            dateHeader.setAttribute('data-date', date);
            dateHeader.setAttribute('title', 'Clicca per visualizzare la giornata');
            card.appendChild(dateHeader);

            dateEntries.forEach(entry => {
                const entryDiv = this.createEntryElement(entry, query);
                card.appendChild(entryDiv);
            });

            fragment.appendChild(card);
        }

        this.clearEntries();
        container.appendChild(fragment);
    },

    createEntryElement(entry, query) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'entry';
        entryDiv.setAttribute('data-id', entry.id);

        const header = document.createElement('div');
        header.className = 'entry-header';

        const title = document.createElement('h3');
        title.className = 'entry-title';
        title.innerHTML = this.highlightText(entry.topic, query);

        const time = document.createElement('time');
        time.className = 'entry-time';
        time.setAttribute('datetime', new Date(entry.timestamp).toISOString());
        time.textContent = this.formatTime(entry.timestamp);

        header.appendChild(title);
        header.appendChild(time);
        entryDiv.appendChild(header);

        const content = document.createElement('div');
        content.className = 'entry-content';
        content.innerHTML = this.highlightText(entry.content, query);
        entryDiv.appendChild(content);

        if (entry.link) {
            const link = document.createElement('a');
            link.href = entry.link;
            link.className = 'entry-link';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.innerHTML = `
                <span aria-hidden="true">🔗</span>
                <span>${this.escapeHtml(entry.link)}</span>
            `;
            entryDiv.appendChild(link);
        }

        if (entry.imageUrl) {
            const img = document.createElement('img');
            img.src = entry.imageUrl;
            img.alt = `Immagine per ${entry.topic}`;
            img.className = 'entry-image';
            img.loading = 'lazy';
            entryDiv.appendChild(img);
        }

        const actions = document.createElement('div');
        actions.className = 'entry-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary';
        editBtn.setAttribute('data-action', 'edit');
        editBtn.setAttribute('data-id', entry.id);
        editBtn.setAttribute('aria-label', `Modifica apprendimento: ${entry.topic}`);
        editBtn.innerHTML = '<span aria-hidden="true">✏️</span> Modifica';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.setAttribute('data-action', 'delete');
        deleteBtn.setAttribute('data-id', entry.id);
        deleteBtn.setAttribute('aria-label', `Elimina apprendimento: ${entry.topic}`);
        deleteBtn.innerHTML = '<span aria-hidden="true">🗑</span> Elimina';

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        entryDiv.appendChild(actions);

        return entryDiv;
    },

    groupByDate(entries) {
        const groups = {};

        entries.forEach(entry => {
            const date = new Date(entry.timestamp).toDateString();
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(entry);
        });

        return groups;
    },

    clearEntries() {
        const container = document.getElementById('entriesContainer');
        const cards = container.querySelectorAll('.entry-card');
        cards.forEach(card => card.remove());
    }
};

/* ====================================
   DATA MANAGER
   ==================================== */

const DataManager = {
    export() {
        const entries = AppState.getEntries();
        const dataStr = JSON.stringify(entries, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `learning-diary-${timestamp}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        ToastManager.show(`Esportati ${entries.length} apprendimenti`, 'success');
    },

    import(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);

                if (!Array.isArray(imported)) {
                    throw new Error('Formato file non valido');
                }

                const currentEntries = AppState.getEntries();
                const currentIds = new Set(currentEntries.map(e => e.id));

                const newEntries = imported.filter(entry => {
                    return entry.id &&
                        entry.topic &&
                        entry.content &&
                        entry.timestamp &&
                        !currentIds.has(entry.id);
                });

                if (newEntries.length === 0) {
                    ToastManager.show('Nessun nuovo apprendimento da importare', 'warning');
                    return;
                }

                const merged = [...currentEntries, ...newEntries]
                    .sort((a, b) => b.timestamp - a.timestamp);

                AppState.setEntries(merged);

                ToastManager.show(
                    `Importati ${newEntries.length} nuovi apprendimenti`,
                    'success'
                );
            } catch (err) {
                console.error('Import error:', err);
                ToastManager.show('Errore nell\'importazione del file', 'error');
            }
        };

        reader.onerror = () => {
            ToastManager.show('Errore nella lettura del file', 'error');
        };

        reader.readAsText(file);
    },

    clearAll() {
        const confirmed = confirm(
            'Sei sicuro di voler cancellare TUTTI i dati?\n\n' +
            'Questa operazione non può essere annullata.\n\n' +
            'Consiglio: esporta prima i dati come backup.'
        );

        if (confirmed) {
            AppState.clearAll();
            ToastManager.show('Tutti i dati sono stati cancellati', 'info');
        }
    }
};

/* ====================================
   FORM HANDLER
   ==================================== */

const FormHandler = {
    init() {
        const form = document.getElementById('addForm');
        const contentTextarea = document.getElementById('content');
        const contentCounter = document.getElementById('contentCounter');

        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        if (contentTextarea && contentCounter) {
            contentTextarea.addEventListener('input', () => {
                CharacterCounter.update(contentTextarea, contentCounter);
            });
        }
    }

    handleSubmit(e) {
        e.preventDefault();

        const editId = document.getElementById('editId').value;
        const isEditMode = editId !== '';

        const formData = {
            topic: document.getElementById('topic').value.trim(),
            content: document.getElementById('content').value.trim(),
            link: document.getElementById('link').value.trim(),
            imageUrl: document.getElementById('imageUrl').value.trim()
        };

        const validation = Validator.validateEntry(formData);

        if (!validation.valid) {
            validation.errors.forEach(error => {
                ToastManager.show(error, 'error');
            });
            return;
        }

        if (isEditMode) {
            const success = AppState.updateEntry(parseInt(editId), formData);

            if (success) {
                ToastManager.show('Apprendimento modificato con successo!', 'success');
                FormManager.close();
            } else {
                ToastManager.show('Errore nella modifica dell\'apprendimento', 'error');
            }
        } else {
            const entry = {
                id: Date.now(),
                timestamp: Date.now(),
                ...formData
            };

            AppState.addEntry(entry);
            ToastManager.show('Apprendimento aggiunto con successo!', 'success');
            FormManager.close();
        }
    }
};

/* ====================================
   EVENT HANDLER - PRESERVED FROM v4.1
   ==================================== */

const EventHandler = {
    init() {
        document.addEventListener('click', (e) => {
            this.handleClick(e);
        }, true);

        const importFile = document.getElementById('importFile');
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    DataManager.import(e.target.files[0]);
                    e.target.value = '';
                }
            });
        }
    },

    handleClick(e) {
        const target = e.target;

        let element = target;
        let attempts = 0;
        const maxAttempts = 5;

        while (element && attempts < maxAttempts) {
            const id = element.id;
            const action = element.getAttribute('data-action');

            // Handle date-header click
            if (element.classList && element.classList.contains('date-header')) {
                const date = element.getAttribute('data-date');
                if (date) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleDateClick(date);
                    return;
                }
            }

            if (action === 'delete') {
                const entryId = element.getAttribute('data-id');
                if (entryId) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleDelete(parseInt(entryId));
                    return;
                }
            }

            if (action === 'edit') {
                const entryId = element.getAttribute('data-id');
                if (entryId) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleEdit(parseInt(entryId));
                    return;
                }
            }

            if (id) {
                let handled = false;

                switch (id) {
                    case 'dismissHint':
                        e.preventDefault();
                        e.stopPropagation();
                        this.dismissKeyboardHint();
                        handled = true;
                        break;

                    case 'closeModal':
                        e.preventDefault();
                        e.stopPropagation();
                        ModalManager.close();
                        handled = true;
                        break;

                    case 'closeFormBtn':
                    case 'cancelBtn':
                        e.preventDefault();
                        e.stopPropagation();
                        FormManager.close();
                        handled = true;
                        break;

                    case 'toggleFormBtn':
                        e.preventDefault();
                        e.stopPropagation();
                        FormManager.toggle();
                        handled = true;
                        break;

                    case 'exportBtn':
                        e.preventDefault();
                        e.stopPropagation();
                        DataManager.export();
                        handled = true;
                        break;

                    case 'importBtn':
                        e.preventDefault();
                        e.stopPropagation();
                        const importFile = document.getElementById('importFile');
                        if (importFile) importFile.click();
                        handled = true;
                        break;

                    case 'clearBtn':
                        e.preventDefault();
                        e.stopPropagation();
                        DataManager.clearAll();
                        handled = true;
                        break;

                    case 'themeToggle':
                        e.preventDefault();
                        e.stopPropagation();
                        ThemeManager.toggle();
                        handled = true;
                        break;

                    case 'keyboardShortcutsBtn':
                        e.preventDefault();
                        e.stopPropagation();
                        ModalManager.open();
                        handled = true;
                        break;

                    case 'scrollToTop':
                        e.preventDefault();
                        e.stopPropagation();
                        ScrollToTopManager.scrollToTop();
                        handled = true;
                        break;

                    case 'clearSearch':
                        e.preventDefault();
                        e.stopPropagation();
                        this.clearSearch();
                        handled = true;
                        break;
                }

                if (handled) return;
            }

            if (element.classList && element.classList.contains('modal-backdrop')) {
                e.preventDefault();
                e.stopPropagation();

                if (DayViewModal.isOpen()) {
                    DayViewModal.close();
                } else if (ModalManager.isOpen()) {
                    ModalManager.close();
                }
                return;
            }

            element = element.parentElement;
            attempts++;
        }
    },

    handleDateClick(dateString) {
        const entries = AppState.getEntries();
        const dateEntries = entries.filter(entry => {
            return new Date(entry.timestamp).toDateString() === dateString;
        });

        if (dateEntries.length > 0) {
            DayViewModal.open(dateString, dateEntries);
        }
    },

    handleEdit(id) {
        const entry = AppState.getEntryById(id);
        if (!entry) {
            ToastManager.show('Apprendimento non trovato', 'error');
            return;
        }

        if (DayViewModal.isOpen()) {
            DayViewModal.close();
        }

        FormManager.openForEdit(entry);
    },

    handleDelete(id) {
        const success = AppState.deleteEntry(id);

        if (success) {
            const entryElement = document.querySelector(`[data-id="${id}"]`);
            if (entryElement) {
                const card = entryElement.closest('.entry-card');
                if (card) card.classList.add('deleting');
            }

            if (DayViewModal.isOpen()) {
                setTimeout(() => {
                    DayViewModal.close();
                }, 300);
            }

            ToastManager.show('Apprendimento eliminato', 'undo', {
                showUndo: true,
                onUndo: () => {
                    AppState.undoDelete();
                    ToastManager.show('Eliminazione annullata', 'success');
                }
            });
        }
    },

    dismissKeyboardHint() {
        const hint = document.getElementById('keyboardHint');
        if (!hint) return;

        hint.style.opacity = '0';
        hint.style.transform = 'translateX(100px)';
        hint.style.transition = 'all 200ms';

        setTimeout(() => {
            hint.setAttribute('hidden', '');
            hint.style.display = 'none';
        }, 200);

        localStorage.setItem(CONFIG.HINT_DISMISSED_KEY, 'true');
    },

    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');

        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }

        if (clearBtn) {
            clearBtn.setAttribute('hidden', '');
        }

        SearchHandler.performSearch('');
    }
};

/* ====================================
   SEARCH HANDLER WITH DEBOUNCING
   ==================================== */

const SearchHandler = {
    debouncedSearch: null,
    currentQuery: '',

    init() {
        this.debouncedSearch = debounce((query) => {
            this.performSearch(query);
        }, CONFIG.DEBOUNCE_DELAY);

        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentQuery = e.target.value;
                this.debouncedSearch(this.currentQuery);

                if (clearBtn) {
                    if (this.currentQuery.length > 0) {
                        clearBtn.removeAttribute('hidden');
                    } else {
                        clearBtn.setAttribute('hidden', '');
                    }
                }
            });
        }
    },

    performSearch(query) {
        const entries = AppState.getEntries();
        const results = SearchManager.search(query, entries);
        RenderManager.render(results, query);
    }
};

/* ====================================
   KEYBOARD HINT AUTO-SHOW
   ==================================== */

const KeyboardHintManager = {
    init() {
        const dismissed = localStorage.getItem(CONFIG.HINT_DISMISSED_KEY);

        if (!dismissed) {
            setTimeout(() => {
                const hint = document.getElementById('keyboardHint');
                if (hint) {
                    hint.removeAttribute('hidden');
                    hint.style.display = '';
                }
            }, 2000);
        }
    }
};

/* ====================================
   APP INITIALIZATION
   ==================================== */

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Learning Diary v4.1.1 (Fix Modal Autoopen) initializing...');

    RenderManager.showSkeleton();

    ToastManager.init();
    ThemeManager.init();
    ModalManager.init();
    DayViewModal.init();
    KeyboardManager.init();
    KeyboardHintManager.init();
    ScrollToTopManager.init();
    FormManager.init();
    RippleEffect.initAll();

    AppState.load();

    FormHandler.init();
    EventHandler.init();
    SearchHandler.init();

    AppState.subscribe((action, data) => {
        const entries = AppState.getEntries();

        switch (action) {
            case 'add':
            case 'update':
            case 'delete':
            case 'restore':
            case 'clear':
            case 'load':
                SearchHandler.performSearch(SearchHandler.currentQuery);
                StatisticsCalculator.update(entries);
                SearchManager.clearCache();
                break;

            case 'deleteConfirmed':
                const entryElement = document.querySelector(`[data-id="${data}"]`);
                if (entryElement) {
                    const card = entryElement.closest('.entry-card');
                    if (card) card.classList.remove('deleting');
                }
                break;
        }
    });

    setTimeout(() => {
        const entries = AppState.getEntries();
        RenderManager.render(entries);
        StatisticsCalculator.update(entries);

        // CRITICAL: Enable DayViewModal after rendering is complete
        setTimeout(() => {
            appInitialized = true;
            console.log('✅ App initialization complete - DayViewModal enabled');
        }, 100);
    }, 300);

    console.log('✅ Learning Diary v4.1.1 initialized');
    console.log(`✅ OS detected: ${OS.isMac ? 'macOS' : 'Windows/Linux'}`);
});
