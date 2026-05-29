export function formatToMarkdown(rows: Record<string, unknown>[], fields: string[]): string {
  if (rows.length === 0) return '';
  
  const header = `| ${fields.join(' | ')} |`;
  const separator = `| ${fields.map(() => '---').join(' | ')} |`;
  
  const body = rows.map(row => {
    return `| ` + fields.map(f => {
      const val = row[f];
      const strVal = val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
      // Escape pipes and newlines
      return strVal.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
    }).join(' | ') + ` |`;
  }).join('\n');
  
  return `${header}\n${separator}\n${body}`;
}
