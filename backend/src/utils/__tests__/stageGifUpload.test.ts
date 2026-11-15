import { describe, expect, it } from '@jest/globals';
import { isAcceptedContent } from '../fileUtils';

describe('animated Stage GIFs stored as MAP assets', () => {
  it('accepts genuine GIF signatures normalized to a matching extension', () => {
    expect(isAcceptedContent('MAP', { mime: 'image/gif', ext: 'gif' })).toBe(true);
  });

  it('continues rejecting fake scripts and mismatched extensions', () => {
    expect(isAcceptedContent('MAP', { mime: 'application/javascript', ext: 'gif' })).toBe(false);
    expect(isAcceptedContent('MAP', { mime: 'image/gif', ext: 'js' })).toBe(false);
    expect(isAcceptedContent('MAP', { mime: 'image/png', ext: 'gif' })).toBe(false);
  });
});
