import { create } from 'zustand';
import type { Book, HierarchyLabels } from '../types';
import { BOOK_COLORS, DEFAULT_HIERARCHY_LABELS, DEFAULT_ENABLED_LEVELS } from '../types';
import { libraryRepository } from '../db/libraryRepository';
import { worldRepository } from '../db/worldRepository';
import { generateId } from '../utils/id';

const ACTIVE_BOOK_KEY = 'scriptorium_active_book';

interface LibraryState {
  books: Book[];
  activeBook: Book | null;
  isLoaded: boolean;

  loadLibrary: () => Promise<void>;
  createBook: (title: string, author?: string, synopsis?: string) => Promise<Book>;
  updateBook: (id: string, updates: Partial<Book>) => Promise<void>;
  updateHierarchyLabels: (labels: HierarchyLabels) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  openBook: (id: string) => Promise<void>;
  closeBook: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  activeBook: null,
  isLoaded: false,

  loadLibrary: async () => {
    try {
      const books = await libraryRepository.getAllBooks();
      const savedBookId = localStorage.getItem(ACTIVE_BOOK_KEY);
      const activeBook = savedBookId ? books.find((b) => b.id === savedBookId) ?? null : null;
      set({ books, activeBook, isLoaded: true });
    } catch (err) {
      console.error('Failed to load library:', err);
      set({ books: [], activeBook: null, isLoaded: true });
    }
  },

  createBook: async (title, author = '', synopsis = '') => {
    const colorIdx = get().books.length % BOOK_COLORS.length;
    const book: Book = {
      id: generateId(),
      title: title.trim() || 'Untitled Book',
      author,
      synopsis,
      coverColor: BOOK_COLORS[colorIdx],
      hierarchyLabels: { ...DEFAULT_HIERARCHY_LABELS },
      enabledLevels: { ...DEFAULT_ENABLED_LEVELS },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await libraryRepository.addBook(book);
    // Seed default world sections for the new book
    await worldRepository.seedDefaultSections(book.id);
    set((state) => ({ books: [...state.books, book] }));
    return book;
  },

  updateBook: async (id, updates) => {
    await libraryRepository.updateBook(id, updates);
    set((state) => ({
      books: state.books.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b)),
      activeBook: state.activeBook?.id === id
        ? { ...state.activeBook, ...updates, updatedAt: Date.now() }
        : state.activeBook,
    }));
  },

  updateHierarchyLabels: async (labels) => {
    const { activeBook } = get();
    if (!activeBook) return;
    await libraryRepository.updateBook(activeBook.id, { hierarchyLabels: labels });
    set((state) => ({
      books: state.books.map((b) =>
        b.id === activeBook.id ? { ...b, hierarchyLabels: labels, updatedAt: Date.now() } : b
      ),
      activeBook: { ...activeBook, hierarchyLabels: labels, updatedAt: Date.now() },
    }));
  },

  deleteBook: async (id) => {
    await libraryRepository.deleteBook(id);
    const { activeBook } = get();
    if (activeBook?.id === id) {
      localStorage.removeItem(ACTIVE_BOOK_KEY);
    }
    set((state) => ({
      books: state.books.filter((b) => b.id !== id),
      activeBook: state.activeBook?.id === id ? null : state.activeBook,
    }));
  },

  openBook: async (id) => {
    const book = get().books.find((b) => b.id === id);
    if (!book) return;
    localStorage.setItem(ACTIVE_BOOK_KEY, id);
    set({ activeBook: book });
  },

  closeBook: () => {
    localStorage.removeItem(ACTIVE_BOOK_KEY);
    set({ activeBook: null });
  },
}));
