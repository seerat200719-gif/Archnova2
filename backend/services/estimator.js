// Deterministic planning estimate. Rates are configurable defaults, NOT current market prices or a quotation.
const { area } = require('../validators/design');
const DEFAULTS = { baseRate: 2000, builtUpFactor: 1.12, highSpread: 0.28, contingency: 0.06,
  quality: { basic: 0.88, standard: 1, premium: 1.22 }, region: { tier3: 0.85, tier2: 1, metro: 1.2 },
  material: { wood: 1, marble: 1.25, concrete: 0.92, brick: 0.96, glass: 1.15, tiles: 1.04 },
  styleMult: { Luxury: 1.25, Minimalist: 0.95, Sustainable: 0.95 },
  split: { Structure: 30, Flooring: 9, Electrical: 8, Plumbing: 7, 'Doors & Windows': 10, Interior: 16, Exterior: 8, Landscaping: 6, Contingency: 6 } };
function estimate(d, o = {}) {
  const quality = o.quality || d.budget.tier, region = o.region || 'tier2', base = o.baseRate || DEFAULTS.baseRate;
  const eff = d.rooms.reduce((s, r) => s + r.w * r.d * (['balcony', 'terrace'].includes(r.type) ? 0.6 : r.type === 'landing' ? 0 : 1), 0);
  const sqft = eff * DEFAULTS.builtUpFactor * 10.764;
  const rate = base * DEFAULTS.quality[quality] * DEFAULTS.region[region] * DEFAULTS.material[d.materials.floorMaterial] * (DEFAULTS.styleMult[d.style] || 1);
  const low = Math.round(sqft * rate), high = Math.round(low * (1 + DEFAULTS.highSpread));
  return {
    currency: 'INR', builtUpSqFt: Math.round(sqft), ratePerSqFt: Math.round(rate), low, high,
    breakdown: Object.entries(DEFAULTS.split).map(([name, pct]) => ({ name, percent: pct, low: Math.round(low * pct / 100), high: Math.round(high * pct / 100) })),
    assumptions: [`Base rate INR ${base}/sq ft x quality(${quality}) x region(${region}) x floor material(${d.materials.floorMaterial}) x style factor`,
      `Built-up area = room area x ${DEFAULTS.builtUpFactor} (walls, stairs); balconies/terraces counted at 60%, landings at 0%`,
      `Upper estimate = lower + ${DEFAULTS.highSpread * 100}%`, `Contingency ${DEFAULTS.contingency * 100}% is included in the breakdown`],
    limitations: 'Planning estimate only. Not a quotation or professional cost report. Local rates, site conditions and finishes can change the cost significantly.',
  };
}
module.exports = { estimate, DEFAULTS };
