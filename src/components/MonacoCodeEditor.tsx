import React, { useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme } from '../context/ThemeContext';

interface MonacoCodeEditorProps {
  value: string | null | undefined;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  language?: string;
  height?: string;
}

export const MonacoCodeEditor: React.FC<MonacoCodeEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  placeholder = '',
  language = 'plaintext',
  height = '100%',
}) => {
  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const safeValue = value || '';

  // Map our language types to Monaco languages
  const getMonacoLanguage = (lang: string): string => {
    const normalized = lang.toLowerCase();
    if (normalized.includes('splunk') || normalized === 'spl') return 'spl';
    if (normalized.includes('kql') || normalized.includes('sentinel') || normalized === 'kusto') return 'kql';
    if (normalized.includes('sql')) return 'sql';
    if (normalized.includes('yaml') || normalized.includes('sigma')) return 'yaml';
    if (normalized.includes('python')) return 'python';
    if (normalized.includes('json') || normalized.includes('elastic')) return 'json';
    return 'plaintext';
  };

  const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;

    // Register custom languages for SPL and KQL
    registerCustomLanguages(monacoInstance);

    // Set up custom themes
    defineCustomThemes(monacoInstance);

    // Configure editor options
    editor.updateOptions({
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      readOnly: readOnly,
      tabSize: 2,
      insertSpaces: true,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      padding: { top: 16, bottom: 16 },
      suggest: {
        showKeywords: true,
        showSnippets: true,
      },
    });
  };

  const registerCustomLanguages = (monacoInstance: typeof monaco) => {
    // Register SPL (Splunk Processing Language)
    if (!monacoInstance.languages.getLanguages().some(lang => lang.id === 'spl')) {
      monacoInstance.languages.register({ id: 'spl' });

      monacoInstance.languages.setMonarchTokensProvider('spl', {
        keywords: [
          'search', 'where', 'eval', 'stats', 'table', 'fields', 'rename', 'sort',
          'dedup', 'head', 'tail', 'top', 'rare', 'chart', 'timechart', 'bucket',
          'rex', 'replace', 'spath', 'join', 'append', 'appendcols', 'lookup',
          'inputlookup', 'outputlookup', 'subsearch', 'transaction', 'streamstats',
          'eventstats', 'multisearch', 'union', 'tstats', 'from', 'datamodel',
          'pivot', 'collect', 'return', 'map', 'foreach', 'accum', 'autoregress',
          'delta', 'trendline', 'predict', 'x11', 'anomalousvalue', 'anomalydetection',
          'by', 'as', 'in', 'over', 'span', 'earliest', 'latest', 'starttime', 'endtime',
          'sourcetype', 'source', 'index', 'host'
        ],
        functions: [
          'avg', 'count', 'sum', 'min', 'max', 'median', 'mode', 'stdev', 'var',
          'range', 'distinct_count', 'values', 'list', 'first', 'last', 'earliest',
          'latest', 'rate', 'dc', 'c', 'earliest_time', 'latest_time', 'estdc',
          'if', 'case', 'like', 'match', 'searchmatch', 'coalesce', 'null', 'nullif',
          'now', 'time', 'strftime', 'strptime', 'relative_time', 'len', 'lower',
          'upper', 'substr', 'trim', 'ltrim', 'rtrim', 'split', 'mvcount', 'mvindex',
          'mvjoin', 'tostring', 'tonumber', 'floor', 'ceil', 'round', 'abs', 'sqrt',
          'pow', 'exp', 'ln', 'log', 'exact', 'cidrmatch', 'isnotnull', 'isnull'
        ],
        operators: ['=', '!=', '<', '>', '<=', '>=', 'AND', 'OR', 'NOT', 'IN', 'LIKE'],
        
        tokenizer: {
          root: [
            [/\b(?:search|where|eval|stats|table|fields|rename|sort|dedup|head|tail|top|rare|chart|timechart|bucket|rex|replace|spath|join|append|appendcols|lookup|inputlookup|outputlookup|subsearch|transaction|streamstats|eventstats|multisearch|union|tstats|from|datamodel|pivot|collect|return|map|foreach|accum|autoregress|delta|trendline|predict|x11|anomalousvalue|anomalydetection|by|as|in|over|span|earliest|latest|starttime|endtime|sourcetype|source|index|host)\b/, 'keyword'],
            [/\b(?:avg|count|sum|min|max|median|mode|stdev|var|range|distinct_count|values|list|first|last|earliest|latest|rate|dc|c|earliest_time|latest_time|estdc|if|case|like|match|searchmatch|coalesce|null|nullif|now|time|strftime|strptime|relative_time|len|lower|upper|substr|trim|ltrim|rtrim|split|mvcount|mvindex|mvjoin|tostring|tonumber|floor|ceil|round|abs|sqrt|pow|exp|ln|log|exact|cidrmatch|isnotnull|isnull)\b/, 'function'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string_double'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/'/, 'string', '@string_single'],
            [/\|/, 'operator.pipe'],
            [/[=!<>]=?|AND|OR|NOT|IN|LIKE/, 'operator'],
            [/\d+\.?\d*/, 'number'],
            [/[a-zA-Z_]\w*/, 'identifier'],
          ],
          string_double: [
            [/[^\\"]+/, 'string'],
            [/"/, 'string', '@pop'],
          ],
          string_single: [
            [/[^\\']+/, 'string'],
            [/'/, 'string', '@pop'],
          ],
        },
      });
    }

    // Register KQL (Kusto Query Language)
    if (!monacoInstance.languages.getLanguages().some(lang => lang.id === 'kql')) {
      monacoInstance.languages.register({ id: 'kql' });

      monacoInstance.languages.setMonarchTokensProvider('kql', {
        keywords: [
          'where', 'extend', 'project', 'summarize', 'join', 'union', 'let', 'as',
          'on', 'by', 'sort', 'order', 'top', 'take', 'limit', 'count', 'distinct',
          'make-series', 'render', 'timechart', 'getschema', 'search', 'find', 'parse',
          'mvexpand', 'evaluate', 'invoke', 'serialize', 'materialize', 'partition',
          'asc', 'desc', 'nulls', 'first', 'last', 'kind', 'inner', 'fullouter',
          'leftouter', 'rightouter', 'leftanti', 'rightanti', 'leftsemi', 'rightsemi'
        ],
        functions: [
          'ago', 'now', 'datetime', 'timespan', 'startofday', 'startofweek', 'startofmonth',
          'endofday', 'endofweek', 'endofmonth', 'bin', 'floor', 'ceiling', 'round',
          'strlen', 'substring', 'tolower', 'toupper', 'strcat', 'split', 'trim',
          'replace', 'indexof', 'countof', 'extract', 'parse_json', 'parse_xml',
          'todynamic', 'tostring', 'toint', 'tolong', 'toreal', 'todatetime', 'totimespan',
          'array_length', 'array_concat', 'bag_keys', 'bag_merge', 'hash', 'hash_sha256',
          'isempty', 'isnotempty', 'isnull', 'isnotnull', 'case', 'iff', 'coalesce',
          'max', 'min', 'sum', 'avg', 'count', 'dcount', 'dcountif', 'countif', 'sumif',
          'avgif', 'minif', 'maxif', 'stdev', 'variance', 'percentile', 'percentiles',
          'any', 'take_any', 'make_list', 'make_set', 'make_bag', 'arg_max', 'arg_min'
        ],
        operators: ['==', '!=', '<', '>', '<=', '>=', '=~', '!~', 'contains', 'has', 'hasprefix', 'hassuffix', 'matches', 'regex', 'in', 'in~', '!in', '!in~', 'between', 'and', 'or', 'not'],

        tokenizer: {
          root: [
            [/\b(?:where|extend|project|summarize|join|union|let|as|on|by|sort|order|top|take|limit|count|distinct|make-series|render|timechart|getschema|search|find|parse|mvexpand|evaluate|invoke|serialize|materialize|partition|asc|desc|nulls|first|last|kind|inner|fullouter|leftouter|rightouter|leftanti|rightanti|leftsemi|rightsemi)\b/, 'keyword'],
            [/\b(?:ago|now|datetime|timespan|startofday|startofweek|startofmonth|endofday|endofweek|endofmonth|bin|floor|ceiling|round|strlen|substring|tolower|toupper|strcat|split|trim|replace|indexof|countof|extract|parse_json|parse_xml|todynamic|tostring|toint|tolong|toreal|todatetime|totimespan|array_length|array_concat|bag_keys|bag_merge|hash|hash_sha256|isempty|isnotempty|isnull|isnotnull|case|iff|coalesce|max|min|sum|avg|count|dcount|dcountif|countif|sumif|avgif|minif|maxif|stdev|variance|percentile|percentiles|any|take_any|make_list|make_set|make_bag|arg_max|arg_min)\b/, 'function'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string_double'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/'/, 'string', '@string_single'],
            [/\|/, 'operator.pipe'],
            [/==|!=|<=?|>=?|=~|!~|contains|has|hasprefix|hassuffix|matches|regex|in~?|!in~?|between|and|or|not/, 'operator'],
            [/\d+\.?\d*[dhms]?/, 'number'],
            [/[a-zA-Z_]\w*/, 'identifier'],
          ],
          string_double: [
            [/[^\\"]+/, 'string'],
            [/"/, 'string', '@pop'],
          ],
          string_single: [
            [/[^\\']+/, 'string'],
            [/'/, 'string', '@pop'],
          ],
        },
      });
    }
  };

  const defineCustomThemes = (monacoInstance: typeof monaco) => {
    // Dark theme - matches Material Design 3 dark theme (Zinc based)
    monacoInstance.editor.defineTheme('optimus-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '7dd3fc', fontStyle: 'bold' }, // Sky
        { token: 'function', foreground: 'fbbf24' }, // Amber
        { token: 'string', foreground: 'a5f3fc' }, // Cyan
        { token: 'number', foreground: 'c084fc' }, // Purple
        { token: 'operator', foreground: 'fb923c' }, // Orange
        { token: 'operator.pipe', foreground: 'fb923c', fontStyle: 'bold' },
        { token: 'comment', foreground: '71717a', fontStyle: 'italic' }, // Zinc
        { token: 'identifier', foreground: 'e4e4e7' }, 
      ],
      colors: {
        'editor.background': '#18181b', // Zinc-900/Black (background)
        'editor.foreground': '#e4e4e7', 
        'editor.lineHighlightBackground': '#27272a', // Zinc-800
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#a1a1aa',
        'editor.selectionBackground': '#3f3f46',
        'editor.inactiveSelectionBackground': '#27272a',
        'editorCursor.foreground': '#38bdf8', // Sky-400
      },
    });

    // Light theme - matches Material Design 3 light theme
    monacoInstance.editor.defineTheme('optimus-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '0284c7', fontStyle: 'bold' }, // Sky-600
        { token: 'function', foreground: 'd97706' }, // Amber-600
        { token: 'string', foreground: '0891b2' }, // Cyan-600
        { token: 'number', foreground: '9333ea' }, // Purple-600
        { token: 'operator', foreground: 'ea580c' }, // Orange-600
        { token: 'operator.pipe', foreground: 'ea580c', fontStyle: 'bold' },
        { token: 'comment', foreground: 'a1a1aa', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#18181b',
        'editor.lineHighlightBackground': '#f4f4f5',
        'editorLineNumber.foreground': '#a1a1aa',
        'editorLineNumber.activeForeground': '#52525b',
        'editor.selectionBackground': '#e4e4e7',
        'editor.inactiveSelectionBackground': '#f4f4f5',
        'editorCursor.foreground': '#0ea5e9',
      },
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg">
      <Editor
        height={height}
        language={getMonacoLanguage(language)}
        value={safeValue}
        onChange={(val) => onChange && onChange(val || '')}
        onMount={handleEditorDidMount}
        theme={theme === 'dark' ? 'optimus-dark' : 'optimus-light'}
        options={{
          readOnly: readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          scrollbar: {
            alwaysConsumeMouseWheel: false, // Allow scroll to pass through to parent when not needed
            vertical: readOnly ? 'hidden' : 'auto',
            horizontal: 'hidden',
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-surface-container-low text-on-surface-variant text-sm">
            Loading Optimus Editor...
          </div>
        }
      />
    </div>
  );
};