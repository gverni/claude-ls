export function encodePath(absPath) {
  return absPath.replaceAll("/", "-");
}
