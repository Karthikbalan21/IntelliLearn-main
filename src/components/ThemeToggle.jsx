import { useTheme } from '../context/ThemeContext';

// Reusable sun/moon switch, dropped into the sidebar (Home) and the top
// corner of the auth pages (Login/Register) - same component, same
// ThemeContext, so flipping it anywhere keeps the whole app in sync
// (and in sync with localStorage across reloads/tabs).
function ThemeToggle({ className = '' }) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            className={`theme-toggle${className ? ` ${className}` : ''}`}
            onClick={toggleTheme}
            aria-pressed={isDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            <span className="theme-toggle-track" aria-hidden="true">
                <span key={theme} className="theme-toggle-icon">
                    {isDark ? '🌙' : '☀️'}
                </span>
                <span className="theme-toggle-thumb" />
            </span>
        </button>
    );
}

export default ThemeToggle;
