// A negative offset compensates for taps arriving after the audible beat.
export function estimateCalibration(samples) {
  if (samples.length < 8) return { ok: false, reason: "Faltaron algunos toques. Inténtalo de nuevo siguiendo cada golpe." };
  const sorted = [...samples].sort((a, b) => a - b);
  const median = values => values.length % 2 ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const center = median(sorted);
  const deviations = sorted.map(value => Math.abs(value - center)).sort((a, b) => a - b);
  const inliers = sorted.filter(value => Math.abs(value - center) <= 65);
  if (median(deviations) > 35 || inliers.length < 8 || inliers.length < samples.length * 0.75 || Math.abs(center) > 220) {
    return { ok: false, reason: "Los toques variaron bastante. Escucha el pulso y prueba otra vez." };
  }
  return { ok: true, offset: Math.round(-median(inliers)), count: inliers.length };
}
