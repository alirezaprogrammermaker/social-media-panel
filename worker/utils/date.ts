export function nowTehran(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tehran' }).replace(' ', 'T');
}

export function dateTehran(): string {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tehran' });
}
