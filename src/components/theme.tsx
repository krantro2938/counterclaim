import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
type Ctx = { theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void };

const ThemeContext = createContext<Ctx>({ theme: "system", resolved: "light", setTheme: () => {} });
const KEY = "cc-theme";

/** Inline script for <head>: applies the theme class before first paint (no flash). */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(location.pathname.indexOf('/shop')===0)d=false;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function readStored(): Theme {
	try {
		const v = localStorage.getItem(KEY);
		return v === "light" || v === "dark" ? v : "system";
	} catch {
		return "system";
	}
}

export function ThemeProvider({ children, forceLight = false }: { children: React.ReactNode; forceLight?: boolean }) {
	const [theme, setThemeState] = useState<Theme>("system");
	const [systemDark, setSystemDark] = useState(false);

	useEffect(() => {
		setThemeState(readStored());
		const mq = matchMedia("(prefers-color-scheme: dark)");
		setSystemDark(mq.matches);
		const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);

	const resolved: "light" | "dark" = forceLight ? "light" : theme === "system" ? (systemDark ? "dark" : "light") : theme;

	useEffect(() => {
		document.documentElement.classList.toggle("dark", resolved === "dark");
	}, [resolved]);

	const setTheme = useCallback((t: Theme) => {
		setThemeState(t);
		try {
			localStorage.setItem(KEY, t);
		} catch {}
	}, []);

	return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
