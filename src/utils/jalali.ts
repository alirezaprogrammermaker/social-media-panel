const JALALI_MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

const JALALI_DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

const JALALI_NUMBERS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function toPersianNumber(n: number): string {
    return String(n).split('').map(d => JALALI_NUMBERS[Number(d)]).join('');
}

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let gy2 = gm > 2 ? gy + 1 : gy;
    let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
        + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
    let jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    let jm: number, jd: number;
    if (days < 186) {
        jm = 1 + Math.floor(days / 31);
        jd = 1 + (days % 31);
    } else {
        jm = 7 + Math.floor((days - 186) / 30);
        jd = 1 + ((days - 186) % 30);
    }
    return [jy, jm, jd];
}

function getDayOfWeek(date: Date): string {
    // JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
    // Iranian week: 0=Saturday, 1=Sunday, ..., 6=Friday
    // Mapping: JS Saturday(6)->0, Sunday(0)->1, Monday(1)->2, ..., Friday(5)->6
    const jsDay = date.getDay();
    const iranianDay = (jsDay + 1) % 7;
    return JALALI_DAYS[iranianDay];
}

function formatTime(hours: number, minutes: number): string {
    const h = hours % 12 || 12;
    const period = hours < 12 ? 'صبح' : 'بعد از ظهر';

    const hWords: Record<number, string> = {
        1: 'یک', 2: 'دو', 3: 'سه', 4: 'چهار', 5: 'پنج', 6: 'شش',
        7: 'هفت', 8: 'هشت', 9: 'نه', 10: 'ده', 11: 'یازده', 12: 'دوازده',
    };

    const mWords: Record<number, string> = {
        0: 'دقیقه',
        5: 'پنج', 10: 'ده', 15: 'پانزده', 20: 'بیست', 25: 'بیست و پنج',
        30: 'سی', 35: 'سی و پنج', 40: 'چهل', 45: 'چهل و پنج', 50: 'پنجاه', 55: 'پنجاه و پنج',
    };

    let minuteStr = '';
    if (minutes === 0) {
        minuteStr = '';
    } else if (minutes === 30) {
        minuteStr = ' و سی دقیقه';
    } else {
        const tens = Math.floor(minutes / 10) * 10;
        const ones = minutes % 10;
        let mPart = mWords[tens] || '';
        if (ones > 0) {
            mPart += (mPart ? ' و ' : '') + (JALALI_NUMBERS[ones]);
        }
        minuteStr = ` و ${mPart} دقیقه`;
    }

    return `${hWords[h]}${minuteStr} ${period}`;
}

export function getJalaliDateTime(): string {
    const now = new Date();
    const tehranTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tehran' }));

    const gy = tehranTime.getFullYear();
    const gm = tehranTime.getMonth() + 1;
    const gd = tehranTime.getDate();
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);

    const dayName = getDayOfWeek(tehranTime);
    const monthName = JALALI_MONTHS[jm - 1];
    const timeStr = formatTime(tehranTime.getHours(), tehranTime.getMinutes());

    return `امروز ${dayName} ${toPersianNumber(jd)} ${monthName} ${toPersianNumber(jy)} میباشد معادل ${toPersianNumber(jy)}/${toPersianNumber(jm)}/${toPersianNumber(jd)}. ساعت ${timeStr} میباشد`;
}