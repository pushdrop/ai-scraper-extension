import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { SmartCopyPlan, ScrapePlan } from '../shared/modelClient';
import { askAiForPlan, askAiToRevisePlan } from '../shared/modelClient';
import { formatToCsv } from '../shared/csv';
import { formatToMarkdown } from '../shared/markdown';

type HistoryEntry = {
  id: number;
  date: string;
  url: string;
  title: string;
  rowCount: number;
  plan: ScrapePlan;
  rows: Record<string, unknown>[];
};

function Popup() {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'ai_thinking' | 'choosing' | 'extracting' | 'done' | 'error' | 'revising'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [userInstruction, setUserInstruction] = useState('');
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [aiPlan, setAiPlan] = useState<SmartCopyPlan | null>(null);
  const [rawCandidates, setRawCandidates] = useState<any[]>([]);
  const [extractedRows, setExtractedRows] = useState<Record<string, unknown>[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ScrapePlan | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  React.useEffect(() => {
    if (status === 'idle') {
      chrome.storage.local.get('history', (res) => {
        if (res.history) setHistory(res.history as HistoryEntry[]);
      });
    }
  }, [status]);

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStatus('error');
  };

  const executeExtraction = async (plan: ScrapePlan) => {
    setStatus('extracting');
    setSelectedPlan(plan);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'EXECUTE_SCRAPE', plan }, async (response) => {
        if (chrome.runtime.lastError) {
           return handleError(chrome.runtime.lastError.message || 'Error extracting');
        }
        if (response?.error) {
          return handleError(response.error);
        }
        const rows = response.rows || [];
        setExtractedRows(rows);
        setStatus('done');

        // Save to history
        const entry: HistoryEntry = {
          id: Date.now(),
          date: new Date().toLocaleString(),
          url: tab.url || '',
          title: tab.title || 'Unknown Page',
          rowCount: rows.length,
          plan: plan,
          rows: rows
        };

        const storage = await chrome.storage.local.get('history');
        let hist: HistoryEntry[] = (storage.history as HistoryEntry[]) || [];
        hist.unshift(entry);
        if (hist.length > 10) hist = hist.slice(0, 10);
        
        try {
          await chrome.storage.local.set({ history: hist });
        } catch (e) {
          console.error("Failed to save history (likely quota exceeded)", e);
        }
      });
    }
  };

  const loadHistoryItem = (item: HistoryEntry) => {
    setSelectedPlan(item.plan);
    setExtractedRows(item.rows);
    setStatus('done');
  };

  const handleRevise = async () => {
    if (!selectedPlan) return;
    setStatus('revising');
    try {
      const newPlan = await askAiToRevisePlan(rawCandidates, selectedPlan, extractedRows, revisionInstruction);
      await executeExtraction(newPlan);
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
          const plan = await askAiForPlan(response.candidates, userInstruction.trim());
          setAiPlan(plan);
          
          if (plan.mode === 'auto_selected' && plan.scrapePlans && plan.scrapePlans.length > 0) {
            await executeExtraction(plan.scrapePlans[0]);
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
    if (!selectedPlan) return;
    const fields = selectedPlan.fields.map(f => f.name);
    let str = '';
    if (format === 'csv') str = formatToCsv(extractedRows, fields);
    else if (format === 'json') str = JSON.stringify(extractedRows, null, 2);
    else str = formatToMarkdown(extractedRows, fields);
    
    navigator.clipboard.writeText(str).then(() => {
      alert(`Copied ${extractedRows.length} rows as ${format.toUpperCase()}`);
    }).catch(() => {
      alert('Failed to copy to clipboard');
    });
  };

  const handleHoverCandidate = async (candidateId: string) => {
    const raw = rawCandidates.find(c => c.candidateId === candidateId);
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

  return (
    <div style={{ padding: '16px', minWidth: '350px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '16px' }}>Smart Copy Page</h1>
      
      {status === 'idle' && (
        <div style={{ marginBottom: '16px' }}>
          <input 
            type="text" 
            placeholder="Optional: what data do you want? (e.g. only prices)" 
            value={userInstruction}
            onChange={(e) => setUserInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
            style={{ width: '100%', padding: '8px', marginBottom: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
          />
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
            {history.map(item => (
              <div 
                key={item.id} 
                onClick={() => loadHistoryItem(item)}
                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fafafa' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}
              >
                <div style={{ fontWeight: 'bold', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                   <span>{item.rowCount} items</span>
                   <span>{item.date}</span>
                </div>
              </div>
            ))}
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
            {aiPlan.candidates.map(c => (
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
                     const sPlan = aiPlan.scrapePlans?.find(p => p.candidateId === c.candidateId);
                     if (sPlan) {
                       executeExtraction(sPlan);
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

      {status === 'done' && (
        <div>
          <p style={{ fontWeight: 'bold' }}>Success! Extracted {extractedRows.length} items.</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button onClick={() => handleCopy('csv')} style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>Copy CSV</button>
            <button onClick={() => handleCopy('json')} style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>Copy JSON</button>
            <button onClick={() => handleCopy('markdown')} style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>Copy MD</button>
          </div>
          
          <div style={{ maxHeight: '200px', overflow: 'auto', background: '#f5f5f5', padding: '8px', borderRadius: '4px', fontSize: '12px', marginBottom: '16px' }}>
            <pre style={{ margin: 0 }}>{JSON.stringify(extractedRows.slice(0, 2), null, 2)}</pre>
            {extractedRows.length > 2 && <p style={{ color: '#666', marginTop: '8px' }}>... and {extractedRows.length - 2} more rows</p>}
          </div>

          <div style={{ background: '#eef6fc', padding: '12px', borderRadius: '6px' }}>
             <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold' }}>Data not quite right?</p>
             <input 
                type="text" 
                placeholder="E.g., remove the image field, extract the href"
                value={revisionInstruction}
                onChange={e => setRevisionInstruction(e.target.value)}
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
