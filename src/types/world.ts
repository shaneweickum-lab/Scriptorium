export interface CustomField {
  id: string;
  label: string;
  value: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date';
}

export interface WorldEntry {
  id: string;
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
  name: string;
  icon: string; // lucide icon name
  order: number;
  createdAt: number;
}

export const DEFAULT_SECTIONS: Omit<WorldSection, 'createdAt'>[] = [
  { id: 'characters', name: 'Characters', icon: 'Users', order: 0 },
  { id: 'events', name: 'Events', icon: 'Calendar', order: 1 },
  { id: 'ecology', name: 'Ecology', icon: 'Leaf', order: 2 },
  { id: 'cosmology', name: 'Cosmology', icon: 'Sparkles', order: 3 },
];
