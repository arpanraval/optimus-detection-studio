import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIQueryGenerator } from '../AIQueryGenerator';
import { generateAIJSON } from '@/lib/aiService';
import { formatSentinelOneQuery } from '@/lib/sentinelOneFormatting';

vi.mock('@/lib/aiService', () => ({
  generateAIJSON: vi.fn(),
  DEFAULT_MODEL: 'test-model',
  getModelById: () => ({ name: 'Test model' }),
}));
vi.mock('../ModelSelector', () => ({ ModelSelector: () => null }));
vi.mock('../Icon', () => ({ Icon: () => null }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function submit(text: string) {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('AI query generation and draft flow', () => {
  it('displays, copies and saves a multiline SentinelOne query even when the model returns one line', async () => {
    const query = "dataSource.name = 'SentinelOne' AND (src.process.name = 'a' OR src.process.name = 'b')";
    vi.mocked(generateAIJSON).mockResolvedValue({
      query: `\`\`\`s1ql\n${query}\n\`\`\``,
      explanation: 'Formatted query',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const createDraft = vi.fn();
    const { container } = render(<AIQueryGenerator onCreateDraft={createDraft} />);
    submit('I need sentinelone S1QL2 query');
    await screen.findByText('Formatted query');
    expect(container.querySelector('pre')!.children.length).toBeGreaterThan(3);
    expect(container.querySelector('pre')!.className).toContain('whitespace-pre-wrap');
    fireEvent.click(screen.getAllByTitle('Copy').at(-1)!);
    expect(writeText).toHaveBeenCalledWith(formatSentinelOneQuery(query));
    fireEvent.click(screen.getByTitle('Create Draft'));
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ detectionQuery: formatSentinelOneQuery(query) }),
    );
  });
  it('translates an existing query to Defender when the user requests Microsoft Defender KQL', async () => {
    vi.mocked(generateAIJSON)
      .mockResolvedValueOnce({ query: 'rule powershell { condition: true }', explanation: 'First query' })
      .mockResolvedValueOnce({
        query: 'DeviceProcessEvents | where FileName == "powershell.exe"',
        explanation: 'Defender query',
      });
    const createDraft = vi.fn();
    render(<AIQueryGenerator onCreateDraft={createDraft} />);
    submit('generate a Chronicle query for encoded PowerShell execution');
    await screen.findByText('First query');
    submit('give me same query for microsoft defender kql');
    await screen.findByText('Defender query');
    expect(screen.getByRole('button', { name: 'Microsoft Defender XDR KQL' })).toBeTruthy();
    const request = vi.mocked(generateAIJSON).mock.calls[1][0];
    expect(request.prompt).toContain('Write production-ready Microsoft Defender XDR KQL syntax');
    expect(request.prompt).toContain(
      'CURRENT Chronicle YARA-L QUERY (refine or translate to Microsoft Defender XDR KQL)',
    );
    fireEvent.click(screen.getAllByTitle('Create Draft')[1]);
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ queryLanguage: 'KQL' }));
  });

  it.each([
    ['SentinelOne S1QL (Legacy)', 'S1QL'],
    ['SentinelOne S1QL 2.0', 'S1QL 2.0'],
    ['SentinelOne PowerQuery', 'PowerQuery'],
  ])('offers %s and saves the generated draft as %s', async (label, canonical) => {
    const query = "tgt.process.cmdline contains '-enc'";
    vi.mocked(generateAIJSON).mockResolvedValue({ query, explanation: 'Generated detection' });
    const createDraft = vi.fn();
    render(<AIQueryGenerator onCreateDraft={createDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Splunk SPL' }));
    fireEvent.click(screen.getByRole('button', { name: label }));
    submit('Detect encoded PowerShell execution');
    await screen.findByText('Generated detection');
    expect(vi.mocked(generateAIJSON).mock.calls[0][0].prompt).toContain(`Generate a ${label} detection query:`);
    fireEvent.click(screen.getByTitle('Create Draft'));
    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          queryLanguage: canonical,
          detectionQuery: query,
          queries: [expect.objectContaining({ language: canonical, query })],
        }),
      ),
    );
  });
});
