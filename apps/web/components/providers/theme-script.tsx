import { getTheme, THEME_CACHE_STORAGE_KEY, THEME_MODE_STORAGE_KEY } from '@/lib/themes';
import type { Theme } from '@/lib/themes';

function safeJson(value: unknown): string {
  const json = JSON.stringify(value);
  return json === undefined ? 'undefined' : json.replace(/</g, '\\u003c');
}

interface ThemeScriptProps {
  initialTheme: Theme;
}

export function ThemeScript({ initialTheme }: ThemeScriptProps) {
  const defaultTokensByMode = {
    light: getTheme(initialTheme.name, 'light').tokens,
    dark: getTheme(initialTheme.name, 'dark').tokens,
  };

  const scriptContent = `
    (function() {
      var root = document.documentElement;
      var themeName = ${safeJson(initialTheme.name)};
      var modeStorageKey = ${safeJson(THEME_MODE_STORAGE_KEY)};
      var cacheStorageKey = ${safeJson(THEME_CACHE_STORAGE_KEY)};
      var defaultTokensByMode = ${safeJson(defaultTokensByMode)};
      var systemFonts = {
        "ui-sans-serif": true,
        "ui-serif": true,
        "ui-monospace": true,
        "system-ui": true,
        "sans-serif": true,
        "serif": true,
        "monospace": true,
        "cursive": true,
        "fantasy": true,
        "-apple-system": true,
        "blinkmacsystemfont": true
      };

      function getStoredMode() {
        try {
          var stored = localStorage.getItem(modeStorageKey);
          return stored === "light" || stored === "dark" ? stored : null;
        } catch (_) {
          return null;
        }
      }

      function getCachedTheme() {
        try {
          var raw = localStorage.getItem(cacheStorageKey);
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || !parsed.tokensByMode) return null;
          return parsed;
        } catch (_) {
          return null;
        }
      }

      function getSystemMode() {
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }

      function extractFontFamily(fontFamilyValue) {
        if (!fontFamilyValue) return null;
        var firstFont = fontFamilyValue.split(",")[0];
        if (!firstFont) return null;
        var cleanFont = firstFont.trim().replace(/['"]/g, "");
        if (!cleanFont || systemFonts[cleanFont.toLowerCase()]) return null;
        return cleanFont;
      }

      function loadGoogleFont(family) {
        var href = "https://fonts.googleapis.com/css2?family="
          + encodeURIComponent(family)
          + ":wght@400,500,600,700&display=swap";
        if (document.querySelector('link[href="' + href + '"]')) return;
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }

      var cachedTheme = getCachedTheme();
      var tokensByMode = cachedTheme && cachedTheme.tokensByMode
        ? cachedTheme.tokensByMode
        : defaultTokensByMode;
      var mode = getStoredMode() || getSystemMode();
      var tokens = tokensByMode[mode] || tokensByMode.light || {};
      themeName = cachedTheme && cachedTheme.name ? cachedTheme.name : themeName;

      for (var key in tokens) {
        if (Object.prototype.hasOwnProperty.call(tokens, key)) {
          root.style.setProperty("--" + key, tokens[key]);
        }
      }

      root.setAttribute("data-theme", themeName);
      root.setAttribute("data-mode", mode);
      root.classList.toggle("dark", mode === "dark");
      root.style.colorScheme = mode;

      try {
        ["font-sans", "font-serif", "font-mono"].forEach(function(token) {
          var family = extractFontFamily(tokens[token]);
          if (family) loadGoogleFont(family);
        });
      } catch (error) {
        console.warn("Theme font initialization failed:", error);
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: scriptContent }}
      suppressHydrationWarning
    />
  );
}
