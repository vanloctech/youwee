import type {
  JsonShapeArrayDescriptor,
  JsonShapeDescriptor,
  JsonShapeObjectDescriptor,
} from './types';

export function createJsonShapeValidator(shape: JsonShapeDescriptor): (value: unknown) => boolean {
  return (value: unknown) => matchesJsonShape(value, shape);
}

export function matchesJsonShape(value: unknown, shape: JsonShapeDescriptor): boolean {
  if (typeof shape === 'string') {
    return matchesLeaf(value, shape);
  }

  if (shape.type === 'array') {
    return matchesArrayShape(value, shape);
  }

  if (shape.type === 'object') {
    return matchesObjectShape(value, shape);
  }

  return false;
}

function matchesLeaf(value: unknown, shape: string): boolean {
  switch (shape) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'unknown':
      return true;
    default:
      return false;
  }
}

function matchesArrayShape(value: unknown, shape: JsonShapeArrayDescriptor): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  if (!shape.items) {
    return true;
  }

  const itemShape = shape.items;
  return value.every((item) => matchesJsonShape(item, itemShape));
}

function matchesObjectShape(value: unknown, shape: JsonShapeObjectDescriptor): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const required = shape.required || [];
  for (const key of required) {
    if (!(key in record)) {
      return false;
    }
  }

  if (!shape.properties) {
    return true;
  }

  for (const [key, descriptor] of Object.entries(shape.properties)) {
    if (!(key in record)) {
      continue;
    }
    if (!matchesJsonShape(record[key], descriptor)) {
      return false;
    }
  }

  return true;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
