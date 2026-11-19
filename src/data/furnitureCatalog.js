export const FURN_MIN = 0.3;
export const FURN_MAX = 8.0;

export const FURNITURE_CATEGORIES = [
  { id: 'bedroom', en: 'Bedroom', ar: 'غرفة النوم' },
  { id: 'living', en: 'Living', ar: 'المعيشة' },
  { id: 'dining', en: 'Dining', ar: 'السفرة' },
  { id: 'kitchen', en: 'Kitchen & bath', ar: 'المطبخ والحمام' },
  { id: 'other', en: 'Other', ar: 'أخرى' },
];

export const FURNITURE_CATALOG = [
  { type: 'bed', category: 'bedroom', en: 'Double bed', ar: 'سرير مزدوج', length: 2.0, width: 1.6 },
  { type: 'sbed', category: 'bedroom', en: 'Single bed', ar: 'سرير فردي', length: 1.9, width: 0.9 },
  { type: 'nightstand', category: 'bedroom', en: 'Nightstand', ar: 'كومودينو', length: 0.45, width: 0.4 },
  { type: 'wardrobe', category: 'bedroom', en: 'Wardrobe', ar: 'دولاب', length: 1.8, width: 0.6 },
  { type: 'dresser', category: 'bedroom', en: 'Dresser', ar: 'شيفونيرة', length: 1.2, width: 0.5 },
  { type: 'vanity', category: 'bedroom', en: 'Vanity', ar: 'تسريحة', length: 1.0, width: 0.45 },

  { type: 'sofa', category: 'living', en: 'Sofa', ar: 'كنبة', length: 2.1, width: 0.9 },
  { type: 'lsofa', category: 'living', en: 'L-Sofa', ar: 'كنبة زاوية', length: 2.8, width: 2.0 },
  { type: 'armchair', category: 'living', en: 'Armchair', ar: 'فوتيه', length: 0.85, width: 0.85 },
  { type: 'coffee', category: 'living', en: 'Coffee table', ar: 'ترابيزة وسط', length: 1.1, width: 0.6 },
  { type: 'tv', category: 'living', en: 'TV unit', ar: 'وحدة تلفزيون', length: 1.8, width: 0.4 },
  {
    type: 'rug',
    category: 'living',
    en: 'Rug',
    ar: 'سجادة',
    length: 3.0,
    width: 2.0,
    under: true,
    note: 'Sits under other furniture; never counts as an overlap.',
  },
  { type: 'bookcase', category: 'living', en: 'Bookcase', ar: 'مكتبة', length: 0.8, width: 0.35 },

  {
    type: 'dining',
    category: 'dining',
    en: 'Dining table + chairs',
    ar: 'سفرة بالكراسي',
    length: 1.6,
    width: 1.6,
    note: 'Size is the whole set including chairs; the table itself is about 0.90 m deep.',
  },
  { type: 'rtable', category: 'dining', en: 'Round table', ar: 'ترابيزة مستديرة', length: 1.1, width: 1.1 },
  { type: 'chair', category: 'dining', en: 'Chair', ar: 'كرسي', length: 0.5, width: 0.5 },
  { type: 'sideboard', category: 'dining', en: 'Sideboard', ar: 'بوفيه', length: 1.6, width: 0.45 },

  {
    type: 'counter',
    category: 'kitchen',
    en: 'Kitchen counter',
    ar: 'رخامة المطبخ',
    length: 2.4,
    width: 0.6,
    note: 'Drawn with a sink and, from 1.50 m long, a four-ring hob.',
  },
  { type: 'fridge', category: 'kitchen', en: 'Fridge', ar: 'ثلاجة', length: 0.7, width: 0.7 },
  { type: 'washer', category: 'kitchen', en: 'Washing machine', ar: 'غسالة', length: 0.6, width: 0.6 },
  { type: 'shower', category: 'kitchen', en: 'Shower', ar: 'كابينة دش', length: 0.9, width: 0.9 },
  { type: 'bathtub', category: 'kitchen', en: 'Bathtub', ar: 'بانيو', length: 1.7, width: 0.75 },
  { type: 'toilet', category: 'kitchen', en: 'Toilet', ar: 'مرحاض', length: 0.4, width: 0.7 },
  { type: 'basin', category: 'kitchen', en: 'Washbasin', ar: 'حوض', length: 0.6, width: 0.45 },

  { type: 'desk', category: 'other', en: 'Desk', ar: 'مكتب', length: 1.2, width: 0.6 },
  { type: 'table', category: 'other', en: 'Table', ar: 'طاولة', length: 1.6, width: 0.9 },
  { type: 'plant', category: 'other', en: 'Plant', ar: 'نبات', length: 0.4, width: 0.4 },
];

export const FURNITURE_BY_TYPE = Object.fromEntries(FURNITURE_CATALOG.map(f => [f.type, f]));
