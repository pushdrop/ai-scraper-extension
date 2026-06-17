import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { SmartCopyPlan, ScrapePlan } from '../shared/modelClient';
import { askAiForPlan, askAiToRevisePlan } from '../shared/modelClient';
import { formatToCsv } from '../shared/csv';
import { formatToMarkdown } from '../shared/markdown';

type DatasetResult = {
  label: string;
  plan: ScrapePlan;
  rows: Record<string, unknown>[];
};

type HistoryEntry = {
  id: number;
  date: string;
  url: string;
  title: string;
  // New shape: one scan can contain multiple datasets.
  datasets?: DatasetResult[];
  // Legacy shape (single dataset) — kept for backward compat with old storage.
  rowCount?: number;
  plan?: ScrapePlan;
  rows?: Record<string, unknown>[];
};

function normalizeHistoryEntry(item: HistoryEntry): DatasetResult[] {
  if (item.datasets && item.datasets.length > 0) return item.datasets;
  if (item.plan && item.rows) {
    return [{ label: 'Extracted data', plan: item.plan, rows: item.rows }];
  }
  return [];
}

function Popup() {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'ai_thinking' | 'choosing' | 'extracting' | 'done' | 'error' | 'revising'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [userInstruction, setUserInstruction] = useState('');
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [pageSelection, setPageSelection] = useState('');
  const [useSelection, setUseSelection] = useState(false);
  const [aiPlan, setAiPlan] = useState<SmartCopyPlan | null>(null);
  const [rawCandidates, setRawCandidates] = useState<any[]>([]);
  const [results, setResults] = useState<DatasetResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  React.useEffect(() => {
    if (status === 'idle') {
      chrome.storage.local.get('history', (res) => {
        if (res.history) setHistory(res.history as HistoryEntry[]);
      });

      // Pick up any text the user highlighted on the page, to offer it as a hint.
      // Injected fresh each time so it works even on tabs loaded before the
      // extension was (re)loaded — no dependency on the persistent content script.
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: () => window.getSelection()?.toString() || '',
          },
          (injectionResults) => {
            if (chrome.runtime.lastError) return; // can't inject (e.g. chrome:// pages)
            const raw = (injectionResults?.[0]?.result as string) || '';
            const sel = raw.replace(/\s+/g, ' ').trim();
            setPageSelection(sel);
            setUseSelection(sel.length > 0); // default on when there's a selection
          }
        );
      });
    }
  }, [status]);

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStatus('error');
  };

  const labelForCandidate = (plan: SmartCopyPlan | null, candidateId: string): string => {
    const c = plan?.candidates.find((c) => c.candidateId === candidateId);
    if (!c) return candidateId;
    return `${c.label} (${c.itemCount})`;
  };

  // Runs a single scrape plan in the active tab.
  const runPlan = (tabId: number, plan: ScrapePlan): Promise<Record<string, unknown>[]> => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_SCRAPE', plan }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message || 'Error extracting'));
        }
        if (response?.error) return reject(new Error(response.error));
        resolve(response?.rows || []);
      });
    });
  };

  // Extracts one or more datasets, displays them as tabs, and saves one history entry.
  const executeDatasets = async (plans: ScrapePlan[], planEnvelope: SmartCopyPlan | null) => {
    setStatus('extracting');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return handleError('No active tab.');

    try {
      const datasets: DatasetResult[] = [];
      for (const plan of plans) {
        const rows = await runPlan(tab.id, plan);
        datasets.push({ label: labelForCandidate(planEnvelope, plan.candidateId), plan, rows });
      }

      // Keep only datasets that actually returned data.
      const nonEmpty = datasets.filter((d) => d.rows.length > 0);
      const finalDatasets = nonEmpty.length > 0 ? nonEmpty : datasets;

      setResults(finalDatasets);
      setActiveIndex(0);
      setStatus('done');

      const entry: HistoryEntry = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        url: tab.url || '',
        title: tab.title || 'Unknown Page',
        datasets: finalDatasets,
      };

      const storage = await chrome.storage.local.get('history');
      let hist: HistoryEntry[] = (storage.history as HistoryEntry[]) || [];
      hist.unshift(entry);
      if (hist.length > 10) hist = hist.slice(0, 10);
      try {
        await chrome.storage.local.set({ history: hist });
      } catch (e) {
        console.error('Failed to save history (likely quota exceeded)', e);
      }
    } catch (e: any) {
      handleError(e.message || 'Error extracting');
    }
  };

  const loadHistoryItem = (item: HistoryEntry) => {
    setResults(normalizeHistoryEntry(item));
    setActiveIndex(0);
    setAiPlan(null);
    setStatus('done');
  };

  const handleRevise = async () => {
    const active = results[activeIndex];
    if (!active) return;
    setStatus('revising');
    try {
      const newPlan = await askAiToRevisePlan(rawCandidates, active.plan, active.rows, revisionInstruction);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return handleError('No active tab.');
      const rows = await runPlan(tab.id, newPlan);
      // Replace only the active dataset; leave the others intact.
      const updated = results.slice();
      updated[activeIndex] = { label: active.label, plan: newPlan, rows };
      setResults(updated);
      setRevisionInstruction('');
      setStatus('done');
    } catch (e: any) {
      console.error('AI Revision Error:', e);
      handleError(e.message || 'Error revising plan with AI');
    }
  };

  const handleScan = async () => {
    setStatus('scanning');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' }, async (response) => {
        if (chrome.runtime.lastError) {
          return handleError('Could not connect to page. Reload the page and try again.');
        }
        if (!response || !response.candidates || response.candidates.length === 0) {
          return handleError('No repeated data groups found on this page.');
        }

        setRawCandidates(response.candidates);
        setStatus('ai_thinking');
        try {
          const selectionHint = useSelection && pageSelection ? pageSelection : undefined;
          const plan = await askAiForPlan(response.candidates, userInstruction.trim(), selectionHint);
          setAiPlan(plan);
          const plans = plan.scrapePlans || [];

          if (plan.mode === 'auto_selected' && plans.length > 0) {
            await executeDatasets([plans[0]], plan);
          } else if (plan.mode === 'multiple_datasets' && plans.length > 0) {
            // Extract every distinct dataset and show them as tabs.
            await executeDatasets(plans, plan);
          } else if (plan.mode === 'needs_user_choice') {
            setStatus('choosing');
          } else {
            console.error('Unexpected AI Plan Mode:', plan.mode, plan);
            handleError(`AI could not confidently identify data (returned mode: ${plan.mode}). Click example fallback not implemented yet.`);
          }
        } catch (e: any) {
          console.error('AI Error:', e);
          handleError(e.message || 'Error calling AI');
        }
      });
    }
  };

  const handleCopy = (format: 'csv' | 'json' | 'markdown') => {
    const active = results[activeIndex];
    if (!active) return;
    const fields = active.plan.fields.map((f) => f.name);
    let str = '';
    if (format === 'csv') str = formatToCsv(active.rows, fields);
    else if (format === 'json') str = JSON.stringify(active.rows, null, 2);
    else str = formatToMarkdown(active.rows, fields);

    navigator.clipboard.writeText(str).then(() => {
      alert(`Copied ${active.rows.length} rows as ${format.toUpperCase()}`);
    }).catch(() => {
      alert('Failed to copy to clipboard');
    });
  };

  const handleHoverCandidate = async (candidateId: string) => {
    const raw = rawCandidates.find((c) => c.candidateId === candidateId);
    if (!raw) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'HIGHLIGHT_CANDIDATE', selector: raw.itemSelector });
    }
  };

  const handleLeaveCandidate = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_HIGHLIGHTS' });
    }
  };

  const active = results[activeIndex];

  return (
    <div style={{ padding: '16px', minWidth: '350px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '16px' }}>Smart Copy Page</h1>

      {status === 'idle' && (
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Optional: what data do you want? (e.g. products and reviews)"
            value={userInstruction}
            onChange={(e) => setUserInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
            style={{ width: '100%', padding: '8px', marginBottom: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          {pageSelection && (
            <div style={{ marginBottom: '8px', background: '#f3f8ff', border: '1px solid #cfe2ff', borderRadius: '4px', padding: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useSelection}
                  onChange={(e) => setUseSelection(e.target.checked)}
                  style={{ marginTop: '2px' }}
                />
                <span>
                  <strong>Use my selected text as a hint</strong>
                  <span
                    style={{ display: 'block', color: '#666', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={pageSelection}
                  >
                    "{pageSelection.slice(0, 80)}{pageSelection.length > 80 ? '…' : ''}"
                  </span>
                </span>
              </label>
            </div>
          )}
          <button
            onClick={handleScan}
            style={{ padding: '10px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontSize: '16px' }}
          >
            Copy Useful Data
          </button>
        </div>
      )}

      {status === 'idle' && history.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>Recent Extractions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {history.map((item) => {
              const datasets = normalizeHistoryEntry(item);
              const totalRows = datasets.reduce((sum, d) => sum + d.rows.length, 0);
              return (
                <div
                  key={item.id}
                  onClick={() => loadHistoryItem(item)}
                  style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fafafa' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{totalRows} items{datasets.length > 1 ? ` · ${datasets.length} datasets` : ''}</span>
                    <span>{item.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {status === 'scanning' && <p>Scanning page...</p>}
      {status === 'ai_thinking' && <p>Finding useful data...</p>}
      {status === 'extracting' && <p>Extracting data locally...</p>}

      {status === 'error' && (
        <div>
          <p style={{ color: 'red' }}>{errorMsg}</p>
          <button onClick={() => setStatus('idle')}>Try Again</button>
        </div>
      )}

      {status === 'choosing' && aiPlan && (
        <div>
          <p>I found a few possible data groups:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {aiPlan.candidates.map((c) => (
              <div
                key={c.candidateId}
                style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '6px' }}
                onMouseEnter={() => handleHoverCandidate(c.candidateId)}
                onMouseLeave={handleLeaveCandidate}
              >
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>{c.label} ({c.itemCount} items)</h3>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>{c.sampleSummary}</p>
                <button
                  onClick={() => {
                    const sPlan = aiPlan.scrapePlans?.find((p) => p.candidateId === c.candidateId);
                    if (sPlan) {
                      executeDatasets([sPlan], aiPlan);
                    } else {
                      handleError('Could not find scrape plan for this candidate.');
                    }
                  }}
                  style={{ padding: '4px 12px', cursor: 'pointer' }}
                >
                  Use This
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'done' && active && (
        <div>
          {results.length > 1 && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border: '1px solid #0066cc',
                    borderRadius: '4px',
                    background: i === activeIndex ? '#0066cc' : 'white',
                    color: i === activeIndex ? 'white' : '#0066cc',
                  }}
                >
                  {r.label} ({r.rows.length})
                </button>
              ))}
            </div>
          )}

          <p style={{ fontWeight: 'bold' }}>
            {results.length > 1 ? `${active.label}: ` : 'Success! Extracted '}{active.rows.length} items.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button onClick={() => handleCopy('csv')} style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>Copy CSV</button>
            <button onClick={() => handleCopy('json')} style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>Copy JSON</button>
            <button onClick={() => handleCopy('markdown')} style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>Copy MD</button>
          </div>

          <div style={{ maxHeight: '200px', overflow: 'auto', background: '#f5f5f5', padding: '8px', borderRadius: '4px', fontSize: '12px', marginBottom: '16px' }}>
            <pre style={{ margin: 0 }}>{JSON.stringify(active.rows.slice(0, 2), null, 2)}</pre>
            {active.rows.length > 2 && <p style={{ color: '#666', marginTop: '8px' }}>... and {active.rows.length - 2} more rows</p>}
          </div>

          <div style={{ background: '#eef6fc', padding: '12px', borderRadius: '6px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold' }}>This dataset not quite right?</p>
            <input
              type="text"
              placeholder="E.g., remove the image field, extract the href"
              value={revisionInstruction}
              onChange={(e) => setRevisionInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRevise(); }}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <button
              onClick={handleRevise}
              style={{ padding: '8px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
            >
              Fix with AI
            </button>
          </div>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button onClick={() => setStatus('idle')} style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}>
              &larr; Start New Scan
            </button>
          </div>
        </div>
      )}

      {status === 'revising' && <p>Asking AI to fix the data...</p>}

      <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '8px', textAlign: 'right' }}>
        <a href="#" onClick={() => chrome.runtime.openOptionsPage()} style={{ fontSize: '12px', color: '#666', textDecoration: 'none' }}>Settings</a>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
