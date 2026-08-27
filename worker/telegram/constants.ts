// Button Texts
export const BUTTONS = {
    // Main menu
    NEW_ORDER: '🛒 ثبت سفارش',
    MY_ORDERS: '📦 سفارشات من',
    ADD_BALANCE: '💰 افزایش موجودی',
    PROFILE: '👤 پروفایل',
    AI_CHAT: '🤖 هوش مصنوعی',
    HELP: '📖 راهنما',
    SUPPORT: '💬 پشتیبانی',
    STATS: '📊 آمار پنل',

    // Navigation
    BACK: '🔙 بازگشت',
    BACK_TO_ORDERS: '🔙 بازگشت به لیست',
    CANCEL_ORDER: '❌ لغو سفارش',
    CANCEL_PAYMENT: '❌ لغو افزایش موجودی',
    CHECK_CRYPTO_STATUS: '🔄 بررسی وضعیت پرداخت کریپتو',
} as const;

// Messages
export const MESSAGES = {
    // Welcome
    WELCOME: (name: string) => `👋 سلام ${name || 'کاربر عزیز'}! خوش آمدید.`,

    // Profile
    PROFILE_TITLE: '👤 <b>پروفایل کاربر</b>',
    PROFILE_DIVIDER: '━━━━━━━━━━━━━━━━━━━━━',
    PROFILE_USER_ID: '🆔 <b>شناسه:</b>',
    PROFILE_NAME: '📝 <b>نام:</b>',
    PROFILE_USERNAME: '📛 <b>نام کاربری:</b>',
    PROFILE_BALANCE: '💰 <b>موجودی:</b>',
    PROFILE_JOIN_DATE: '📅 <b>تاریخ عضویت:</b>',
    PROFILE_ORDERS_TITLE: '📊 <b>آمار سفارشات</b>',
    PROFILE_ORDERS_TOTAL: '📦 کل سفارشات:',
    PROFILE_ORDERS_PENDING: '⏳ در انتظار:',
    PROFILE_ORDERS_COMPLETED: '✅ تکمیل شده:',
    TOMAN: 'تومان',

    // Order
    SELECT_CATEGORY: '🛒 لطفاً دسته‌بندی سرویس مورد نظر را انتخاب کنید:',
    SELECT_SERVICE: (category: string) => `📦 سرویس‌های دسته ${category}:`,
    ENTER_LINK: '🔗 لطفاً لینک مورد نظر را ارسال کنید:',
    ENTER_LINK_WITH_SERVICE: (serviceName: string, typeInfo: string, min?: string, max?: string) =>
        `✅ سرویس: ${serviceName}\n${typeInfo}\n` +
        (min && max ? `📊 حداقل: ${min} | حداکثر: ${max}\n` : '') +
        `\n🔗 لطفاً لینک مورد نظر را ارسال کنید:`,
    ENTER_LINK_CONFIRM: (link: string, min: number, max: number) =>
        `🔗 لینک: ${link}\n\n📊 تعداد مورد نظر را وارد کنید (حداقل ${min}، حداکثر ${max}):`,
    ORDER_SUCCESS: (serviceName: string, link: string, quantity: number | string, orderId?: number) =>
        `✅ سفارش شما ثبت شد!\n\n` +
        `📦 سرویس: ${serviceName}\n` +
        `🔗 لینک: ${link || '-'}\n` +
        `📊 تعداد: ${quantity}\n` +
        (orderId ? `🔢 شناسه سفارش: <code>${orderId}</code>\n` : '') +
        `\nوضعیت: در انتظار بررسی`,
    ORDER_CANCELLED: '❌ سفارش لغو شد.',
    NO_CATEGORIES: 'در حال حاضر دسته‌بندی فعالی موجود نیست.',
    NO_SERVICES: 'سرویسی در این دسته‌بندی موجود نیست.',
    CATEGORY_NOT_FOUND: '❌ دسته‌بندی یافت نشد. لطفاً یکی از دکمه‌های زیر را انتخاب کنید.',
    SERVICE_NOT_FOUND: '❌ سرویس یافت نشد. لطفاً یکی از دکمه‌های زیر را انتخاب کنید.',
    SERVICE_NOT_FOUND_SIMPLE: 'سرویس یافت نشد.',
    INVALID_NUMBER: '❌ لطفاً یک عدد معتبر وارد کنید.',
    MIN_QUANTITY: (min: number) => `❌ حداقل تعداد: ${min}`,
    MAX_QUANTITY: (max: number) => `❌ حداکثر تعداد: ${max}`,
    INSUFFICIENT_BALANCE: (required: number, current: number) =>
        `❌ موجودی شما کافی نیست.\n\n💰 هزینه سفارش: ${required.toLocaleString()} تومان\n💳 موجودی شما: ${current.toLocaleString()} تومان`,
    PROVIDER_ERROR: (error: string) => `❌ خطا از ارائه‌دهنده: ${error}`,

    // AI
    AI_ENTER: '💬 در حالت چت هوش مصنوعی هستید.\nهر پیامی بفرستید، هوش مصنوعی پاسخ می‌دهد.\nبرای خروج، دکمه بازگشت را بزنید.',
    AI_EXIT: '🏠 به منوی اصلی بازگشتید.',
    AI_DISABLED: ' هوش مصنوعی در حال حاضر غیرفعال است.',
    AI_DAILY_LIMIT: (limit: number) => `⚠️ سقف استفاده روزانه شما (${limit} درخواست) تمام شده است.\nفردا دوباره تلاش کنید.`,
    AI_ERROR: '❌ خطایی در پردازش هوش مصنوعی رخ داد.',

    // Payment
    SELECT_PAYMENT_METHOD: '💳 روش پرداخت را انتخاب کنید:',
    NO_PAYMENT_METHODS: 'در حال حاضر روش پرداختی فعال نیست.',
    NO_PAYMENT_METHODS_CRYPTO_HINT:
        'در حال حاضر روش پرداختی فعال نیست.\n\nاگر درگاه کریپتو را وصل کرده‌اید، از داشبورد → تنظیمات → درگاه کریپتو کلید API (cg_...) را ذخیره کنید و روش «پرداخت کریپتو» را در روش‌های پرداخت فعال نگه دارید.',
    ENTER_AMOUNT: (cardNumber: string, cardHolder: string) =>
        `💳 پرداخت کارت به کارت\n\n` +
        `📌 شماره کارت: <code>${cardNumber}</code>\n` +
        `📌 نام صاحب کارت: ${cardHolder}\n\n` +
        `لطفاً مبلغ مورد نظر را وارد کنید:`,
    AMOUNT_RECEIVED: (amount: number, cardNumber: string, cardHolder: string) =>
        `✅ مبلغ ${amount.toLocaleString()} تومان ثبت شد.\n\n` +
        `📌 شماره کارت: <code>${cardNumber}</code>\n` +
        `📌 نام صاحب کارت: ${cardHolder}\n\n` +
        `💳 لطفاً رسید پرداخت خود را ارسال کنید.`,
    PAYMENT_SUBMITTED: '✅ رسید پرداخت شما ارسال شد.\nپس از بررسی توسط مدیر، به شما اطلاع داده خواهد شد.',
    PAYMENT_APPROVED: (amount: number) => `✅ پرداخت شما تایید شد!\n\nمبلغ: ${amount.toLocaleString()} تومان\nموجودی جدید شما بروزرسانی شد.`,
    PAYMENT_REJECTED: (amount: number) => `❌ پرداخت شما رد شد.\n\nمبلغ: ${amount.toLocaleString()} تومان`,
    INVALID_AMOUNT: '❌ لطفاً یک عدد معتبر وارد کنید.',
    MIN_AMOUNT: (min: number) => `❌ حداقل مبلغ پرداخت: ${min.toLocaleString()} تومان`,
    MAX_AMOUNT: (max: number) => `❌ حداکثر مبلغ پرداخت: ${max.toLocaleString()} تومان`,
    PAYMENT_NOT_FOUND: 'پرداخت یافت نشد.',
    PAYMENT_ALREADY_REVIEWED: 'این پرداخت قبلا بررسی شده است.',

    // Crypto payment
    SELECT_CRYPTO_NETWORK: '🌐 شبکه پرداخت کریپتو را انتخاب کنید:\n(پیشنهادی: USDT TRC20)',
    CRYPTO_GATEWAY_NOT_CONFIGURED: '❌ درگاه کریپتو پیکربندی نشده است. با مدیر تماس بگیرید.',
    CRYPTO_DOLLAR_RATE_MISSING: '❌ نرخ دلار تنظیم نشده است. لطفاً بعداً تلاش کنید.',
    CRYPTO_CREATE_FAILED: (error: string) => `❌ ایجاد پرداخت کریپتو ناموفق بود.\n\n${error}`,
    CRYPTO_PAYMENT_CREATED: (
        amountToman: number,
        cryptoAmount: string,
        networkLabel: string,
        address: string,
        checkoutUrl: string,
        expiresAt: string,
    ) =>
        `💎 <b>پرداخت کریپتو ایجاد شد</b>\n\n` +
        `💰 مبلغ شارژ: <b>${amountToman.toLocaleString()} تومان</b>\n` +
        `🪙 مبلغ کریپتو: <code>${cryptoAmount}</code>\n` +
        `🌐 شبکه: <b>${networkLabel}</b>\n` +
        `📬 آدرس واریز:\n<code>${address}</code>\n\n` +
        `🔗 صفحه پرداخت:\n${checkoutUrl}\n\n` +
        `⏰ مهلت: ${expiresAt}\n\n` +
        `پس از واریز، موجودی به‌صورت خودکار شارژ می‌شود.\n` +
        `می‌توانید وضعیت را با دکمه زیر بررسی کنید.`,
    CRYPTO_PAYMENT_CONFIRMED: (amount: number) =>
        `✅ پرداخت کریپتو تایید شد!\n\nمبلغ: ${amount.toLocaleString()} تومان\nموجودی شما بروزرسانی شد.`,
    CRYPTO_PAYMENT_EXPIRED:
        '⏰ مهلت پرداخت کریپتو به پایان رسید.\nبرای شارژ مجدد از منو «افزایش موجودی» را بزنید.',
    CRYPTO_PAYMENT_FAILED:
        '❌ پرداخت کریپتو ناموفق بود.\nبرای تلاش مجدد از منو «افزایش موجودی» را بزنید.',
    CRYPTO_STILL_PENDING: (status: string) =>
        `⏳ پرداخت هنوز نهایی نشده است.\nوضعیت درگاه: <code>${status}</code>`,
    CRYPTO_NO_PENDING: 'پرداخت کریپتوی در انتظاری یافت نشد.',

    // My Orders
    MY_ORDERS_TITLE: '📦 <b>سفارشات من</b>',
    MY_ORDERS_EMPTY: '📦 شما هنوز سفارشی ثبت نکرده‌اید.',
    MY_ORDERS_PAGE: (page: number, totalPages: number) => `📦 سفارشات شما (صفحه ${page}/${totalPages}):`,
    MY_ORDER_ITEM: (orderId: number, serviceName: string, status: string, date: string) =>
        `🔢 #${orderId} | ${serviceName}\n📊 وضعیت: ${status}\n📅 ${date}`,
    MY_ORDER_DETAIL: (orderId: number, serviceName: string, link: string, quantity: number | string, status: string, date: string, apiOrderId?: number) =>
        `📦 <b>جزئیات سفارش #${orderId}</b>\n\n` +
        `🛒 سرویس: ${serviceName}\n` +
        `🔗 لینک: ${link || '-'}\n` +
        `📊 تعداد: ${quantity}\n` +
        `📋 وضعیت: ${status}\n` +
        `📅 تاریخ: ${date}` +
        (apiOrderId ? `\n🔢 شناسه API: ${apiOrderId}` : ''),
    ORDER_NOT_FOUND: '❌ سفارش یافت نشد.',

    // Help
    SELECT_HELP: 'یک راهنما انتخاب کنید:',
    NO_HELP: 'راهنمایی موجود نیست.',
    HELP_NOT_FOUND: 'راهنما یافت نشد.',

    // Channel
    JOIN_CHANNELS: '❌ لطفاً ابتدا در کانال‌های زیر عضو شوید:\n\nپس از عضویت، مجدداً /start را ارسال کنید.',
    JOIN_CHANNELS_OTHER: '❌ لطفاً ابتدا در کانال‌های زیر عضو شوید:\n\nپس از عضویت، مجدداً هر پیامی ارسال کنید.',

    // Blocked
    BLOCKED: (reason?: string) => `⛔ شما مسدود شده‌ید.${reason ? `\nعلت: ${reason}` : ''}`,

    // Spam
    SPAM_WARNING: '⚠️ لطفاً صبر کنید. پیام‌های شما خیلی سریع است.',

    // Error
    ERROR: '❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.',
    DEFAULT_REPLY: '✅ پیام شما دریافت شد.',
} as const;
