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
  { name: 'Characters', icon: 'Users', order: 0 },
  { name: 'Events', icon: 'Calendar', order: 1 },
  { name: 'Ecology', icon: 'Leaf', order: 2 },
  { name: 'Cosmology', icon: 'Sparkles', order: 3 },
];
