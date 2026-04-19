import * as fs from 'fs';
import * as path from 'path';
import { getUsesFromYamlFile } from './yamlDependencies';

export function normalizeRelativePath(relativePath: string): string {
  const segments = relativePath.split(path.sep).filter((segment) => segment !== '..');
  return path.join(...segments);
}

export function copyYamlDependenciesRecursively(
  entryPath: string,
  outputPath: string,
  copyRoot?: string
): { copiedEntryPath: string; copiedToOriginal: Map<string, string> } {
  const root = copyRoot && entryPath.startsWith(copyRoot) ? copyRoot : path.dirname(entryPath);

  const visited = new Set<string>();
  const queue = [entryPath];
  const copiedToOriginal = new Map<string, string>();

  while (queue.length > 0) {
    const currentPath = queue.shift() as string;
    if (visited.has(currentPath)) {
      continue;
    }
    visited.add(currentPath);

    const relative = path.relative(root, currentPath);
    const normalizedRelative = normalizeRelativePath(relative);
    const destinationPath = path.join(outputPath, normalizedRelative);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(currentPath, destinationPath);
    copiedToOriginal.set(destinationPath, currentPath);

    const uses = getUsesFromYamlFile(currentPath);
    uses.forEach((useEntry) => {
      const referencedPath = path.isAbsolute(useEntry)
        ? useEntry
        : path.resolve(path.dirname(currentPath), useEntry);
      if (fs.existsSync(referencedPath)) {
        queue.push(referencedPath);
      }
    });
  }

  const entryRelative = normalizeRelativePath(path.relative(root, entryPath));
  const copiedEntryPath = path.join(outputPath, entryRelative);
  return { copiedEntryPath, copiedToOriginal };
}
