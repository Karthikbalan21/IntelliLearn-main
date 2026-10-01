import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'intellilearn-theme';

// index.html stamps data-theme on <html> synchronously before React ever
// mounts (see the inline script there), so this just needs to agree with
// whatever it already chose - never flips the page after the fact.
function getInitialTheme() {
    if (typeof document !== 'undefined') {
        const fromDom = document.documentElement.getAttribute('data-theme');
        if (fromDom === 'light' || fromDom === 'dark') return fromDom;
    }
    if (typeof window !== 'undefined') {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') return stored;
        } catch {
            // localStorage unavailable (private mode, disabled storage) - fall through
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    }
    return 'light';
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // ignore - theme just won't persist across reloads
        }
    }, [theme]);

    const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
    return ctx;
}
