self.onmessage = (e) => {
  const { text, dict } = e.data || {};
  const n = (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = n.split(/\s+/).filter(Boolean);
  const joined = ' ' + words.join(' ') + ' ';
  const pick = (arr) => Array.from(new Set((arr || []).filter(k => joined.includes(' ' + String(k).toLowerCase() + ' '))));
  const scope = pick(dict.scope);
  const longLead = pick(dict.longLead);
  const risks = pick(dict.risks);
  const clarifications = pick(dict.clarifications);
  self.postMessage({ scope, longLead, risks, clarifications });
};




