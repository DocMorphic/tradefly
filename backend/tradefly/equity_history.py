"""Bounded chart telemetry covering the entire ledger, with recent detail."""
from datetime import timedelta
from .domain import instant


def chart_history(samples, limit=500):
    if limit < 24:
        raise ValueError('History budget must be at least 24')
    rows = []
    peak = 0.
    for sample in samples:
        equity = float(sample['equity'])
        peak = max(peak, equity)
        rows.append({**sample, 'drawdown': (equity / peak - 1) * 100 if peak else 0.})
    times = [instant(r['at']) for r in rows]

    def reduce(indices, budget):
        if len(indices) <= budget:
            return indices
        # Keep extrema and endpoints in chronological time buckets. The recent
        # six hours get their own budget, so an old ledger cannot erase detail.
        buckets = max(1, (budget - 2) // 5)
        span = (times[indices[-1]] - times[indices[0]]).total_seconds()
        groups = {}
        for i in indices:
            key = min(buckets - 1, int((times[i] - times[indices[0]]).total_seconds() / max(span, 1) * buckets))
            groups.setdefault(key, []).append(i)
        chosen = {indices[0], indices[-1]}
        for group in groups.values():
            chosen.update([group[0], group[-1],
                           min(group, key=lambda i: float(rows[i]['equity'])),
                           max(group, key=lambda i: float(rows[i]['equity'])),
                           min(group, key=lambda i: rows[i]['drawdown'])])
        return sorted(chosen)

    indices = list(range(len(rows)))
    if len(rows) > limit:
        cutoff = times[-1] - timedelta(hours=6)
        old = [i for i in indices if times[i] < cutoff]
        recent = [i for i in indices if times[i] >= cutoff]
        old_budget = min(len(old), limit // 2)
        recent_budget = min(len(recent), limit - old_budget)
        old_budget = min(len(old), limit - recent_budget)
        indices = reduce(old, old_budget) + reduce(recent, recent_budget)
    # A sparse plotted interval is not necessarily a recording outage. Carry
    # actual source gaps explicitly instead of guessing from compressed points.
    gaps = [0]
    for a, b in zip(times, times[1:]):
        gaps.append(gaps[-1] + int((b - a).total_seconds() > 450))
    for position, i in enumerate(indices):
        rows[i]['gap_before'] = position > 0 and gaps[i] > gaps[indices[position - 1]]
    plotted = [rows[i] for i in indices]
    return plotted, {'total': len(rows), 'plotted': len(plotted),
                     'from': rows[0]['at'] if rows else None,
                     'through': rows[-1]['at'] if rows else None,
                     'downsampled': len(plotted) < len(rows)}
