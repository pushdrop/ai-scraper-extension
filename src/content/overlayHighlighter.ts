export function highlightElements(selector: string) {
  clearHighlights();
  
  try {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el instanceof HTMLElement) {
        el.dataset.smartcopyHighlightOriginalOutline = el.style.outline;
        el.dataset.smartcopyHighlightOriginalOutlineOffset = el.style.outlineOffset;
        
        el.style.outline = '3px solid #0066cc';
        el.style.outlineOffset = '-3px';
        el.classList.add('smartcopy-highlighted');
      }
    });
  } catch (e) {
    console.error('Invalid selector for highlighting:', selector);
  }
}

export function clearHighlights() {
  const highlighted = document.querySelectorAll('.smartcopy-highlighted');
  highlighted.forEach(el => {
    if (el instanceof HTMLElement) {
      el.style.outline = el.dataset.smartcopyHighlightOriginalOutline || '';
      el.style.outlineOffset = el.dataset.smartcopyHighlightOriginalOutlineOffset || '';
      
      delete el.dataset.smartcopyHighlightOriginalOutline;
      delete el.dataset.smartcopyHighlightOriginalOutlineOffset;
      
      el.classList.remove('smartcopy-highlighted');
    }
  });
}
