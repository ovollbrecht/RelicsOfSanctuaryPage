import { t } from '@/i18n';

/**
 * The Grail as one picture for Discord: the ring, the numbers per category,
 * the latest finds. Drawn on a canvas, 1200 by 630, the size link previews
 * expect. Returns the canvas; the caller turns it into a file or the clipboard.
 */
export function drawGrailCard({ found, total, perTab, recent, stamp }) {
  const W = 1200; const H = 630;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const display = (getComputedStyle(document.body).getPropertyValue('--font-display') || 'Georgia, serif').trim();
  const body = (getComputedStyle(document.body).getPropertyValue('--font-body') || 'Georgia, serif').trim();
  const gold = '#d4af37'; const goldBright = '#e4c68a'; const muted = '#a89b85'; const text = '#e8dcc6';

  // ground
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1b1410'); bg.addColorStop(1, '#0d0a08');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(201,163,106,0.55)'; g.lineWidth = 2; g.strokeRect(16, 16, W - 32, H - 32);
  g.strokeStyle = 'rgba(201,163,106,0.2)'; g.lineWidth = 1; g.strokeRect(24, 24, W - 48, H - 48);

  // title
  g.fillStyle = muted; g.font = `600 18px ${body}`; g.textBaseline = 'alphabetic';
  g.fillText('RELICS OF SANCTUARY', 70, 82);
  g.fillStyle = goldBright; g.font = `600 52px ${display}`;
  g.fillText(t('Grail'), 70, 138);

  // ring
  const pct = total ? found / total : 0;
  const cx = 1000; const cy = 190; const r = 105;
  g.lineWidth = 16; g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = gold; g.shadowColor = 'rgba(201,163,106,0.5)'; g.shadowBlur = 14;
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); g.stroke();
  g.shadowBlur = 0;
  g.textAlign = 'center'; g.fillStyle = goldBright; g.font = `600 56px ${display}`;
  g.fillText(`${pct * 100 < 10 ? (pct * 100).toFixed(1) : Math.round(pct * 100)} %`, cx, cy + 14);
  g.fillStyle = muted; g.font = `20px ${body}`; g.fillText(`${found} / ${total}`, cx, cy + 46);
  g.textAlign = 'left';

  // categories with bars
  let y = 190;
  const barX = 70; const barW = 560;
  for (const tab of perTab) {
    g.fillStyle = text; g.font = `600 22px ${body}`; g.fillText(t(tab.label), barX, y);
    g.textAlign = 'right'; g.fillStyle = muted; g.font = `20px ${body}`; g.fillText(`${tab.found} / ${tab.total}`, barX + barW, y); g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(g, barX, y + 10, barW, 10, 5); g.fill();
    const grad = g.createLinearGradient(barX, 0, barX + barW, 0); grad.addColorStop(0, gold); grad.addColorStop(1, goldBright);
    g.fillStyle = grad; roundRect(g, barX, y + 10, Math.max(6, barW * (tab.total ? tab.found / tab.total : 0)), 10, 5); g.fill();
    y += 58;
  }

  // latest finds
  const lx = 700; let ly = 340;
  g.fillStyle = muted; g.font = `600 16px ${body}`; g.fillText(t('Latest finds').toUpperCase(), lx, ly); ly += 34;
  const colors = { unique: '#c7b377', set: '#7fdc7f', runeword: '#ffb84d' };
  for (const e of recent.slice(0, 5)) {
    g.fillStyle = colors[e.kind] ?? text; g.font = `22px ${body}`;
    g.fillText(clip(g, e.name, 330), lx, ly);
    g.fillStyle = muted; g.font = `16px ${body}`; g.textAlign = 'right'; g.fillText(e.date, lx + 430, ly); g.textAlign = 'left';
    ly += 34;
  }

  // footer
  g.fillStyle = muted; g.font = `16px ${body}`;
  g.fillText('relicsofsanctuary.com/#/grail', 70, H - 52);
  g.textAlign = 'right'; g.fillText(stamp, W - 70, H - 52); g.textAlign = 'left';
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function clip(g, s, max) {
  if (g.measureText(s).width <= max) return s;
  let out = s;
  while (out.length > 1 && g.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}
