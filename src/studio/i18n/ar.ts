import type { Message, StringKey } from './catalogue.js';

/** Arabic Studio copy in Modern Standard Arabic. A missing key falls back to English. */
export const ar: Partial<Record<StringKey, Message>> = {
  'common.arrow': '←',
  'language.switch_to_ar': 'عرض الاستوديو بالعربية',
  'language.switch_to_en': 'عرض الاستوديو بالإنجليزية',
  'tips.title': 'مرحبًا بك في LiveLocale',
  'tips.step1': 'اضغط مع الاستمرار على مفتاح Alt (أو Option في ماك) وانقر على أي نص.',
  'tips.step2': 'اكتب التصحيح، وستتحدّث الصفحة أثناء الكتابة، وتُحفظ تغييراتك في هذا المتصفح.',
  'tips.step3': 'عند الانتهاء، اضغط «إرسال إلى المطوّر» ثم أرسل الرابط إلى المطوّر.',
  'tips.name_label': 'اسمك (اختياري، يُذكر في طلب الدمج)',
  'tips.start': 'ابدأ التعديل',
  'drafts.unsent': {
    zero: 'لا توجد تغييرات غير مرسلة',
    one: 'تغيير واحد لم يُرسل',
    two: 'تغييران لم يُرسلا',
    few: '{count} تغييرات لم تُرسل',
    many: '{count} تغييرًا لم يُرسل',
    other: '{count} تغيير لم يُرسل',
  },
  'send.title': 'إرسال إلى المطوّر',
  'send.name_label': 'اسمك',
  'send.note_label': 'ملاحظة للمطوّر (اختيارية)',
  'send.include_sent': {
    zero: 'أضف أيضًا التغييرات المرسلة من قبل',
    one: 'أضف أيضًا التغيير المرسل من قبل',
    two: 'أضف أيضًا التغييرين المرسلين من قبل',
    few: 'أضف أيضًا {count} تغييرات مرسلة من قبل',
    many: 'أضف أيضًا {count} تغييرًا مرسلًا من قبل',
    other: 'أضف أيضًا {count} تغيير مرسل من قبل',
  },
  'send.nothing_to_send': 'لا توجد تغييرات لإرسالها.',
  'send.empty': 'فارغ',
  'send.overflow': {
    zero: 'لا يحمل هذا الرابط أي تغيير من {total}. أرسل مرة أخرى لبقية التغييرات.',
    one: 'يحمل هذا الرابط تغييرًا واحدًا من {total}. أرسل مرة أخرى لبقية التغييرات.',
    two: 'يحمل هذا الرابط تغييرين من {total}. أرسل مرة أخرى لبقية التغييرات.',
    few: 'يحمل هذا الرابط {count} تغييرات من {total}. أرسل مرة أخرى لبقية التغييرات.',
    many: 'يحمل هذا الرابط {count} تغييرًا من {total}. أرسل مرة أخرى لبقية التغييرات.',
    other: 'يحمل هذا الرابط {count} تغيير من {total}. أرسل مرة أخرى لبقية التغييرات.',
  },
  'send.encode_failed': 'تعذّر إنشاء الرابط: {reason}',
  'send.too_long': 'هذه الدفعة أطول من أن تُرسل في رسالة دردشة. استخدم «تنزيل الملف» بدلًا من ذلك.',
  'send.copy': 'نسخ الرابط',
  'send.download': 'تنزيل الملف',
  'send.close': 'إغلاق',
  'send.open_github': 'فتح في GitHub',
  'send.github_hint':
    'اضغط «Submit new issue» في GitHub، وسيظهر رابط طلب الدمج في تعليق بعد دقيقة تقريبًا.',
  'send.copied': 'نُسخ الرابط. ألصقه للمطوّر في الدردشة أو البريد الإلكتروني.',
  'send.downloaded': 'حُفظ الملف. أرسله إلى المطوّر.',
  'send.opened': 'فُتح GitHub في علامة تبويب جديدة.',
  'send.copy_failed': 'لم ينجح النسخ في هذا المتصفح. حدّد الرابط أعلاه وانسخه، ثم اضغط «نسختُه».',
  'send.copied_confirm': 'نسختُه',
  'send.mark_failed': 'تعذّر وضع علامة «مُرسل» على التغييرات.',
  'send.save_failed': 'تعذّر حفظ الملف.',
  'link_error.not_found': 'هذا ليس رابط تغييرات من LiveLocale. يحتوي رابط التغييرات على "lc1.".',
  'link_error.ambiguous': 'يحتوي هذا النص على أكثر من رابط تغييرات. ألصق رابطًا واحدًا في كل مرة.',
  'link_error.damaged':
    'رابط التغييرات هذا تالف أو ناقص، ويحدث ذلك حين يقطع تطبيق بريد أو دردشة رابطًا طويلًا. اطلب من المرسل أن يرسل الملف بدلًا منه.',
  'link_error.too_big': 'رابط التغييرات هذا أكبر مما يقبله LiveLocale (500 تغيير، 512 كيلوبايت).',
  'link_error.unsupported_version':
    'أُنشئ رابط التغييرات هذا بإصدار أحدث من LiveLocale. حدّث الموقع ثم حاول مرة أخرى.',
  'link_error.unsupported_environment':
    'لا يستطيع هذا المتصفح إنشاء روابط التغييرات أو قراءتها. استخدم إصدارًا حديثًا من Chrome أو Edge أو Firefox، أو Safari 16.4 أو أحدث.',
  'link_error.unreadable': 'تعذّرت قراءة رابط التغييرات.',
  'backup.too_many': 'أكثر من {max} تغيير: أرسل بعضها أولًا، ثم نزّل النسخة الاحتياطية.',
  'backup.no_link': 'لا يوجد رابط تغييرات في هذا الملف.',
  'backup.restored': {
    zero: 'لم يُستعد أي تغيير (الموجود هنا من قبل: {skipped}).',
    one: 'استُعيد تغيير واحد (الموجود هنا من قبل: {skipped}).',
    two: 'استُعيد تغييران (الموجود هنا من قبل: {skipped}).',
    few: 'استُعيدت {count} تغييرات (الموجود هنا من قبل: {skipped}).',
    many: 'استُعيد {count} تغييرًا (الموجود هنا من قبل: {skipped}).',
    other: 'استُعيد {count} تغيير (الموجود هنا من قبل: {skipped}).',
  },
};

/** Keys whose Arabic may equal the English (brand-only strings). */
export const SAME_IN_BOTH: ReadonlySet<StringKey> = new Set<StringKey>();
