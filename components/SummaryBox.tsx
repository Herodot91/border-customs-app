import React from 'react';

interface SummaryBoxProps {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export const SummaryBox: React.FC<SummaryBoxProps> = ({ label, value, highlight }) => (
  <div className={`rounded-lg p-3 border min-w-[100px] flex-1 ${highlight ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
    <div className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">{label}</div>
    <div className={`text-2xl font-bold ${highlight ? 'text-indigo-400' : 'text-slate-100'}`}>{value}</div>
  </div>
);