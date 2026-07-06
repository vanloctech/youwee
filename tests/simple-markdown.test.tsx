import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimpleMarkdown } from '../src/components/ui/simple-markdown';

describe('SimpleMarkdown', () => {
  test('preserves ordered list numbers across blank-line separated list blocks', () => {
    const html = renderToStaticMarkup(
      <SimpleMarkdown
        content={[
          '1. First topic',
          '   - First detail',
          '',
          '2. Second topic',
          '   - Second detail',
          '',
          '3. Third topic',
        ].join('\n')}
      />,
    );

    expect(html).toContain('<ol');
    expect(html).toContain('start="2"');
    expect(html).toContain('start="3"');
  });

  test('renders markdown horizontal rules as dividers', () => {
    const html = renderToStaticMarkup(
      <SimpleMarkdown content={['Opening section', '---', 'Next section', '------'].join('\n')} />,
    );

    expect(html).toContain('<hr');
    expect(html).toContain('bg-gradient-to-r');
    expect(html).not.toContain('>---<');
    expect(html).not.toContain('>------<');
  });
});
