/**
 * ContextManager 简体中文。
 *
 * 语言文件只带它翻译过的键，不带别的：它的类型是 `PartialTexts`，没写的部分会逐行
 * 回退到英文，拼错的键是编译错误，而不是屏幕上的一处空白。
 *
 * 要敲的东西不翻译：命令名和它的子命令（`check`、`fix`、`ignore`、`debug`、`reset`）
 * 不变，模型与存储之间往返的标识符也不变 —— `id` 里的类别、证据句柄、签名。只有要读的
 * 部分会变。
 *
 * 一个汉字在终端里占两格，所以这里的标签要短：面板的标签栏只有十格宽。
 */

import type { PartialTexts } from './en'

/**
 * 简体中文。
 */
export const ZH_CN: PartialTexts = {
  pane: {
    awaiting: '等待第一轮',
    contextUsed: share => `已用 ${share} 上下文`,
    toCompaction: tokens => `距压缩还有 ${tokens} tokens`,
    toCompactionShort: tokens => `距压缩 ${tokens}`,
    turnsLeft: turns => `约 ${turns} 轮`,

    judge: '审计 ',
    judgeRuns: runs => `${runs} 次`,
    judgeTokens: amount => `${amount} tokens`,

    saved: '已省 ',
    checkNow: '检查',
    checking: '检查中…',
    checkingLong: '正在检查本次会话…通常 10–20 秒',

    time: '时间',
    context: '上下文',
    timeLead: '在工具中',
    timeUnmeasured: '未测量',
    contextLead: '来自工具',
    nothingYet: '暂无明显问题',

    empty: '静默监视中。暂未发现重复。',

    fix: '修正',
    fixNote: '修正…',
    ignore: '忽略',
    info: 'i',

    hits: times => `${times}×`,
    costShare: percent => `~${percent}% 上下文`,
    turnAt: turn => `第 ${turn} 轮`,
    turnRange: (first, last) => `第 ${first}–${last} 轮`,
    // 英文两处都说 “ignored”：一处是你自己划掉的卡片，一处是 Claude 没照做的指令。
    // 中文把两者分开，跟法语和德语一样。
    ignored: kind => `未采纳 · ${kind}`,

    why: '原因',
    fixLabel: '修正',
    callCount: calls => `${calls} 次调用`,
    turnCount: turns => `${turns} 轮`,
    agentCount: agents => `${agents} 个代理`,
    perTurn: tokens => `每轮约 ${tokens} tokens`,
    charsOfContext: chars => `${chars} 字符上下文`,

    turnCell: turn => `第 ${turn} 轮`,
    charsUnit: ' 字符',
    answerSize: chars => `${chars} 回复`,
    loop: '代理',
    loopCost: (ktokens, edits) => `${ktokens}k tokens · ${edits} 次编辑`,

    steerHint: 'Enter 发送 · 再按修正… 关闭 · 或 /manager fix <n> <文本>',
    send: '发送',

    decided: '已决定',
    decidedWord: { keep: '已忽略', steer: '已按备注修正', kill: '已修正' },
    savedCredit: percent => `已省 ~${percent}%`,
    perRepeat: percent => `每次重复 ~${percent}%`,
    ignoredTimes: times => `未采纳 ${times}×`,

    rules: '下次会话的规则',
    artifact: {
      'claude-md': 'CLAUDE.md',
      skill: 'skill',
      'agent-brief': '代理简介',
      'settings-allow': '权限规则',
    },
    write: '写入',
    tryOnce: '试用',
    skip: '跳过',

    decidedCount: decided => `已决定 ${decided}`,
    rulesCount: rules => `规则 ${rules}`,
    fullPane: '/manager 打开完整面板',

    verbsHint: '/manager fix|ignore <n>',
    keysFocus: 'ctrl+x tab 将键盘交给本面板',
    keysMove: 'Tab 切换',
    keysPress: 'Enter 按下',
    keysBack: 'Esc 交还键盘',
  },

  band: {
    died: how => `上一轮以${how}结束`,
    diedError: 'API 错误',
    diedRefusal: '拒绝',
    diedContinue: '输入任意内容继续',

    checking: '正在检查本次会话…',

    foundWorthLook: cards => `发现 ${cards} 处值得一看`,
    foundSavingBoth: (cards, share, time) => `发现 ${cards} 处可省 ${share} 和 ${time}`,
    foundSaving: (cards, saving) => `发现 ${cards} 处可省 ${saving}`,
    foundShort: cards => `发现 ${cards} 处浪费`,
    costShare: percent => `${percent >= 1 ? `~${Math.round(percent)}%` : '不足 1%'}的上下文`,

    saved: '已省 ',
    ofContext: ' 上下文',
    thisSession: '（本次会话）',

    running: '运行中',
    agentCount: agents => `${agents} 个代理`,
    callCount: calls => `${calls} 次调用`,

    watching: '监视中',
    watched: calls => `已监视 ${calls} 次调用`,
    quiet: '暂无浪费',

    open: '打开',
    close: '关闭',
  },

  command: {
    description: 'ContextManager：显示或隐藏面板 · check | fix [n] [文本] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset',
    argumentHint: '[check | fix [n] [文本] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]',

    usage: '用法：/manager [check | fix [n] [文本] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]',
    fixUsage: '用法：/manager fix [n] [指令]（开头的数字指面板编号的卡片；不带数字时取修正…输入框已打开的卡片，否则取第 1 张）',
    paneShown: 'ContextManager 面板已显示',
    paneHidden: 'ContextManager 面板已隐藏',
    nothingToDecide: 'ContextManager：没有待决定的项',
    reset: 'ContextManager：会话状态已重置',
    demoLoaded: 'ContextManager：已载入演示卡片',

    checking: 'ContextManager：正在检查本次会话的浪费…',
    alreadyChecking: 'ContextManager：已在检查中',
    nothingNew: 'ContextManager：没有新发现',
    found: cards => `ContextManager：发现 ${cards} 处新浪费`,
    checkFailed: failure => `ContextManager：检查失败 — ${failure}`,
    notCheckedYet: failure => `ContextManager：暂时无法检查 — ${failure}`,

    card: (seat, kind, outcome) => `ContextManager：卡片 ${seat} —「${kind}」· ${outcome}`,
    noCard: (seat, cards) => `ContextManager：没有第 ${seat} 张卡片（1–${cards}）`,
    outcomeIgnored: '已忽略',
    outcomeFixed: '已修正',
    outcomeNoted: text => `已按你的备注修正：${text}`,

    toastIgnored: kind => `ContextManager：已忽略「${kind}」`,
    toastFixed: alternative => `ContextManager：已修正 — ${alternative}`,
    toastNoted: instruction => `ContextManager：已按你的备注修正 — ${instruction}`,
    writeFirst: 'ContextManager：请先写下指令',

    savedToast: figures => `节省了 ${figures} 上下文`,

    wrote: path => `已写入 ${path}`,
    trying: title => `本次会话试用「${title}」`,

    composerHasKeys: seat => `ContextManager：键盘在输入框中 — 请输入 /manager fix ${seat} <你的备注>`,
  },

  categories: {
    execution: '执行',
    reading: '读取',
    production: '产出',
    behavior: '行为',
    communication: '沟通',
    'multi-agent': '多代理',
    environment: '环境',
    process: '流程',
    other: '其他',
  },

  judge: {
    // 故意用英文写：这是接在英文 prompt 末尾的一段，只给模型看。用 prompt 自己的语言写的
    // 指令最容易被照做；它要求的内容，才是中文。
    directive: `## Language — write the reply's prose in Simplified Chinese
The rules and the blocks above are in English because that is this prompt's language; your reply's prose is not. Write \`kind\`, \`why\`, \`alternative\`, \`time\`, \`context\` and any \`proposal\` \`title\` and \`body\` in Simplified Chinese, in the plain words of the work, and keep the brevity the caps ask for — they count characters, and a Chinese character says more than a Latin one, so the sentences should be shorter still. \`kind\` starts exactly with \`Claude 反复\` in place of \`Claude keeps \` — one space after \`Claude\`, none after \`反复\`, as in \`Claude 反复在每次单文件编辑后运行整个测试套件\`: the examples above show the English opening because they were written for it.
Everything a machine matches is never translated and stays exactly as specified above: the JSON keys, the \`id\` and its kebab slug, the nine \`category\` names, the evidence handles (\`r12\`, \`turn:7\`, \`agent:a3\`), the \`signature\` \`tool\` and \`key\` copied character-for-character from a LEDGER row, and the \`proposal\` \`kind\`. A translated one discards the finding whole.`,
    kindPrefix: 'Claude 反复',
    instruction: text => `用户指令（经由 ContextManager）：${text}`,
    kill: (kind, alternative) => `本次会话剩余时间内停止此行为：${kind}。从现在起：${alternative}`,
  },

  detect: {
    rereadKind: path => `Claude 反复读取 ${path}，而其间文件没有任何变化`,
    rereadWhy: times => `读取了 ${times} 次，两次读取之间没有任何可能改动该文件的编辑、安装或格式化。`,
    rereadFix: path => `沿用你已读到的 ${path} 内容；只在它变化后再读，而且只读需要的行。`,
    fullSuiteKind: command => `Claude 反复在只改一个文件后运行整个 \`${command}\` 测试套件`,
    fullSuiteWhy: times => `完整运行了 ${times} 次，每次都紧跟在只改一个文件之后；首次运行和提交前的那次不计在内。`,
    fullSuiteFix: '只运行覆盖所改文件的测试，阶段结束时再完整运行一次测试套件。',
    fullSuiteRuleTitle: '定向测试',
    fullSuiteRule: '只运行覆盖所改文件的测试；每个阶段结束时完整运行一次测试套件。',
    sameSearchKind: search => `Claude 反复执行同一个搜索：${search}`,
    sameSearchWhy: times => `相同的搜索执行了 ${times} 次，其间没有任何编辑，每次找到的都和上一次一样。`,
    sameSearchFix: '复用已经做过的搜索结果；只在文件变化后再搜索。',
    logDumpKind: command => `Claude 反复用 \`${command}\` 输出整份日志`,
    logDumpWhy: (times, chars) => `运行了 ${times} 次，每次至少 ${chars} 个字符，整份读取而没有过滤。`,
    logDumpFix: "读日志前先过滤：用 grep -nE 'ERROR|FAIL|Traceback' 和 tail -n 50 处理。",
    logDumpRuleTitle: '过滤日志',
    logDumpRule: "读日志前先过滤（grep -nE 'ERROR|FAIL|Traceback'，tail -n 50）；不要读取整份日志。",
    prefixKind: {
      model: 'Claude 反复在会话中途切换模型，每次切换都会重写提示缓存',
      effort: 'Claude 反复在会话中途切换 effort 级别，每次切换都会重写提示缓存',
    },
    prefixWhy: (times, turns, tokens) =>
      `切换了 ${times} 次（第 ${turns} 轮）${tokens === null ? '' : `；紧随其后的步骤比普通步骤多写入缓存约 ${tokens} 个 token`}。`,
    prefixFix: '本次会话剩余时间内保持同一个模型和同一个 effort 级别；在会话之间或 /compact 之后再切换。',
  },

  config: {
    languageLabel: '语言',
    languageAvailable: tags => `可用：${tags.join('、')}。`,
  },
}
