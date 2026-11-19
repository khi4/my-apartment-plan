export const SPACE_KINDS = ['room', 'hall', 'terrace', 'void'];

export const ROOM_MIN_SIZE = 0.4;
export const ROOM_MAX_SIZE = 30.0;

export const ROOM_PRESETS = [
  { id: 'living', kind: 'room', en: 'Living / Reception', ar: 'معيشة / استقبال', across: 4.5, deep: 3.8 },
  { id: 'bedroom', kind: 'room', en: 'Bedroom', ar: 'غرفة نوم', across: 3.8, deep: 3.5 },
  { id: 'master', kind: 'room', en: 'Master Bedroom', ar: 'غرفة نوم رئيسية', across: 4.2, deep: 3.6 },
  { id: 'kitchen', kind: 'room', en: 'Kitchen', ar: 'مطبخ', across: 3.4, deep: 2.5 },
  { id: 'bathroom', kind: 'room', en: 'Bathroom', ar: 'حمام', across: 2.2, deep: 1.8 },
  { id: 'dining', kind: 'room', en: 'Dining Room', ar: 'غرفة طعام', across: 3.6, deep: 3.2 },
  { id: 'office', kind: 'room', en: 'Study / Office', ar: 'مكتب / دراسة', across: 3.0, deep: 2.8 },
  { id: 'hall', kind: 'hall', en: 'Hall / Corridor', ar: 'ممر / صالة توزيع', across: 4.0, deep: 1.2 },
  { id: 'lobby', kind: 'hall', en: 'Entrance Lobby', ar: 'بهو المدخل', across: 2.6, deep: 2.2 },
  { id: 'terrace', kind: 'terrace', en: 'Terrace / Balcony', ar: 'تراس / بلكونة', across: 3.6, deep: 1.5 },
  { id: 'void', kind: 'void', en: 'Light Well / Shaft', ar: 'منور / بئر مصعد', across: 2.5, deep: 1.5 },
];

export const ROOM_PRESETS_BY_ID = Object.fromEntries(ROOM_PRESETS.map(p => [p.id, p]));
