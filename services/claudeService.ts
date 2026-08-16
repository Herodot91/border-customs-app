import { SimulationStats, Vehicle, BCP } from "../types";

export const generateSituationReport = (
  bcp: BCP,
  stats: SimulationStats,
  highRiskVehicles: Vehicle[]
): string => {
  const total = stats.waiting.length + stats.inControl.length + stats.cleared.length;
  const highCount = stats.riskCounts.High;
  const efficiency = total > 0 ? Math.round((stats.cleared.length / total) * 100) : 0;

  const flowStatus = stats.avgWaitSec < 120 ? "within normal parameters" : "above threshold — congestion likely";
  const riskStatus = highCount === 0 ? "No high-risk vehicles detected." :
    `**${highCount} high-risk vehicle${highCount > 1 ? 's' : ''} detected** — immediate inspection recommended.`;

  const vehicleLines = highRiskVehicles.slice(0, 3)
    .map(v => `- **${v.plate}** (${v.vehicleType}) — ${v.goodsType ?? 'unknown goods'}`)
    .join('\n');

  return `## SITREP — ${bcp.name}

**Traffic Flow:** ${stats.waiting.length} waiting · ${stats.inControl.length} under control · ${stats.cleared.length} cleared (${efficiency}% throughput)
Average processing time: **${stats.avgWaitSec.toFixed(0)}s** — ${flowStatus}.

**Risk Profile:** Low: ${stats.riskCounts.Low} · Medium: ${stats.riskCounts.Medium} · High: ${highCount}
${riskStatus}

${vehicleLines ? `**High-Risk Vehicles (sample):**\n${vehicleLines}` : ''}

**Recommendations:**
${stats.avgWaitSec > 120 ? '- Open additional lanes to reduce wait time.\n' : ''}- ${highCount > 2 ? 'Activate secondary inspection unit immediately.' : 'Maintain standard protocol — situation stable.'}
- Coordinate with ${bcp.countryB} counterpart for joint clearance on flagged vehicles.`;
};
