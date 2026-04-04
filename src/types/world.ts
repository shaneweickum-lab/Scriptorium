export interface CustomField {
  id: string;
  label: string;
  value: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date';
}

export interface WorldEntry {
  id: string;
  bookId: string;
  sectionId: string;
  title: string;
  content: string; // TipTap JSON as string
  customFields: CustomField[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorldSection {
  id: string;
  bookId: string;
  name: string;
  icon: string; // lucide icon name
  order: number;
  createdAt: number;
}

export const DEFAULT_SECTION_TEMPLATES = [
  { name: 'History and Timeline', icon: 'Clock', order: 0 },
  { name: 'Geography', icon: 'Map', order: 1 },
  { name: 'Magic System or Technology', icon: 'Zap', order: 2 },
  { name: 'Cultures', icon: 'Users', order: 3 },
  { name: 'Characters', icon: 'User', order: 4 },
  { name: 'Creatures and Flora', icon: 'Leaf', order: 5 },
  { name: 'Lore Corrections', icon: 'AlertCircle', order: 6 },
  { name: 'Open Questions', icon: 'HelpCircle', order: 7 },
  { name: 'Established Facts', icon: 'CheckCircle2', order: 8 },
];
