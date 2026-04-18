import * as fs from 'fs';
import * as yaml from 'js-yaml';

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function collectUsesFromYamlNode(node: unknown, result: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectUsesFromYamlNode(item, result));
    return result;
  }

  if (!isObject(node)) {
    return result;
  }

  if ('module' in node && isObject(node.module)) {
    const moduleNode = node.module as Record<string, unknown>;
    const uses = moduleNode.uses;
    if (typeof uses === 'string') {
      result.push(uses);
    } else if (Array.isArray(uses)) {
      uses.forEach((useValue) => {
        if (typeof useValue === 'string') {
          result.push(useValue);
        }
      });
    }
  }

  Object.values(node).forEach((child) => collectUsesFromYamlNode(child, result));
  return result;
}

export function getUsesFromYamlFile(filePath: string): string[] {
  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }

  return collectUsesFromYamlNode(parsed);
}
