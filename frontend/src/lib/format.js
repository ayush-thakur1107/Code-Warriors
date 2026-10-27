export const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–')
export const fmtUtc = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
export const signedHours = (h) => `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(1)} h`
