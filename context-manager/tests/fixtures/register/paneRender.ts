import type { RenderInput } from 'claude-code'

/**
 * The ContextManager pane docked on a wide terminal, 80 columns of body and 30 rows in view.
 *
 * @param requestId which pane is drawn ('manager' is ours)
 */
export const paneRender = (requestId = 'manager'): RenderInput<'Pane'> => ({
  component: 'Pane',
  surface: 'terminal',
  requestId,
  viewport: { columns: 160, rows: 40 },
  props: { title: 'ContextManager', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
})
