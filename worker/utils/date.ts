export function nowTehran(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tehran' }).replace(' ', 'T');
}

export function dateTehran(offsetDays: number = 0): string {
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tehran' });
    if (offsetDays === 0) return todayStr;
    const [y, m, d] = todayStr.split('-').map(Number);
    // Calendar-day arithmetic in UTC to avoid timezone edge cases
    const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
    return shifted.toISOString().slice(0, 10);
}
