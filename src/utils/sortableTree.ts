import type { WritingNode } from '../types';

export interface TreeItem extends WritingNode {
  children: TreeItem[];
  depth: number;
}

export function buildTree(nodes: WritingNode[]): TreeItem[] {
  const map = new Map<string, TreeItem>();
  const roots: TreeItem[] = [];

  for (const node of nodes) {
    map.set(node.id, { ...node, children: [], depth: 0 });
  }

  for (const node of nodes) {
    const item = map.get(node.id)!;
    if (node.parentId === null) {
      roots.push(item);
    } else {
      const parent = map.get(node.parentId);
      if (parent) {
        item.depth = parent.depth + 1;
        parent.children.push(item);
      } else {
        roots.push(item);
      }
    }
  }

  function sortChildren(items: TreeItem[]): void {
    items.sort((a, b) => a.order - b.order);
    for (const item of items) sortChildren(item.children);
  }
  sortChildren(roots);

  return roots;
}

export function flattenTree(tree: TreeItem[]): TreeItem[] {
  const result: TreeItem[] = [];
  function walk(items: TreeItem[]) {
    for (const item of items) {
      result.push(item);
      walk(item.children);
    }
  }
  walk(tree);
  return result;
}

export function getDescendantIds(nodes: WritingNode[], nodeId: string): string[] {
  const ids: string[] = [];
  function walk(parentId: string) {
    const children = nodes.filter((n) => n.parentId === parentId);
    for (const child of children) {
      ids.push(child.id);
      walk(child.id);
    }
  }
  walk(nodeId);
  return ids;
}

export function getNextOrder(nodes: WritingNode[], parentId: string | null): number {
  const siblings = nodes.filter((n) => n.parentId === parentId);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.order)) + 1;
}
