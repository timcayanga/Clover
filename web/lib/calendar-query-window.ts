import { reportDay, shiftDay, validReportDate } from '../../shared/reports/analysis';
const starts = new Map<string, number>();
/** First instant of a regional calendar day, including DST and midnight offset changes. */
export function calendarDayStart(day: string, timeZone: string) {
    if (!validReportDate(day))
        throw new Error('Choose a valid calendar date.');
    const key = timeZone + ':' + day;
    const cached = starts.get(key);
    if (cached !== undefined)
        return new Date(cached);
    const anchor = Date.parse(day + 'T00:00:00Z');
    let low = anchor - 36 * 3600000, high = anchor + 36 * 3600000;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (reportDay(new Date(mid), timeZone) < day)
            low = mid + 1;
        else
            high = mid;
    }
    if (starts.size >= 1024)
        starts.delete(starts.keys().next().value!);
    starts.set(key, low);
    return new Date(low);
}
export function calendarQueryRange(range: {
    gte?: Date;
    lte?: Date;
}, timeZone: string) {
    return { gte: range.gte ? calendarDayStart(range.gte.toISOString().slice(0, 10), timeZone) : undefined, lte: range.lte ? new Date(+calendarDayStart(shiftDay(range.lte.toISOString().slice(0, 10), 1), timeZone) - 1) : undefined };
}
