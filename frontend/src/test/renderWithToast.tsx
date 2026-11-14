import type { ReactElement, ReactNode } from 'react';
import { render as testingRender, type RenderOptions } from '@testing-library/react';
import { ToastProvider } from '@/contexts/ToastContext';

export * from '@testing-library/react';

/** Render a component under the same toast context the application provides. */
export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return testingRender(ui, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });
}
