import type { CommandRunInput } from 'claude-code'

/**
 * `/manager <args>` typed at the composer on an 80-column main screen.
 *
 * @param args everything after the command's name
 */
export const managerRun = (args = ''): CommandRunInput => ({
  command: 'manager',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
})
