/*
 * The site's theme: System (the OS setting), Light or Dark, remembered in localStorage. The choice
 * becomes a `.light` or `.dark` class on <html>, which both the site's tokens and the kit's follow.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'signoff-theme';

/**
 * Runs in <head> before the page paints, so a stored or OS preference never flashes the other
 * theme. Kept tiny and dependency-free; storage can be unavailable (private windows, blocked site
 * data), in which case it follows the OS.
 */
export const THEME_SCRIPT = `(function(){var c='system';try{c=localStorage.getItem('${THEME_KEY}')||'system'}catch(e){}var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.add(d?'dark':'light');r.style.colorScheme=d?'dark':'light'})()`;
