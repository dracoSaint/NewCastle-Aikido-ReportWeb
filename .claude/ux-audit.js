// UX rule audit (ui-ux-pro-max priorities 1, 2, 5, 6, incl. simulated focus states) for one page, as compact JSON. Run on every page:
// EVAL="$(cat .claude/ux-audit.js)" node .claude/preview-shots.mjs .claude/shots 390 844
// Known false positives: noName on inputs inside a <label> or on buttons whose text renders late; sr-only text in lowContrast.
(() => {
  const out = {};
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert],dialog:not([open]),[hidden]'); };
  const label = e => e.closest('label') ? e.closest('label').innerText.trim() : (e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].innerText) || e.innerText || e.title || e.getAttribute('aria-labelledby') || '').trim();
  const sel = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const uniq = a => [...new Set(a)].slice(0, 12);
  out.skipLink = !!document.querySelector('a[href^="#"]:first-of-type') && [...document.querySelectorAll('a[href^="#"]')].some(a => /skip/i.test(a.textContent));
  out.headings = [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map(h => h.tagName).join(' ');
  out.reducedMotion = [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.media && /reduced-motion/.test(r.media.mediaText)); } catch { return false; } });
  const ctl = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[role=button]')].filter(e => vis(e) && !e.disabled);
  out.noName = uniq(ctl.filter(e => !label(e) && e.type !== 'hidden').map(sel));
  out.noLabel = uniq([...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(vis).filter(e => !e.labels?.length && !e.getAttribute('aria-label') && !e.closest('label')).map(sel));
  out.smallTargets = uniq(ctl.filter(e => { if (e.closest('label') && e.matches('input')) return false; if (e.matches('a') && getComputedStyle(e).display === 'inline' && e.closest('p,li small')) return false; const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(e => { const r = e.getBoundingClientRect(); return sel(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }));
  out.smallInputs = uniq([...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea')].filter(vis).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => sel(e) + ' ' + getComputedStyle(e).fontSize));
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = e => { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c; } return [255, 255, 255]; };
  const low = [];
  document.querySelectorAll('body *').forEach(e => {
    if (!vis(e) || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(e); const fg = rgb(cs.color); if (fg[3] !== undefined && fg[3] < 1) return;
    const a = lum(fg), b = lum(bgOf(e)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && cs.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5) * parseFloat(cs.opacity || 1)) low.push(sel(e) + ' ' + ratio.toFixed(2) + ' "' + e.textContent.trim().slice(0, 20) + '"');
  });
  out.lowContrast = uniq(low);
  // Focus states (headless Chrome never applies :focus): copy every :focus / :focus-visible rule onto
  // .ux-focus, add it to each control in turn, then check something visibly changes and text stays readable.
  if (!document.getElementById('ux-focus-css')) {
    const add = [];
    for (const s of document.styleSheets) { try { for (const r of s.cssRules) { const t = r.cssText; if (t.includes(':focus')) add.push(t.replace(/:focus(-visible|-within)?/g, '.ux-focus')); else if (r.cssRules) for (const c of r.cssRules) if (c.cssText.includes(':focus')) add.push(`@media ${r.media?.mediaText || 'all'} { ${c.cssText.replace(/:focus(-visible|-within)?/g, '.ux-focus')} }`); } } catch {} }
    document.head.append(Object.assign(document.createElement('style'), { id: 'ux-focus-css', textContent: add.join('\n') }));
  }
  const look = e => { const c = getComputedStyle(e); return [c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? c.outlineWidth + c.outlineColor : '', c.boxShadow, c.borderColor, c.backgroundColor, c.textDecorationLine].join('|'); };
  const noRing = [], focusLow = [];
  ctl.forEach(e => {
    const before = look(e); e.classList.add('ux-focus'); const after = look(e);
    const c = getComputedStyle(e);
    if (before === after) noRing.push(sel(e));
    else if (e.matches('input,select,textarea')) { const r = (Math.max(lum(rgb(c.color)), lum(bgOf(e))) + 0.05) / (Math.min(lum(rgb(c.color)), lum(bgOf(e))) + 0.05); if (r < 4.5) focusLow.push(sel(e) + ' ' + r.toFixed(2)); }
    e.classList.remove('ux-focus');
  });
  out.noFocusRing = uniq(noRing);
  out.focusLowContrast = uniq(focusLow);
  out.zoomBlocked = /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(document.querySelector('meta[name=viewport]')?.content || '');
  out.tinyText = uniq([...document.querySelectorAll('body *')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => sel(e) + ' ' + getComputedStyle(e).fontSize));
  return JSON.stringify(out, null, 1);
})()
