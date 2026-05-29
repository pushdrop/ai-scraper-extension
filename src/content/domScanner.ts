export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isValidContentElement(el: Element): boolean {
  const tagName = el.tagName.toLowerCase();
  const invalidTags = ['script', 'style', 'noscript', 'svg', 'canvas', 'template', 'nav', 'header', 'footer'];
  if (invalidTags.includes(tagName)) return false;

  const role = el.getAttribute('role');
  if (role === 'navigation' || role === 'banner' || role === 'contentinfo') return false;

  return isElementVisible(el);
}

export function getScanRoots(): Element[] {
  return Array.from(document.querySelectorAll('*')).filter(el => {
    if (!isValidContentElement(el)) return false;
    return el.children.length >= 3;
  });
}
