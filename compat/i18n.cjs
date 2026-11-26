// Shared, serializable translations and quota presentation for both renderers.
module.exports = function createDashboardI18n(initialLanguage) {
  const dictionary={
    en:{
      collectionBackgroundFailed:'Background collection could not finish. It will retry later.',collectionProcessing:'Completing statistics',collectionProcessingReason:'Processing in the background. You can keep working.',collectionProgress:'Processing details',collectionProgressCounts:'Processed {steps} steps · {requests} request records',collectionQueued:'Queued',collectionSteps:'Reading steps',collectionGenerators:'Reading request records',collectionReducing:'Calculating statistics',collectionPublishing:'Saving verified statistics',
      collectionLimited:'Statistics limited',collectionSaved:'Last complete statistics',collectionSavedAt:'Last complete statistics · {time}',collectionReason:'This conversation exceeds the collection limit.',collectionDetails:'View reason',collectionDocs:'About collection limits',collectionProjected:'Serialized statistics',collectionRetained:'Retained-field estimate',collectionField:'Statistics field length',collectionObserved:'Observed at least {observed} / limit {limit}',collectionCharacters:'{n} characters',collectionUnavailable:'Statistics unavailable',collectionNoPartial:'The incomplete read was discarded.',
      tokenPartial:'Known tokens only (≥): {input} requests lack input usage; {output} lack output usage. Output is counted independently of cache availability.',
      tokenLegacy:'Saved token usage is a lower bound (≥); request-level coverage cannot be verified.',unknownCoverage:'unknown',
      cacheZeroInput:'Reported total input is 0; the cache hit rate has no denominator.',
      savedCache:'Cache ratio uses saved statistics ({time}).',savedSpeed:'Speed uses saved statistics ({time}).',
      panelSpeed:'Speed',panelCache:'Token · Cache',panelQuota:'Quota',panelContext:'Context',panelDetails:'Metric details',panelUsed:'used',panelSharedQuota:'Quota',argonWeek:'Argon weekly quota',routeOrchSwitched:'Dual · {n}×',routeOrchActive:'Dual',routeSwarm:'Swarm · {n}',
      newConversationStats:'New conversation: send a message or open an existing conversation to view its statistics. Account quota is shown separately below.',
      subagentStats:'Current subagent statistics',accountQuota:'Account quota, shared across agents.',
      taskOwn:'Current agent',taskSubagents:'Subagents ({n})',taskLoading:'Summing subagents…',taskPartial:'Some subagents unavailable',taskCurrentOnly:'Current agent only; subagent statistics unavailable.',
      transcriptTitle:'Recorded text estimate',transcriptUser:'User text',transcriptAssistant:'Replies + thinking',transcriptTool:'Tool output',transcriptSystem:'System text',transcriptMarkers:'Compaction markers',transcriptImages:'Image-generation steps',transcriptPartial:'partial',transcriptLoading:'Loading…',transcriptUnavailable:'Unavailable',transcriptSaved:'saved',transcriptBasis:'Estimated logged text, not active context or billed usage. Hidden prompts, media and tool-call arguments are excluded.',
      contextHostLimit:'Active window (host)',contextProviderCapacity:'Provider capacity reference',contextCompressionLimit:'Compaction threshold',contextLimitUnknown:'Unknown',contextReferenceBasis:'Provider specification; not this session\'s available capacity.',
      contextCompactions:'Compactions',contextCompactionCount:'{n}× compacted',contextCompactionSummary:'{n}× compacted',contextCompactionsTitle:'Context compactions recorded in this conversation: {n}',compactionMetricsBasis:'Counted from compaction/checkpoint steps in the conversation trajectory. Compaction is driven by cumulative context tokens, not turn count (a single turn may contain many steps).',trendPeakShare:'▲ {pct}% of window',trendPeakTrigger:'threshold-triggered peak',
      contextCompactBtn:'Compact',contextCompactBtnTitle:'Run /compact to compress conversation context',contextCompactDraftTitle:'Clear or send your draft before compacting',contextCompacting:'Compacting…',contextCompactingChip:'Compacting',
      contextTurnsCount:'{n} turns',contextTurnsSteps:'{rounds} turns · {steps} steps',contextTurnsTitle:'{rounds} user turns · {steps} trajectory steps (replies, tools, commands, compactions)',contextChipRounds:'· {n}T',
      stepBreakdownTitle:'Step breakdown · {n} steps',stepBucketUser:'User input',stepBucketPlanner:'Model replies',stepBucketTool:'Tools & commands',stepBucketCompaction:'Compactions',stepBucketOther:'Other',stepBreakdownHint:'Click to toggle step breakdown',
      context:'Context window',contextShort:'Ctx',contextUsed:'{used}% used',contextTokens:'{used} / {max} toks',contextUnknown:'Context capacity unavailable',contextUnavailable:'Context statistics are unavailable for this request.',contextBasis:'Settled request usage or host stream count, falling back to request-start estimate; not cumulative tokens.',contextModel:'Sampled model',contextLimit:'Window capacity',contextUsage:'Used tokens (estimate)',contextSaved:'Showing saved context statistics ({time}).',contextExceeded:'The host estimate exceeds the reported capacity.',contextOverWindow:'Exceeds active window ({raw}%); compaction pending',
      compositionTitle:'Context composition',compositionCustomization:'Prompt config',compositionCustomizationValue:'Config {tokens}',compositionUser:'User messages',compositionThinking:'Assistant thinking',compositionReply:'Assistant replies',compositionAssistant:'Assistant (thinking + replies)',compositionTool:'Tool results',compositionSystem:'System text',compositionOther:'Other context',compositionRemaining:'Remaining space',compositionSourceSteps:'per-step usage buckets',compositionSourceTranscript:'logged text estimate',compositionSourceHybrid:'steps + logged text',compositionSourceHost:'host 8-category breakdown',compositionBasis:'Dynamic segments are estimates scaled to the host-reported used tokens ({source}); the config total is exact from the host token base.',
      compositionSystemPrompt:'System prompt',compositionMcpTools:'MCP tools',compositionSubagents:'Subagents',compositionSkills:'Skills',compositionPlugins:'Plugins',compositionRules:'Rules',compositionTools:'Tools',compositionChatMessages:'Chat messages',
      compositionViewList:'List',compositionViewBar:'Bar',compositionViewToggle:'Composition view',compositionGroupRules:'Rules',compositionGroupSkills:'Skills',compositionGroupSubagents:'Subagents',compositionGroupMcpTools:'MCP tools',compositionExactTag:'exact',compositionEstimateTag:'estimate',compositionWindowShare:'{pct}% of window',avgCacheHitRate:'Avg cache hit rate',
      tokenBaseDrilldown:'Rules & skills config',tokenBaseCustomBudget:'Total config budget',tokenBaseRulesBudget:'Rules budget',tokenBaseEmpty:'No loaded config entries reported.',drilldownShowMore:'Show {n} more',drilldownShowLess:'Show less',
      trendTitle:'Context trend',trendBasis:'Per-request input tokens (uncached + cache read + cache write); dashed lines mark compaction/checkpoint events.',trendSample:'{n} requests',trendCompaction:'Compaction',trendCheckpoint:'Checkpoint',trendModeToggle:'Trend mode',trendModeTotal:'Total',trendModeDelta:'Delta',trendReclaimed:'-{tokens} reclaimed',
      panelViewSwitch:'Panel view',panelViewSession:'Session',panelViewActivity:'Daily/Weekly',panelViewModels:'By model',panelViewInsights:'Insights',panelResetSession:'Return to active session',
      usageToday:'Today',usageMonth:'This month',usageViewActivity:'Daily/Weekly',usageViewModels:'By model',
      auditButton:'Audit',auditTitle:'Session audit',auditTabFiles:'Files',auditTabCommands:'Commands',auditTabSteps:'Steps',auditLoading:'Loading session audit…',auditUnavailable:'Session audit unavailable.',auditEmptyFiles:'No file activity recorded.',auditEmptyCommands:'No command executions recorded.',auditEmptySteps:'No steps recorded.',
      auditFilterAll:'All',auditFilterThinking:'Thinking',auditFilterTools:'Tools',auditFilterAnswer:'Answer',auditFilterUser:'User',
      auditOpRead:'Read',auditOpEdit:'Edit',auditOpWrite:'Write',auditOpSearch:'Search',auditStepRef:'Step #{n}',auditExitCode:'exit {code}',auditRunning:'running',
      creditsLabel:'Credits',creditsPrompt:'Prompt credits',creditsFlow:'Flow credits',creditsBadge:'{prompt}P · {flow}F',estimatedCostLabel:'Estimated cost',estimatedBadge:'Estimated',estimatedCostTitle:'Approximate public pricing estimate; not an official invoice.',
      insightsAll:'All',insightsActive:'Active',insightsArchived:'Archived',insightsSortRecent:'Recent',insightsSortTokens:'Total tokens',insightsSortContext:'Context size',insightsSortCost:'Estimated cost',insightsSearchPlaceholder:'Filter sessions…',insightsScan:'Rescan',insightsScanning:'Scanning local sessions…',
      insightsKpiSessions:'Sessions',insightsKpiSessionsSub:'{active} active · {archived} archived',insightsKpiTokens:'Total tokens',insightsKpiRoundsSub:'{n} turns',insightsKpiCost:'Est. cost',insightsKpiPricedSub:'priced {priced}/{total}',insightsKpiCache:'Cache hit',insightsKpiTools:'Tool calls',insightsKpiDuration:'Active time',insightsKpiCallsSub:'{n} model calls',
      insights7dTitle:'Last 7 days',insightsHeatmapTitle:'Activity heatmap',insightsHeatmapSessions:'Sessions',insightsHeatmapTokens:'Tokens',insightsHeatmapLess:'Less',insightsHeatmapMore:'More',insightsHeatmapSummary:'Active {days}d · Streak {streak}d · Peak {peak}',insightsHeatmapPeakSessions:'{n} sess',insightsHeatmapTip:'{date} · {sessions} sess · {tokens} tok',insightsHeatmapClearDate:'{date} ×',insightsEmptyDate:'No sessions recorded on {date}.',insightsWeekdays:'M,,W,,F,,',insightsCompTitle:'Token composition',insightsProjects:'Projects',insightsSkills:'Skills loaded',insightsTools:'Tools invoked',insightsCommands:'Commands run',insightsSessionsTitle:'Sessions ({n})',insightsEmpty:'No local sessions found.',insightsCacheMeta:'{total} sessions · {ms}ms',
      savedStats:'Showing saved conversation statistics ({time}).',saveFailed:'Statistics could not be saved locally.',
      strip:'Antigravity Dashboard statistics',session:'Session statistics',cache:'Cache hit',cacheTitle:'Token usage',five:'Five-hour quota',week:'Weekly quota',weekShort:'Wk',
      modelTime:'Model time',toolTime:'Tool time',ttft:'Session P50 TTFT',ttftShort:'TTFT (P50 / Last)',ttftBasis:'TTFT (time to first streamed token; some 3p models may buffer thinking) · Session P50: {p50} · Latest: {latest}',latestSpeed:'Latest decode',latestSpeedTip:'Streaming decode speed of the latest qualified request (total output including thinking ÷ streaming time; excludes < 1s or < 30 output token short windows).',shortSpeedTip:'Short sample ({tokens} tok / {dur}), excluded from decode avg & peak (< 1s or < 30 output tokens).',bufferedSpeedTip:'Buffered burst ({tokens} tok flushed in {dur}), excluded from decode avg & peak.',latestTipE2e:' · E2E {e2e} tok/s',latestTipPrev:' · Prior qualified {prev} tok/s',shortSublineRef:'{tokens} tok · {dur} · prior {prev} tok/s',shortSubline:'{tokens} tok · {dur} · excluded',bufferedSublineE2e:'{tokens} tok · {dur} · E2E {e2e} tok/s',sessionAvg:'Session decode',e2eSpeed:'E2E speed',e2eShort:'E2E',e2eBasis:'End-to-end effective speed: total output tokens ÷ (TTFT + streaming time) across qualified requests.',peakSpeed:'Peak decode',peakBasis:'Peak streaming decode speed across qualified requests (excludes < 1s or < 30 output token bursts).',basisShortResponse:'Response only',basisShortAll:'Output + thinking',sessionTps:'Session decode TPS',latest:'Last request',tokens:'Response / thinking',remaining:'remaining',
      resetIn:'Resets in',resetTime:'Reset time (UTC+8)',group:'Quota group',selectGroup:'Select quota group',refresh:'Refresh quota',refreshStats:'Refresh statistics',refreshing:'Refreshing…',
      speedStyle:'Speed card style',styleMinimal:'Minimal',styleCat:'Pixel cat',styleSaveFailed:'Style could not be saved. Try again.',outlookOk:'Comfortable',outlookTight:'Tight',outlookExhaust:'Runs out early',paceIdle:'Unused',forecastLeft:'~{pct} left at reset',forecastDepletes:'Runs out in ~{eta}, {early} before reset',forecastWarming:'Used {pct} · warming up',forecastBasis:'{remaining} quota left · {time} of the window left · linear projection from this window\'s average usage',forecastBasisWork:'{remaining} quota left · {time} of the window left · projected from today\'s active conversation time ({hours}h)',
      waiting:'Waiting for refresh',connecting:'Connecting to Antigravity…',waitingApp:'Waiting for Antigravity',waitingModel:'Waiting for a model request',waitingRequest:'No requests yet',
      hover:'Hover over the strip for details',autoConnect:'Open the app to connect automatically',loadingQuota:'Loading quota…',unavailableQuota:'Quota unavailable',
      live:'Connected to Antigravity Dashboard',stale:'Showing last available quota',offline:'Antigravity Dashboard is offline',
      responseBasis:'Streaming decode speed: response tokens ÷ streaming time (output total unavailable); session TPS is time-weighted.',allBasis:'Streaming decode speed: total output tokens (including thinking) ÷ streaming time; session TPS is token-weighted.',
      missingTime:'{n} requests lack timing and are excluded from TPS.',shortSample:'Last request is excluded (< 1s or < 30 output tokens); its rate is quarantined.',running:'Generating; showing completed requests.',
      timingShort:'Short sample',timingBuffered:'Buffered burst',timingUnreliable:'Timing uncertain',ratePending:'Awaiting recalculation',excludedTime:'{n} requests with uncertain timing are excluded from TPS.',rateWarning:'Another {n} short or unusually fast samples remain included in TPS; their rates may fluctuate.',rateWarningOnly:'{n} short or unusually fast samples remain included in TPS; their rates may fluctuate.',rateReasons:'Reason: {reasons}.',rateReasonCount:'{reason}: {n} requests',rateUsageRetained:'Token and cache usage is still retained in full.',legacyRate:'Saved TPS uses the old calculation. Reopen this conversation while connected to recalculate.',
      reasonToken:'Token scope mismatch',reasonDuplicate:'Conflicting request records',reasonRetry:'Retry/token timing scope uncertain',reasonTool:'Short tool-only timing window',reasonBurst:'Buffered burst after long wait',reasonOutlier:'Short sample far above same-model baseline',reasonShortWindow:'Short window or low output (< 1s or < 30 output tokens)',reasonNonfinite:'Invalid calculated rate',
      sample:'{rounds} turns · {steps} steps · {requests} samples',sampleCount:'{n} samples',rounds:'{rounds} turns {steps} steps ·',
      noQuota:'This account did not return this quota window.',disabledQuota:'This quota window is disabled.',noFraction:'The account did not return a remaining fraction.',
      sharedQuota:'Models in this group share quota.',quotaSource:'Balances and reset times come from the account API.',updated:'Updated {time}',health:'Quota updated {time} · actual request metrics',firstUpdate:'Waiting for the first update',
      cacheRate:'Cache hit',cacheHitRateColon:'Cache hit rate:',cacheRead:'Cache read',cacheInput:'Total input',cacheMiss:'Uncached input',cacheWrite:'Cache write',cacheOutput:'Output',
      cacheBasis:'Cached input ÷ total input, weighted across requests. Cache writes are not hits.',cacheMissing:'{n} requests have unavailable cache statistics.',cacheUnavailable:'Cache statistics are unavailable for this conversation.',
      cacheCoverage:'{measured} of {total} requests',language:'Language',dashboardLanguage:'Dashboard language',switchLanguage:'Switch to Chinese',languageSaveFailed:'Language preference could not be saved. Please retry.',checkUpdate:'Check for updates',reconnecting:'Waiting to reconnect',panelUnavailable:'The statistics panel cannot connect right now.',invalidData:'Incompatible statistics data',
      usageScopeLocal:'All local',usageScopeAccount:'Current account',quotaWindowUsage:'Window tokens',quotaWindowFullRef:'~{full} full',quotaWindowBasis:'Recorded local tokens for this account in this quota window; estimated full capacity is a proportional reference only (weighting varies by model and cache).',
      quotaRingTitle:'Remaining quota',quotaRingUnknown:'Balance unknown',quotaDisplay:'Quota display',quotaDisplayBoth:'Two numbers',quotaDisplayAuto:'Auto',quotaDisplayCompact:'Dot',quotaDisplayWeekly:'Weekly',quotaDisplaySaveFailed:'Display setting could not be saved. Try again.',
      inlineReconnecting:'Inline widget is reconnecting automatically; statistics remain available in this panel.',panelInlineReconnecting:'Inline widget is reconnecting automatically; statistics remain available in this panel.',panelDebugPortReady:'Host started without remote debugging (launch shortcut configured); fully quit and reopen Antigravity for the inline bar. Statistics remain available here.',panelDebugPortManual:'Antigravity 2.33+ requires --remote-debugging-port=0 --remote-debugging-address=127.0.0.1 (or python3 manage.py launch) for the inline bar; statistics remain available here.',missingDebugPort:'Antigravity started without a debug port. Relaunch to restore the inline status bar.',relaunchDebugButton:'Relaunch with Debug Port',relaunchingDebug:'Relaunching Antigravity…',relaunchDebugFailed:'Could not relaunch automatically. Use the Antigravity (Debug) launcher.',relaunchDebugCooldown:'Relaunch already requested; waiting for Antigravity to restart.',relaunchDebugNotRunning:'Antigravity is not running right now.',autoRelaunchLabel:'Auto-relaunch when debug port is missing (e.g. after app update)',autoRelaunchSaveFailed:'Auto-relaunch setting could not be saved.',
      poolGemini:'Gemini',pool3p:'Claude / 3p',poolLocal:'Local / BYOM',poolOther:'Other',poolRollup:'Quota pools',
      multiAgentDetails:'Multi-agent & model breakdown',sessionRoleLabel:'Agent role',roleCoordinator:'Coordinator',roleWorker:'Worker',roleMonitor:'Monitor',roleSidecar:'Scheduled sidecar',
      orchestrationOverhead:'Orchestration',workerExecution:'Workers',cacheMissSurge:'{n} cache-miss surge ({tokens})',
      contextBreakdown:'Context & tool breakdown',breakdownUser:'User',breakdownReply:'Reply',breakdownThinking:'Thinking',breakdownTools:'Tool results',breakdownToolCalls:'Tool args',breakdownSystem:'System',
      topTools:'Heavy tool calls',bloatBadge:'{n} bloat',bloatWarningLine:'{tool} #{step}: {tokens}',bloatHint:'Single payload >= 20K (critical >= 50K)',
      hostUiLocalization:'Host UI Chinese',hostUiLocalizationHint:'Translate Antigravity desktop UI labels into Simplified Chinese (restart-free)',hostUiLocalizationOn:'On',hostUiLocalizationOff:'Off',hostUiLocalizationSaveFailed:'Host localization setting could not be saved. Try again.',hostUiLocalizationEnableAction:'Enable Host UI Chinese',hostUiLocalizationDisableAction:'Disable Host UI Chinese',
      inlineCacheHit:'Inline cache hit',inlineCacheHitOn:'On',inlineCacheHitOff:'Off',inlineCacheHitSaveFailed:'Display setting could not be saved. Try again.',
      cacheChipMode:'Cache display',cacheChipModeTokens:'Tokens',cacheChipModeBoth:'Both',cacheChipModeHit:'Hit rate',cacheChipModeSaveFailed:'Cache display could not be saved. Try again.',
      taskSwarm:'Swarm ({n} members)',swarmDetails:'Swarm & models',swarmRoster:'Swarm roster',swarmShowAll:'Show all {n}',swarmShowLess:'Collapse',swarmStatusKilled:'Ended',swarmStatusActive:'Active',swarmStatusAll:'All',
      orchSplitTitle:'Orchestrator split',orchCardTitle:'Orchestrator · Single-session split',orchScopeHint:'Same session · Planner switches to Executor',orchSwitchCount:'{n}× switch',orchReadOnlyTag:'Plan only',swarmScopeHint:'Multi-session team · Independent worker chats',orchRolePlanner:'Planner',orchRoleExecutor:'Executor',orchConfiguredPair:'Configured: {planner} → {executor}',orchNoSwitchYet:'Read-only turn · no switch yet',orchColdStartNote:'{n}× switch cache cold-start',orchColdStartLabel:'Switch cold-starts',orchColdStartTip:'First request after switching to Executor had 0 cached tokens (different models do not share KV cache)',cacheMissSurgeLabel:'Large cache-miss surge',cacheMissSurgeTip:'Requests with 0 cached tokens and >= 100K uncached input (e.g. after compaction, model switch, or cache expiry)',reqCountShort:'{n} req',countTimes:'{n}×',
      insightsProjectsSubtotal:'{n} projects · {tokens} toks',insightsSkillsSubtotal:'{n} skills · {runs} runs',insightsToolsSubtotal:'{n} tools · {calls} calls',insightsCommandsSubtotal:'{n} cmds · {runs} runs',insightsUnitSessions:'{n} sess',insightsUnitRuns:'{n} runs',insightsUnitCalls:'{n} calls',
      barCustomize:'Customize',barCustomizeTitle:'Customize status bar',barReset:'Reset',barContextChipMode:'Context ring label',barContextModeRounds:'Turns',barContextModeLabel:'Label',barContextModeCompact:'Compact',barOrderLabel:'Visible chips & order',barKeepOneHint:'Keep at least 1 chip visible',barSaveFailed:'Status bar setting could not be saved. Try again.',barMoveUp:'Move up',barMoveDown:'Move down',barChipSpeed:'Speed',barChipCache:'Cache',barChipQuota:'Quota',barChipContext:'Context',barFooterMigrated:'Context chip is hidden — settings moved here so you can restore it anytime.',
      pulseSettings:'Settings',pulseSettingsTitle:'Antigravity Dashboard Settings',pulseSettingsSubtitle:'Bar colors · Appearance · Status bar modules',settingsSectionTheme:'Bar Colors & Appearance',settingsSectionBar:'Status Bar Modules',settingsSectionGeneral:'Display & Language',settingsMode:'Appearance',modeAuto:'Auto',modeLight:'Light',modeDark:'Dark',themeModeSaveFailed:'Appearance mode could not be saved. Try again.',barColorSpeed:'Speed (tok/s)',barColorToken:'Tokens',barColorQuota:'Quota ring',barColorContext:'Context ring',barColorCacheHit:'Hit rate',barColorCacheHitHigh:'Hit ≥90%',barColorCacheHitMid:'Hit 80–89%',barColorCacheHitLow:'Hit 70–79%',barColorCacheHitCold:'Hit <70%',barColorDefault:'Default',barColorPick:'Custom color',barColorsSaveFailed:'Bar color could not be saved. Try again.',cacheHitToneLabel:'High hit-rate color (≥70%)',cacheHitToneAccent:'Accent (Blue)',cacheHitToneSemantic:'Green (≥70%)',cacheHitToneSaveFailed:'Color setting could not be saved. Try again.',cacheHitTiersLabel:'Hit-rate color mode',cacheHitTiersFixed:'Fixed',cacheHitTiersAuto:'Auto tiers',cacheHitTiersHint:'Auto tiers: ≥90% High · 80–89% Mid · 70–79% Low · <70% Cold (Muted)',cacheHitTiersSaveFailed:'Hit-rate mode could not be saved. Try again.',settingsBack:'Back',settingsClose:'Close',
      remoteFallbackUnconfigured:'Remote SSH ({host}): inline bar shows shared quota only. Open Antigravity Dashboard in the right sidebar for remote session stats, or configure SSH port forwarding in settings.json.',remoteFallbackUnreachable:'Remote SSH ({host}): remote bridge unreachable — showing shared quota only. Check SSH port forwarding or use the right sidebar.',remoteConnectedBadge:'SSH · {host}',remoteQuotaTitle:'Remote SSH ({host}) · Shared quota',
      stripMode:'Inline bar display',stripFull:'Full bar',stripMinimal:'Minimal bar',stripCollapse:'Collapse to minimal bar',stripExpand:'Expand full bar',stripModeSaveFailed:'Display mode could not be saved. Try again.',
      barPlacement:'Bar placement',barPlacementInline:'Inline',barPlacementFooter:'Bottom row',barPlacementSaveFailed:'Bar placement could not be saved. Try again.',
      turnFooter:'Per-turn reply footer',turnFooterOn:'On',turnFooterOff:'Off',turnFooterSaveFailed:'Reply footer setting could not be saved. Try again.',turnFooterIn:'In',turnFooterOut:'Out',turnFooterCache:'Cache',turnFooterSpeed:'Avg',
    },
    'zh-CN':{
      collectionBackgroundFailed:'后台暂时无法完成，稍后会自动重试。',collectionProcessing:'正在补全统计',collectionProcessingReason:'后台处理中，可继续使用。',collectionProgress:'查看进度',collectionProgressCounts:'已处理 {steps} 个步骤 · {requests} 条请求记录',collectionQueued:'等待处理',collectionSteps:'读取步骤',collectionGenerators:'读取请求记录',collectionReducing:'计算统计',collectionPublishing:'保存已校验统计',
      collectionLimited:'统计受限',collectionSaved:'上次完整统计',collectionSavedAt:'上次完整统计 · {time}',collectionReason:'此会话统计量超过采集限制。',collectionDetails:'查看原因',collectionDocs:'了解采集限制',collectionProjected:'序列化统计大小',collectionRetained:'解析保留量估算',collectionField:'统计字段长度',collectionObserved:'已观测至少 {observed} / 上限 {limit}',collectionCharacters:'{n} 字符',collectionUnavailable:'统计暂不可用',collectionNoPartial:'本次未完成的读取未计入统计。',
      tokenPartial:'仅统计已知 Token（≥）：{input} 次请求缺少输入用量，{output} 次缺少输出用量。输出独立于缓存统计。',
      tokenLegacy:'已保存 Token 用量为下界（≥）；无法确认逐请求统计覆盖情况。',unknownCoverage:'未知',
      cacheZeroInput:'报告的总输入为 0，缓存命中率无可计算的分母。',
      savedCache:'缓存率使用已保存统计（{time}）。',savedSpeed:'速度使用已保存统计（{time}）。',
      panelSpeed:'速度',panelCache:'Token · 缓存',panelQuota:'额度',panelContext:'上下文',panelDetails:'统计详情',panelUsed:'已用',panelSharedQuota:'额度',argonWeek:'Argon 周额度',routeOrchSwitched:'双模型 · 切{n}次',routeOrchActive:'双模型',routeSwarm:'Swarm · {n}',
      newConversationStats:'当前为新对话：发送消息或打开已有对话后显示该会话统计。账号额度在下方单独展示。',
      subagentStats:'当前子代理统计',accountQuota:'账号共享额度，所有代理共用。',
      taskOwn:'当前代理',taskSubagents:'子代理（{n}）',taskLoading:'正在汇总子代理…',taskPartial:'部分子代理暂不可读取',taskCurrentOnly:'仅当前代理；子代理统计暂不可用',
      transcriptTitle:'已记录文本估算',transcriptUser:'用户文本',transcriptAssistant:'回复与思考',transcriptTool:'工具输出',transcriptSystem:'系统文本',transcriptMarkers:'压缩标记记录',transcriptImages:'图像生成步骤',transcriptPartial:'不完整',transcriptLoading:'读取中…',transcriptUnavailable:'不可用',transcriptSaved:'已保存',transcriptBasis:'日志文本估算，非当前上下文或计费用量。不含隐藏提示、媒体和工具调用参数。',
      contextHostLimit:'当前窗口容量（宿主）',contextProviderCapacity:'供应商容量参考',contextCompressionLimit:'压缩触发阈值',contextLimitUnknown:'未知',contextReferenceBasis:'供应商规格参考，不代表当前会话可用容量。',
      contextCompactions:'已压缩',contextCompactionCount:'压缩 {n} 次',contextCompactionSummary:'已压缩 {n} 次',contextCompactionsTitle:'当前会话已记录的上下文压缩次数：{n} 次',compactionMetricsBasis:'按会话轨迹中的压缩/检查点步骤计数；压缩由累计上下文 token 驱动，与轮数不成比例（单轮可包含多个步骤）。',trendPeakShare:'▲ 占窗口 {pct}%',trendPeakTrigger:'阈值触发峰值',
      contextCompactBtn:'压缩',contextCompactBtnTitle:'点击向当前会话发送 /compact 压缩上下文',contextCompactDraftTitle:'输入框已有未发送内容，请先清空或发送后再压缩',contextCompacting:'压缩中…',contextCompactingChip:'压缩中',
      contextTurnsCount:'{n} 轮',contextTurnsSteps:'{rounds} 轮 · {steps} 步',contextTurnsTitle:'{rounds} 轮用户输入 · {steps} 个轨迹步骤（含模型回复、工具调用、命令与压缩等）',contextChipRounds:'· {n}轮',
      stepBreakdownTitle:'步数构成 · 共 {n} 步',stepBucketUser:'用户输入',stepBucketPlanner:'模型回复/思考',stepBucketTool:'工具调用/命令',stepBucketCompaction:'压缩/检查点',stepBucketOther:'其他',stepBreakdownHint:'点击展开或收起步数构成',
      context:'上下文窗口',contextShort:'上下文',contextUsed:'{used}% 已用',contextTokens:'{used} / {max} toks',contextUnknown:'上下文容量不可用',contextUnavailable:'此请求暂无可用上下文统计。',contextBasis:'优先取已完成请求用量或宿主实时计数，生成中回退请求前估计；非累计 Token。',contextModel:'采样模型',contextLimit:'窗口容量',contextUsage:'已用 Token（估计）',contextSaved:'显示已保存的上下文统计（{time}）。',contextExceeded:'宿主估计值超过返回的窗口容量。',contextOverWindow:'已达活跃窗口上限（原始 {raw}%），即将触发压缩',
      compositionTitle:'上下文构成',compositionCustomization:'规则与配置',compositionCustomizationValue:'配置 {tokens}',compositionUser:'用户消息',compositionThinking:'助手思考',compositionReply:'助手回复',compositionAssistant:'助手（思考+回复）',compositionTool:'工具结果',compositionSystem:'系统文本',compositionOther:'其他上下文',compositionRemaining:'剩余空间',compositionSourceSteps:'步级用量桶',compositionSourceTranscript:'日志文本估算',compositionSourceHybrid:'步级桶 + 日志估算',compositionSourceHost:'宿主 8 分类精确口径',compositionBasis:'动态分段为估算值，按宿主报告的已用 Token 归一（来源：{source}）；规则与配置为宿主 token 基数精确值。',
      compositionSystemPrompt:'系统提示词',compositionMcpTools:'MCP 工具',compositionSubagents:'子代理',compositionSkills:'技能',compositionPlugins:'插件',compositionRules:'规则',compositionTools:'内置工具',compositionChatMessages:'对话消息',
      compositionViewList:'清单',compositionViewBar:'条形',compositionViewToggle:'构成视图',compositionGroupRules:'规则',compositionGroupSkills:'技能',compositionGroupSubagents:'子代理',compositionGroupMcpTools:'MCP 工具',compositionExactTag:'精确',compositionEstimateTag:'估算',compositionWindowShare:'占窗口 {pct}%',avgCacheHitRate:'平均缓存命中率',
      tokenBaseDrilldown:'规则与技能配置',tokenBaseCustomBudget:'配置总预算',tokenBaseRulesBudget:'规则预算',tokenBaseEmpty:'暂无规则与技能配置明细。',drilldownShowMore:'展开其余 {n} 项',drilldownShowLess:'收起',
      trendTitle:'上下文趋势',trendBasis:'逐请求输入 Token（未缓存 + 缓存读 + 写）；虚线标记压缩/检查点事件。',trendSample:'{n} 次请求',trendCompaction:'压缩',trendCheckpoint:'检查点',trendModeToggle:'趋势口径',trendModeTotal:'总计',trendModeDelta:'增量',trendReclaimed:'回收 {tokens}',
      panelViewSwitch:'面板视图',panelViewSession:'当前会话',panelViewActivity:'每日/每周活动',panelViewModels:'模型用量',panelViewInsights:'全局洞察',panelResetSession:'返回当前激活会话',
      usageToday:'今日用量',usageMonth:'本月用量',usageViewActivity:'每日/每周活动',usageViewModels:'模型用量',
      auditButton:'审计',auditTitle:'会话审计',auditTabFiles:'文件活动',auditTabCommands:'命令执行',auditTabSteps:'步骤浏览',auditLoading:'正在加载会话审计…',auditUnavailable:'会话审计暂不可用。',auditEmptyFiles:'暂无文件操作记录。',auditEmptyCommands:'暂无命令执行记录。',auditEmptySteps:'暂无步骤记录。',
      auditFilterAll:'全部',auditFilterThinking:'思考',auditFilterTools:'工具',auditFilterAnswer:'回答',auditFilterUser:'用户',
      auditOpRead:'读取',auditOpEdit:'编辑',auditOpWrite:'写入',auditOpSearch:'搜索',auditStepRef:'第 {n} 步',auditExitCode:'退出码 {code}',auditRunning:'运行中',
      creditsLabel:'Credits',creditsPrompt:'Prompt 额度',creditsFlow:'Flow 额度',creditsBadge:'{prompt}P · {flow}F',estimatedCostLabel:'预估费用',estimatedBadge:'估算',estimatedCostTitle:'按公开参考单价估算，非官方账单。',
      insightsAll:'全部',insightsActive:'活跃',insightsArchived:'已归档',insightsSortRecent:'最近更新',insightsSortTokens:'Token 总量',insightsSortContext:'当前上下文',insightsSortCost:'预估费用',insightsSearchPlaceholder:'搜索会话…',insightsScan:'重新扫描',insightsScanning:'正在扫描本地会话…',
      insightsKpiSessions:'全部会话',insightsKpiSessionsSub:'{active} 活跃 · {archived} 归档',insightsKpiTokens:'Token 消耗',insightsKpiRoundsSub:'{n} 轮对话',insightsKpiCost:'预估费用',insightsKpiPricedSub:'已计价 {priced}/{total}',insightsKpiCache:'缓存命中率',insightsKpiTools:'工具调用',insightsKpiDuration:'活跃时长',insightsKpiCallsSub:'{n} 次模型调用',
      insights7dTitle:'近 7 天用量',insightsHeatmapTitle:'活跃度热力图',insightsHeatmapSessions:'会话数',insightsHeatmapTokens:'Token',insightsHeatmapLess:'少',insightsHeatmapMore:'多',insightsHeatmapSummary:'活跃 {days} 天 · 连续 {streak} 天 · 峰值 {peak}',insightsHeatmapPeakSessions:'{n} 会话',insightsHeatmapTip:'{date} · {sessions} 会话 · {tokens} tok',insightsHeatmapClearDate:'{date} ×',insightsEmptyDate:'{date} 当日暂无会话记录。',insightsWeekdays:'一,,三,,五,,',insightsCompTitle:'Token 构成',insightsProjects:'项目分布',insightsSkills:'技能加载',insightsTools:'工具调用',insightsCommands:'命令执行',insightsSessionsTitle:'会话列表（{n}）',insightsEmpty:'未发现本地会话日志。',insightsCacheMeta:'{total} 个会话 · {ms}ms',
      savedStats:'显示已保存的会话统计（{time}）。',saveFailed:'统计暂时无法保存到本地。',
      strip:'Antigravity Dashboard 会话与额度状态条',session:'会话统计',cache:'缓存命中',cacheTitle:'Token 用量',five:'5h 额度',week:'周额度',weekShort:'周',
      modelTime:'模型调用用时',toolTime:'工具调用用时',ttft:'首字延迟 P50 (TTFT)',ttftShort:'首字 (P50 / 最新)',ttftBasis:'首字延迟 TTFT（到首个流式输出，部分第三方模型可能含思考缓冲）· 会话 P50：{p50} · 最新：{latest}',latestSpeed:'最新解码',latestSpeedTip:'最近一条合格请求的纯流式解码速度（总输出含思考 ÷ 流式时长；已隔离 < 1s 或 < 30 输出 Token 的短窗口样本）。',shortSpeedTip:'短样本（{tokens} tok / {dur}），因不足 1s 或 30 输出 Token 未计入均速与峰值。',bufferedSpeedTip:'缓冲突发（{tokens} tok 在 {dur} 内集中刷出），已从均速与峰值排除。',latestTipE2e:' · 本次端到端 {e2e} tok/s',latestTipPrev:' · 同模型上次合格 {prev} tok/s',shortSublineRef:'{tokens} tok · {dur} · 上次 {prev} tok/s',shortSubline:'{tokens} tok · {dur} · 未计入均速',bufferedSublineE2e:'{tokens} tok · {dur} · 端到端 {e2e} tok/s',sessionAvg:'会话解码',e2eSpeed:'端到端速率',e2eShort:'端到端',e2eBasis:'端到端有效速率：合格请求总输出 Token ÷（首字延迟 + 流式时长），反映计入等待后的综合效率。',peakSpeed:'解码峰值',peakBasis:'合格样本中的纯流式解码峰值（已隔离 < 1s 或 < 30 输出 Token 的短窗口突发）。',basisShortResponse:'仅正文输出',basisShortAll:'总输出（含思考）',sessionTps:'会话解码速率（TPS）',latest:'最近一次请求',tokens:'正文 / 思考输出',remaining:'剩余',
      resetIn:'重置倒计时',resetTime:'重置时间（北京时间）',group:'额度组',selectGroup:'选择额度组',refresh:'刷新额度',refreshStats:'刷新统计',refreshing:'正在刷新…',
      speedStyle:'速度卡样式',styleMinimal:'简约',styleCat:'像素猫',styleSaveFailed:'样式设置暂时无法保存，请重试。',outlookOk:'额度充裕',outlookTight:'额度偏紧',outlookExhaust:'重置前耗尽',paceIdle:'暂未消耗',forecastLeft:'预计重置时剩 ~{pct}',forecastDepletes:'预计 {eta} 后耗尽、比重置早 {early}',forecastWarming:'已耗 {pct} · 采样预热中',forecastBasis:'剩余额度 {remaining} · 剩余时间 {time} · 按本窗口平均消耗线性推算',forecastBasisWork:'剩余额度 {remaining} · 剩余时间 {time} · 按当日总对话时长（{hours}h）推算',
      waiting:'等待刷新',connecting:'连接 Antigravity…',waitingApp:'等待 Antigravity',waitingModel:'等待模型生成',waitingRequest:'尚无请求',hover:'悬停状态条，查看详细统计',autoConnect:'打开应用后自动连接',loadingQuota:'读取额度…',unavailableQuota:'额度暂不可用',
      live:'已连接 Antigravity Dashboard',stale:'显示上次成功读取的额度',offline:'Antigravity Dashboard 暂未连接',
      responseBasis:'纯流式解码速度：正文 Token ÷ 流式时长（缺少总输出计数）；会话 TPS 按总时长加权。',allBasis:'纯流式解码速度：总输出 Token（含思考）÷ 流式时长；会话 TPS 按合格样本总时长加权。',
      missingTime:'{n} 次请求缺少时长，未计入 TPS。',shortSample:'最近请求为短窗口（< 1 秒或 < 30 输出 Token），已隔离该条速率。',running:'生成中，显示已完成请求统计。',
      timingShort:'短样本',timingBuffered:'缓冲突发',timingUnreliable:'计时不确定',ratePending:'等待重算',excludedTime:'已排除 {n} 次异常计时，不计入 TPS。',rateWarning:'另有 {n} 次短时或高速度采样可能波动，仍计入 TPS。',rateWarningOnly:'{n} 次短时或高速度采样可能波动，仍计入 TPS。',rateReasons:'原因：{reasons}。',rateReasonCount:'{reason}：{n} 次',rateUsageRetained:'Token 和缓存用量仍完整保留。',legacyRate:'已保存的 TPS 使用旧算法；连接后打开此对话即可重新计算。',
      reasonToken:'Token 统计范围不一致',reasonDuplicate:'同一请求的记录冲突',reasonRetry:'重试的 Token 与计时范围不明确',reasonTool:'工具输出的计时窗口过短',reasonBurst:'长等待后极短窗集中刷出',reasonOutlier:'短时速率显著高于同模型基线',reasonShortWindow:'短窗口或低输出样本（< 1 秒或 < 30 输出 Token）',reasonNonfinite:'计算速率无效',
      sample:'{rounds}轮 {steps}步 · {requests} 次采样',sampleCount:'{n} 次采样',rounds:'{rounds}轮 {steps}步 ·',
      noQuota:'账户未返回此额度窗口。',disabledQuota:'此额度窗口已停用。',noFraction:'账户未返回剩余比例。',sharedQuota:'同组模型共享额度。',quotaSource:'余额与重置时间来自账户接口。',updated:'{time} 更新',health:'额度更新于 {time} · 真实请求统计',firstUpdate:'等待首次更新',
      cacheRate:'缓存命中',cacheHitRateColon:'缓存命中率：',cacheRead:'缓存读取',cacheInput:'总输入',cacheMiss:'未缓存输入',cacheWrite:'缓存写入',cacheOutput:'输出',cacheBasis:'缓存读取 token ÷ 总输入 token，按请求 token 总量加权；缓存写入不算命中。',cacheMissing:'{n} 次请求缺少缓存统计。',cacheUnavailable:'此会话暂无可用缓存统计。',cacheCoverage:'{measured} / {total} 次请求',
      language:'语言',dashboardLanguage:'仪表盘语言',switchLanguage:'Switch to English',languageSaveFailed:'语言设置暂时无法保存，请重试。',checkUpdate:'检查更新',reconnecting:'等待控件重新连接',panelUnavailable:'统计面板暂时无法连接',invalidData:'统计数据格式不兼容',
      usageScopeLocal:'本机全部',usageScopeAccount:'当前账号',quotaWindowUsage:'周期用量',quotaWindowFullRef:'约 {full} 满额',quotaWindowBasis:'当前账号该额度周期内本机实测流经 Token；估算满额仅作同比例参考（不同模型与缓存折算权重不同）。',
      quotaRingTitle:'剩余额度',quotaRingUnknown:'余额未知',quotaDisplay:'额度显示',quotaDisplayBoth:'双数字',quotaDisplayAuto:'自动',quotaDisplayCompact:'角标',quotaDisplayWeekly:'仅周',quotaDisplaySaveFailed:'显示模式暂时无法保存，请重试。',
      inlineReconnecting:'内嵌栏正在自动重连；此面板仍可查看统计。',panelInlineReconnecting:'内嵌栏正在自动重连；此面板仍可查看统计。',panelDebugPortReady:'宿主未开启调试端口（已自动配置启动入口）；请完全退出并从快捷方式重开 Antigravity 以恢复内嵌栏，当前可在此面板查看统计。',panelDebugPortManual:'Antigravity 2.33+ 需带 --remote-debugging-port=0 --remote-debugging-address=127.0.0.1（或运行 python3 manage.py launch）启动以显示内嵌栏；此面板仍可查看统计。',missingDebugPort:'当前 Antigravity 未开启调试端口，无法挂载内嵌状态栏。',relaunchDebugButton:'一键重启并恢复状态栏',relaunchingDebug:'正在重启 Antigravity…',relaunchDebugFailed:'自动重启未能触发，请使用 Antigravity (Debug) 启动器重新打开。',relaunchDebugCooldown:'已发起重启请求，请稍候等待 Antigravity 重新打开。',relaunchDebugNotRunning:'未检测到运行中的 Antigravity 主程序。',autoRelaunchLabel:'缺少调试端口时自动重启恢复（如更新后）',autoRelaunchSaveFailed:'自动重启设置暂时无法保存。',
      poolGemini:'Gemini',pool3p:'Claude / 3p',poolLocal:'本地 / BYOM',poolOther:'其他',poolRollup:'额度池汇总',
      multiAgentDetails:'多代理与模型拆分',sessionRoleLabel:'代理角色',roleCoordinator:'协调主代理',roleWorker:'执行子代理',roleMonitor:'监控看守',roleSidecar:'定时后台任务',
      orchestrationOverhead:'协调开销',workerExecution:'子代理执行',cacheMissSurge:'{n} 次缓存未命中峰值（{tokens}）',
      contextBreakdown:'上下文与工具构成',breakdownUser:'用户',breakdownReply:'回复',breakdownThinking:'思考',breakdownTools:'工具返回',breakdownToolCalls:'工具入参',breakdownSystem:'系统',
      topTools:'高占用工具',bloatBadge:'{n} 项膨胀',bloatWarningLine:'{tool} #{step}: {tokens}',bloatHint:'单次负载 ≥ 20K（严重 ≥ 50K）',
      hostUiLocalization:'宿主界面汉化',hostUiLocalizationHint:'将 Antigravity 宿主界面菜单与按钮汉化为简体中文（热切换无需重启）',hostUiLocalizationOn:'开启',hostUiLocalizationOff:'关闭',hostUiLocalizationSaveFailed:'宿主汉化设置暂时无法保存，请重试。',hostUiLocalizationEnableAction:'开启宿主界面汉化',hostUiLocalizationDisableAction:'关闭宿主界面汉化',
      inlineCacheHit:'底栏显示命中率',inlineCacheHitOn:'开启',inlineCacheHitOff:'关闭',inlineCacheHitSaveFailed:'显示设置暂时无法保存，请重试。',
      cacheChipMode:'缓存显示',cacheChipModeTokens:'仅总量',cacheChipModeBoth:'总量+命中',cacheChipModeHit:'仅命中',cacheChipModeSaveFailed:'缓存显示设置暂时无法保存，请重试。',
      taskSwarm:'Swarm（{n} 成员）',swarmDetails:'Swarm 协同与模型',swarmRoster:'Swarm 成员',swarmShowAll:'展开全部 {n} 个',swarmShowLess:'收起',swarmStatusKilled:'已结束',swarmStatusActive:'活跃',swarmStatusAll:'全部',
      orchSplitTitle:'Orchestrator 主/执行分工',orchCardTitle:'Orchestrator · 单会话双模型',orchScopeHint:'同一会话内 · 规划与执行切模型',orchSwitchCount:'切换 {n} 次',orchReadOnlyTag:'仅规划',swarmScopeHint:'多会话并行团队 · 主协调与各成员独立对话',orchRolePlanner:'主调度',orchRoleExecutor:'干活执行',orchConfiguredPair:'已配组合：{planner} → {executor}',orchNoSwitchYet:'仅规划/只读 · 尚未切执行模型',orchColdStartNote:'切模型冷缓存 {n} 次',orchColdStartLabel:'切模型冷缓存',orchColdStartTip:'切到执行模型后首步缓存读为 0（不同模型不共享 KV 缓存，需重新计算上下文）',cacheMissSurgeLabel:'大额冷缓存',cacheMissSurgeTip:'单次请求缓存读为 0 且未缓存输入 ≥ 100K 的次数与累计量（常见于压缩、切模型或缓存过期后重算）',reqCountShort:'{n} 次请求',countTimes:'{n} 次',
      insightsProjectsSubtotal:'{n} 项目 · {tokens} toks',insightsSkillsSubtotal:'{n} 技能 · {runs} 次',insightsToolsSubtotal:'{n} 工具 · {calls} 次',insightsCommandsSubtotal:'{n} 命令 · {runs} 次',insightsUnitSessions:'{n} 会话',insightsUnitRuns:'{n} 次',insightsUnitCalls:'{n} 次',
      barCustomize:'自定义',barCustomizeTitle:'状态栏自定义',barReset:'恢复默认',barContextChipMode:'上下文圆环副文案',barContextModeRounds:'轮数',barContextModeLabel:'标签',barContextModeCompact:'极简',barOrderLabel:'显示项与顺序',barKeepOneHint:'至少保留 1 个状态栏入口',barSaveFailed:'状态栏设置暂时无法保存，请重试。',barMoveUp:'上移',barMoveDown:'下移',barChipSpeed:'速度',barChipCache:'缓存',barChipQuota:'额度',barChipContext:'上下文',barFooterMigrated:'已隐藏上下文芯片，设置入口已自动迁移至此浮卡底部。',
      pulseSettings:'设置',pulseSettingsTitle:'Antigravity Dashboard 设置',pulseSettingsSubtitle:'底栏自由换色 · 明暗 · 模块开关',settingsSectionTheme:'底栏配色与明暗',settingsSectionBar:'底栏模块与顺序',settingsSectionGeneral:'显示项与语言',settingsMode:'明暗',modeAuto:'跟随',modeLight:'浅色',modeDark:'深色',themeModeSaveFailed:'明暗设置暂时无法保存，请重试。',barColorSpeed:'速度 (tok/s)',barColorToken:'Token 用量',barColorQuota:'额度圆环',barColorContext:'上下文圆环',barColorCacheHit:'命中率',barColorCacheHitHigh:'命中 ≥90%',barColorCacheHitMid:'命中 80–89%',barColorCacheHitLow:'命中 70–79%',barColorCacheHitCold:'命中 <70%',barColorDefault:'默认',barColorPick:'自定义颜色',barColorsSaveFailed:'底栏配色暂时无法保存，请重试。',cacheHitToneLabel:'高命中染色 (≥70%)',cacheHitToneAccent:'默认主色',cacheHitToneSemantic:'语义绿',cacheHitToneSaveFailed:'配色设置暂时无法保存，请重试。',cacheHitTiersLabel:'命中率配色模式',cacheHitTiersFixed:'固定色',cacheHitTiersAuto:'自动分档',cacheHitTiersHint:'自动分档：≥90% 高 · 80–89% 中 · 70–79% 低 · <70% 冷（灰）',cacheHitTiersSaveFailed:'命中率模式暂时无法保存，请重试。',settingsBack:'返回',settingsClose:'关闭',
      remoteFallbackUnconfigured:'远程 SSH（{host}）：底栏仅显示共享额度；请在右侧辅助栏打开 Antigravity Dashboard 查看远程会话统计，或配置 SSH 端口转发以同步完整底栏。',remoteFallbackUnreachable:'远程 SSH（{host}）：未连上远程转发端点，底栏暂仅显示共享额度；请确认 SSH 端口转发已开启，或使用右侧辅助栏查看。',remoteConnectedBadge:'SSH · {host}',remoteQuotaTitle:'远程 SSH（{host}）· 共享额度',
      stripMode:'状态条显示模式',stripFull:'完整状态条',stripMinimal:'极简状态条',stripCollapse:'收起为极简状态条',stripExpand:'展开完整状态条',stripModeSaveFailed:'显示模式暂时无法保存，请重试。',
      barPlacement:'底栏位置',barPlacementInline:'同行嵌入',barPlacementFooter:'底部独立一行',barPlacementSaveFailed:'底栏位置暂时无法保存，请重试。',
      turnFooter:'回复末尾统计条',turnFooterOn:'开启',turnFooterOff:'关闭',turnFooterSaveFailed:'统计条设置暂时无法保存，请重试。',turnFooterIn:'输入',turnFooterOut:'输出',turnFooterCache:'缓存',turnFooterSpeed:'均速',
    },
    'zh-TW':{
      collectionBackgroundFailed:'背景暫時無法完成，稍後會自動重試。',collectionProcessing:'正在補全統計',collectionProcessingReason:'背景處理中，可繼續使用。',collectionProgress:'查看進度',collectionProgressCounts:'已處理 {steps} 個步驟 · {requests} 筆請求記錄',collectionQueued:'等待處理',collectionSteps:'讀取步驟',collectionGenerators:'讀取請求記錄',collectionReducing:'計算統計',collectionPublishing:'儲存已驗證統計',
      collectionLimited:'統計受限',collectionSaved:'上次完整統計',collectionSavedAt:'上次完整統計 · {time}',collectionReason:'此對話統計量超過採集限制。',collectionDetails:'查看原因',collectionDocs:'瞭解採集限制',collectionProjected:'序列化統計大小',collectionRetained:'解析保留量估算',collectionField:'統計欄位長度',collectionObserved:'已觀測至少 {observed} / 上限 {limit}',collectionCharacters:'{n} 字元',collectionUnavailable:'統計暫時無法取得',collectionNoPartial:'本次未完成的讀取未計入統計。',
      tokenPartial:'僅統計已記錄的 Token（≥）：{input} 次請求缺少輸入用量，{output} 次缺少輸出用量。輸出計算獨立於快取統計。',
      tokenLegacy:'已儲存的 Token 用量為下限（≥）；無法確認個別請求的統計涵蓋情況。',unknownCoverage:'未知',
      cacheZeroInput:'回報的總輸入為 0，快取命中率無有效的分母可供計算。',
      savedCache:'快取率使用已儲存的統計資料（{time}）。',savedSpeed:'生成速率使用已儲存的統計資料（{time}）。',
      panelSpeed:'速率',panelCache:'Token · 快取',panelQuota:'配額',panelContext:'上下文',panelDetails:'統計詳細資料',panelUsed:'已用',panelSharedQuota:'配額',argonWeek:'Argon 每週配額',routeOrchSwitched:'雙模型 · 切{n}次',routeOrchActive:'雙模型',routeSwarm:'Swarm · {n}',
      newConversationStats:'目前為新對話：傳送訊息或開啟既有對話後將顯示統計資料。帳號配額於下方單獨顯示。',
      subagentStats:'目前子代理 (Subagent) 統計',accountQuota:'帳號共用配額，供所有代理共用。',
      taskOwn:'目前代理',taskSubagents:'子代理（{n}）',taskLoading:'正在彙總子代理…',taskPartial:'部分子代理暫時無法讀取',taskCurrentOnly:'僅目前代理；子代理統計暫時無法取得',
      transcriptTitle:'已記錄文字預估',transcriptUser:'使用者文字',transcriptAssistant:'回覆與思考過程',transcriptTool:'工具輸出',transcriptSystem:'系統文字',transcriptMarkers:'壓縮標記記錄',transcriptImages:'圖片生成步驟',transcriptPartial:'部分記錄',transcriptLoading:'載入中…',transcriptUnavailable:'無法提供',transcriptSaved:'已儲存',transcriptBasis:'依記錄文字推算之預估值，非作用中上下文或計費用量。不含隱藏提示詞、媒體檔案與工具呼叫引數。',
      contextHostLimit:'目前視窗容量（宿主環境）',contextProviderCapacity:'供應商規格容量參考',contextCompressionLimit:'觸發壓縮門檻',contextLimitUnknown:'未知',contextReferenceBasis:'模型供應商規格參考值，不代表目前對話的可用容量。',
      contextCompactions:'已壓縮',contextCompactionCount:'壓縮 {n} 次',contextCompactionSummary:'已壓縮 {n} 次',contextCompactionsTitle:'目前對話已記錄的上下文壓縮次數：{n} 次',compactionMetricsBasis:'按對話軌跡中的壓縮/檢查點步驟計數；壓縮由累計上下文 token 驅動，與輪數不成比例（單輪可包含多個步驟）。',trendPeakShare:'▲ 佔視窗 {pct}%',trendPeakTrigger:'閾值觸發峰值',
      contextCompactBtn:'壓縮',contextCompactBtnTitle:'點擊向目前對話發送 /compact 壓縮上下文',contextCompactDraftTitle:'輸入框已有未發送內容，請先清空或發送後再壓縮',contextCompacting:'壓縮中…',contextCompactingChip:'壓縮中',
      contextTurnsCount:'{n} 輪',contextTurnsSteps:'{rounds} 輪 · {steps} 步',contextTurnsTitle:'{rounds} 輪使用者輸入 · {steps} 個軌跡步驟（含模型回覆、工具呼叫、命令與壓縮等）',contextChipRounds:'· {n}輪',
      stepBreakdownTitle:'步數構成 · 共 {n} 步',stepBucketUser:'使用者輸入',stepBucketPlanner:'模型回覆/思考',stepBucketTool:'工具呼叫/命令',stepBucketCompaction:'壓縮/檢查點',stepBucketOther:'其他',stepBreakdownHint:'點擊展開或收起步數構成',
      context:'上下文視窗',contextShort:'上下文',contextUsed:'{used}% 已使用',contextTokens:'{used} / {max} toks',contextUnknown:'目前無法取得上下文容量',contextUnavailable:'此請求目前無法取得上下文統計資料。',contextBasis:'優先取已完成請求用量或宿主即時統計，生成中回退請求前預估；非累計 Token。',contextModel:'取樣模型',contextLimit:'視窗容量',contextUsage:'已用 Token（預估）',contextSaved:'顯示已儲存的上下文統計資料（{time}）。',contextExceeded:'宿主預估值已超過回傳的視窗容量。',contextOverWindow:'已達作用中視窗上限（原始 {raw}%），即將觸發壓縮',
      compositionTitle:'上下文構成',compositionCustomization:'規則與設定',compositionCustomizationValue:'設定 {tokens}',compositionUser:'使用者訊息',compositionThinking:'助手思考',compositionReply:'助手回覆',compositionAssistant:'助手（思考+回覆）',compositionTool:'工具結果',compositionSystem:'系統文字',compositionOther:'其他上下文',compositionRemaining:'剩餘空間',compositionSourceSteps:'步級用量桶',compositionSourceTranscript:'日誌文字估算',compositionSourceHybrid:'步級桶 + 日誌估算',compositionSourceHost:'宿主 8 分類精確口徑',compositionBasis:'動態分段為估算值，按宿主回報的已用 Token 歸一（來源：{source}）；規則與設定為宿主 token 基數精確值。',
      compositionSystemPrompt:'系統提示詞',compositionMcpTools:'MCP 工具',compositionSubagents:'子代理',compositionSkills:'技能',compositionPlugins:'外掛',compositionRules:'規則',compositionTools:'內建工具',compositionChatMessages:'對話訊息',
      compositionViewList:'清單',compositionViewBar:'條形',compositionViewToggle:'構成檢視',compositionGroupRules:'規則',compositionGroupSkills:'技能',compositionGroupSubagents:'子代理',compositionGroupMcpTools:'MCP 工具',compositionExactTag:'精確',compositionEstimateTag:'估算',compositionWindowShare:'佔視窗 {pct}%',avgCacheHitRate:'平均快取命中率',
      tokenBaseDrilldown:'規則與技能設定',tokenBaseCustomBudget:'設定總預算',tokenBaseRulesBudget:'規則預算',tokenBaseEmpty:'暫無規則與技能設定明細。',drilldownShowMore:'展開其餘 {n} 項',drilldownShowLess:'收合',
      trendTitle:'上下文趨勢',trendBasis:'逐請求輸入 Token（未快取 + 快取讀 + 寫）；虛線標記壓縮/檢查點事件。',trendSample:'{n} 次請求',trendCompaction:'壓縮',trendCheckpoint:'檢查點',trendModeToggle:'趨勢口徑',trendModeTotal:'總計',trendModeDelta:'增量',trendReclaimed:'回收 {tokens}',
      panelViewSwitch:'面板檢視',panelViewSession:'目前工作階段',panelViewActivity:'每日/每週活動',panelViewModels:'依模型用量',panelViewInsights:'全域洞察',panelResetSession:'返回目前啟用對話',
      usageToday:'今日用量',usageMonth:'本月用量',usageViewActivity:'每日/每週活動',usageViewModels:'依模型用量',
      auditButton:'稽核',auditTitle:'工作階段稽核',auditTabFiles:'檔案活動',auditTabCommands:'命令執行',auditTabSteps:'步驟瀏覽',auditLoading:'正在載入工作階段稽核…',auditUnavailable:'工作階段稽核暫不可用。',auditEmptyFiles:'暫無檔案操作記錄。',auditEmptyCommands:'暫無命令執行記錄。',auditEmptySteps:'暫無步驟記錄。',
      auditFilterAll:'全部',auditFilterThinking:'思考',auditFilterTools:'工具',auditFilterAnswer:'回答',auditFilterUser:'使用者',
      auditOpRead:'讀取',auditOpEdit:'編輯',auditOpWrite:'寫入',auditOpSearch:'搜尋',auditStepRef:'第 {n} 步',auditExitCode:'結束碼 {code}',auditRunning:'執行中',
      creditsLabel:'Credits',creditsPrompt:'Prompt 額度',creditsFlow:'Flow 額度',creditsBadge:'{prompt}P · {flow}F',estimatedCostLabel:'預估費用',estimatedBadge:'估算',estimatedCostTitle:'依公開參考單價估算，非官方帳單。',
      insightsAll:'全部',insightsActive:'作用中',insightsArchived:'已封存',insightsSortRecent:'最近更新',insightsSortTokens:'Token 總量',insightsSortContext:'目前上下文',insightsSortCost:'預估費用',insightsSearchPlaceholder:'篩選對話…',insightsScan:'重新掃描',insightsScanning:'正在掃描本機對話…',
      insightsKpiSessions:'全部對話',insightsKpiSessionsSub:'{active} 作用中 · {archived} 封存',insightsKpiTokens:'Token 消耗',insightsKpiRoundsSub:'{n} 輪對話',insightsKpiCost:'預估費用',insightsKpiPricedSub:'已計價 {priced}/{total}',insightsKpiCache:'快取命中率',insightsKpiTools:'工具呼叫',insightsKpiDuration:'活躍時長',insightsKpiCallsSub:'{n} 次模型呼叫',
      insights7dTitle:'近 7 天用量',insightsHeatmapTitle:'活躍度熱力圖',insightsHeatmapSessions:'對話數',insightsHeatmapTokens:'Token',insightsHeatmapLess:'少',insightsHeatmapMore:'多',insightsHeatmapSummary:'活躍 {days} 天 · 連續 {streak} 天 · 峰值 {peak}',insightsHeatmapPeakSessions:'{n} 對話',insightsHeatmapTip:'{date} · {sessions} 對話 · {tokens} tok',insightsHeatmapClearDate:'{date} ×',insightsEmptyDate:'{date} 當日暫無對話記錄。',insightsWeekdays:'一,,三,,五,,',insightsCompTitle:'Token 構成',insightsProjects:'專案分佈',insightsSkills:'技能載入',insightsTools:'工具呼叫',insightsCommands:'命令執行',insightsSessionsTitle:'對話列表（{n}）',insightsEmpty:'未發現本機對話日誌。',insightsCacheMeta:'{total} 個對話 · {ms}ms',
      savedStats:'顯示已儲存的對話統計資料（{time}）。',saveFailed:'統計資料暫時無法儲存至本機。',
      strip:'Antigravity Dashboard 對話與配額狀態列',session:'工作階段統計',cache:'快取命中',cacheTitle:'Token 用量',five:'5 小時配額',week:'每週配額',weekShort:'週',
      modelTime:'模型呼叫耗時',toolTime:'工具呼叫耗時',ttft:'首字延遲 P50 (TTFT)',ttftShort:'首字 (P50 / 最新)',ttftBasis:'首字延遲 TTFT（至首個串流輸出，部分第三方模型可能含思考緩衝）· 階段 P50：{p50} · 最新：{latest}',latestSpeed:'最新解碼',latestSpeedTip:'最近一筆合格請求的純串流解碼速度（總輸出含思考 ÷ 串流耗時；已隔離 < 1s 或 < 30 輸出 Token 的短視窗樣本）。',shortSpeedTip:'短樣本（{tokens} tok / {dur}），因不足 1s 或 30 輸出 Token 未計入均速與峰值。',bufferedSpeedTip:'緩衝突發（{tokens} tok 於 {dur} 內集中刷出），已從均速與峰值排除。',latestTipE2e:' · 本次端對端 {e2e} tok/s',latestTipPrev:' · 同模型上次合格 {prev} tok/s',shortSublineRef:'{tokens} tok · {dur} · 上次 {prev} tok/s',shortSubline:'{tokens} tok · {dur} · 未計入均速',bufferedSublineE2e:'{tokens} tok · {dur} · 端對端 {e2e} tok/s',sessionAvg:'階段解碼',e2eSpeed:'端對端速率',e2eShort:'端對端',e2eBasis:'端對端有效速率：合格請求總輸出 Token ÷（首字延遲 + 串流耗時），反映計入等待後的綜合效率。',peakSpeed:'解碼峰值',peakBasis:'合格樣本中的純串流解碼峰值（已隔離 < 1s 或 < 30 輸出 Token 的短視窗突發）。',basisShortResponse:'僅回覆輸出',basisShortAll:'總輸出（含思考）',sessionTps:'連線階段解碼速率 (TPS)',latest:'最近一次請求',tokens:'回覆內文 / 思考輸出',remaining:'剩餘',
      resetIn:'重設倒數',resetTime:'重設時間 (UTC+8)',group:'配額群組',selectGroup:'選取配額群組',refresh:'重新整理配額',refreshStats:'重新整理統計',refreshing:'正在重新整理…',
      speedStyle:'速度卡樣式',styleMinimal:'簡約',styleCat:'像素貓',styleSaveFailed:'樣式設定暫時無法儲存，請重試。',outlookOk:'配額充裕',outlookTight:'配額偏緊',outlookExhaust:'重設前耗盡',paceIdle:'暫未消耗',forecastLeft:'預計重設時剩 ~{pct}',forecastDepletes:'預計 {eta} 後耗盡、比重設早 {early}',forecastWarming:'已耗 {pct} · 取樣預熱中',forecastBasis:'剩餘配額 {remaining} · 剩餘時間 {time} · 依本週期平均消耗線性推算',forecastBasisWork:'剩餘配額 {remaining} · 剩餘時間 {time} · 依當日總對話時長（{hours}h）推算',
      waiting:'等待重新整理',connecting:'連線至 Antigravity…',waitingApp:'等待 Antigravity',waitingModel:'等待模型生成',waitingRequest:'尚無請求',hover:'將游標移至狀態列可檢視詳細統計',autoConnect:'開啟應用程式後將自動連線',loadingQuota:'讀取配額中…',unavailableQuota:'配額暫時無法取得',
      live:'已連線至 Antigravity Dashboard',stale:'顯示前次成功讀取的配額',offline:'Antigravity Dashboard 尚未連線',
      responseBasis:'純串流解碼速度：回覆 Token ÷ 串流耗時（缺少總輸出計數）；階段 TPS 依總時長加權。',allBasis:'純串流解碼速度：總輸出 Token（含思考）÷ 串流耗時；階段 TPS 依合格樣本總時長加權。',
      missingTime:'{n} 次請求缺少耗時記錄，未計入 TPS。',shortSample:'最近一次請求為短視窗（< 1 秒或 < 30 輸出 Token），已隔離該筆速率。',running:'生成中，目前顯示已完成請求之統計。',
      timingShort:'短樣本',timingBuffered:'緩衝突發',timingUnreliable:'計時不確定',ratePending:'等待重新計算',excludedTime:'已排除 {n} 次計時異常的請求，不計入 TPS。',rateWarning:'另有 {n} 次短時間或極高速取樣可能存在波動，仍已計入 TPS。',rateWarningOnly:'{n} 次短時間或極高速取樣可能存在波動，仍已計入 TPS。',rateReasons:'原因：{reasons}。',rateReasonCount:'{reason}：{n} 次',rateUsageRetained:'Token 與快取用量仍完整保留。',legacyRate:'已儲存的 TPS 使用舊版演算法；連線後重新開啟此對話即可重新計算。',
      reasonToken:'Token 統計範圍不一致',reasonDuplicate:'同一請求存在衝突記錄',reasonRetry:'重試的 Token 與計時範圍不明確',reasonTool:'純工具輸出的計時區間過短',reasonBurst:'長等待後極短視窗集中刷出',reasonOutlier:'短時間速率顯著高於同模型基準線',reasonShortWindow:'短視窗或低輸出樣本（< 1 秒或 < 30 輸出 Token）',reasonNonfinite:'計算速率無效',
      sample:'{rounds} 輪 {steps} 步 · {requests} 次取樣',sampleCount:'{n} 次取樣',rounds:'{rounds} 輪 {steps} 步 ·',
      noQuota:'此帳號未回傳該配額區間。',disabledQuota:'此配額區間已停用。',noFraction:'帳號未回傳剩餘比例。',sharedQuota:'同群組之模型共用配額。',quotaSource:'餘額與重設時間來自帳號 API。',updated:'{time} 更新',health:'配額更新於 {time} · 真實請求指標',firstUpdate:'等待初次更新',
      cacheRate:'快取命中率',cacheHitRateColon:'快取命中率：',cacheRead:'快取讀取',cacheInput:'總輸入',cacheMiss:'未快取輸入',cacheWrite:'快取寫入',cacheOutput:'輸出',cacheBasis:'快取讀取 Token ÷ 總輸入 Token，依各請求之 Token 總量加權計算；快取寫入不列入命中。',cacheMissing:'{n} 次請求缺少快取統計資料。',cacheUnavailable:'此對話目前無法取得快取統計資料。',cacheCoverage:'{measured} / {total} 次請求',
      language:'語言',dashboardLanguage:'儀表板語言',switchLanguage:'Switch to English',languageSaveFailed:'語言設定暫時無法儲存，請再試一次。',checkUpdate:'檢查更新',reconnecting:'等待控制項重新連線',panelUnavailable:'統計面板暫時無法連線',invalidData:'統計資料格式不相容',
      usageScopeLocal:'本機全部',usageScopeAccount:'目前帳號',quotaWindowUsage:'週期用量',quotaWindowFullRef:'約 {full} 滿額',quotaWindowBasis:'目前帳號此配額週期內本機實測流經 Token；預估滿額僅作等比例參考（不同模型與快取換算權重不同）。',
      quotaRingTitle:'剩餘額度',quotaRingUnknown:'餘額未知',quotaDisplay:'額度顯示',quotaDisplayBoth:'雙數字',quotaDisplayAuto:'自動',quotaDisplayCompact:'角標',quotaDisplayWeekly:'僅週',quotaDisplaySaveFailed:'顯示模式暫時無法儲存，請再試一次。',
      inlineReconnecting:'內嵌狀態列正在自動重新連線；此面板仍可檢視統計資料。',panelInlineReconnecting:'內嵌狀態列正在自動重新連線；此面板仍可檢視統計資料。',panelDebugPortReady:'宿主未開啟偵錯連接埠（已自動設定啟動捷徑）；請完全退出並由捷徑重開 Antigravity 以恢復內嵌狀態列，目前可在此面板檢視統計資料。',panelDebugPortManual:'Antigravity 2.33+ 需帶 --remote-debugging-port=0 --remote-debugging-address=127.0.0.1（或執行 python3 manage.py launch）啟動以顯示內嵌狀態列；此面板仍可檢視統計資料。',missingDebugPort:'目前的 Antigravity 未開啟除錯連接埠，無法掛載內嵌狀態列。',relaunchDebugButton:'一鍵重啟並恢復狀態列',relaunchingDebug:'正在重啟 Antigravity…',relaunchDebugFailed:'無法自動觸發重啟，請使用 Antigravity (Debug) 啟動器重新開啟。',relaunchDebugCooldown:'已發起重啟請求，請稍候等待 Antigravity 重新開啟。',relaunchDebugNotRunning:'目前未偵測到執行中的 Antigravity 主程式。',autoRelaunchLabel:'缺少除錯連接埠時自動重啟恢復（如更新後）',autoRelaunchSaveFailed:'自動重啟設定暫時無法儲存。',
      poolGemini:'Gemini',pool3p:'Claude / 3p',poolLocal:'本機 / BYOM',poolOther:'其他',poolRollup:'配額池彙總',
      multiAgentDetails:'多代理與模型拆分',sessionRoleLabel:'代理角色',roleCoordinator:'協調主代理',roleWorker:'執行子代理',roleMonitor:'監控守望',roleSidecar:'定時背景工作',
      orchestrationOverhead:'協調開銷',workerExecution:'子代理執行',cacheMissSurge:'{n} 次快取未命中峰值（{tokens}）',
      contextBreakdown:'上下文與工具組成',breakdownUser:'使用者',breakdownReply:'回覆',breakdownThinking:'思考',breakdownTools:'工具回傳',breakdownToolCalls:'工具參數',breakdownSystem:'系統',
      topTools:'高佔用工具',bloatBadge:'{n} 項膨脹',bloatWarningLine:'{tool} #{step}: {tokens}',bloatHint:'單次負載 ≥ 20K（嚴重 ≥ 50K）',
      hostUiLocalization:'宿主介面漢化',hostUiLocalizationHint:'將 Antigravity 宿主介面選單與按鈕翻譯為簡體中文（熱切換無需重啟）',hostUiLocalizationOn:'開啟',hostUiLocalizationOff:'關閉',hostUiLocalizationSaveFailed:'宿主漢化設定暫時無法儲存，請重試。',hostUiLocalizationEnableAction:'開啟宿主介面漢化',hostUiLocalizationDisableAction:'關閉宿主介面漢化',
      inlineCacheHit:'底欄顯示命中率',inlineCacheHitOn:'開啟',inlineCacheHitOff:'關閉',inlineCacheHitSaveFailed:'顯示設定暫時無法儲存，請再試一次。',
      cacheChipMode:'快取顯示',cacheChipModeTokens:'僅總量',cacheChipModeBoth:'總量+命中',cacheChipModeHit:'僅命中',cacheChipModeSaveFailed:'快取顯示設定暫時無法儲存，請再試一次。',
      taskSwarm:'Swarm（{n} 成員）',swarmDetails:'Swarm 協同與模型',swarmRoster:'Swarm 成員',swarmShowAll:'展開全部 {n} 個',swarmShowLess:'收合',swarmStatusKilled:'已結束',swarmStatusActive:'活躍',swarmStatusAll:'全部',
      orchSplitTitle:'Orchestrator 主/執行分工',orchCardTitle:'Orchestrator · 單工作階段雙模型',orchScopeHint:'同一工作階段內 · 規劃與執行切模型',orchSwitchCount:'切換 {n} 次',orchReadOnlyTag:'僅規劃',swarmScopeHint:'多工作階段並行團隊 · 主協調與各成員獨立對話',orchRolePlanner:'主調度',orchRoleExecutor:'執行模型',orchConfiguredPair:'已配組合：{planner} → {executor}',orchNoSwitchYet:'僅規劃/只讀 · 尚未切執行模型',orchColdStartNote:'切模型冷快取 {n} 次',orchColdStartLabel:'切模型冷快取',orchColdStartTip:'切至執行模型後首步快取讀為 0（不同模型不共用 KV 快取，需重新計算上下文）',cacheMissSurgeLabel:'大額冷快取',cacheMissSurgeTip:'單次請求快取讀為 0 且未快取輸入 ≥ 100K 的次數與累計量（常見於壓縮、切模型或快取過期後重算）',reqCountShort:'{n} 次請求',countTimes:'{n} 次',
      insightsProjectsSubtotal:'{n} 專案 · {tokens} toks',insightsSkillsSubtotal:'{n} 技能 · {runs} 次',insightsToolsSubtotal:'{n} 工具 · {calls} 次',insightsCommandsSubtotal:'{n} 指令 · {runs} 次',insightsUnitSessions:'{n} 工作階段',insightsUnitRuns:'{n} 次',insightsUnitCalls:'{n} 次',
      barCustomize:'自訂',barCustomizeTitle:'狀態列自訂',barReset:'重設預設',barContextChipMode:'上下文圓環副文案',barContextModeRounds:'輪數',barContextModeLabel:'標籤',barContextModeCompact:'極簡',barOrderLabel:'顯示項與順序',barKeepOneHint:'至少保留 1 個狀態列入口',barSaveFailed:'狀態列設定暫時無法儲存，請重試。',barMoveUp:'上移',barMoveDown:'下移',barChipSpeed:'速率',barChipCache:'快取',barChipQuota:'額度',barChipContext:'上下文',barFooterMigrated:'已隱藏上下文晶片，設定入口已自動遷移至此浮卡底部。',
      pulseSettings:'設定',pulseSettingsTitle:'Antigravity Dashboard 設定',pulseSettingsSubtitle:'底欄自由換色 · 明暗 · 模組開關',settingsSectionTheme:'底欄配色與明暗',settingsSectionBar:'底欄模組與順序',settingsSectionGeneral:'顯示項與語言',settingsMode:'明暗',modeAuto:'跟隨',modeLight:'淺色',modeDark:'深色',themeModeSaveFailed:'明暗設定暫時無法儲存，請重試。',barColorSpeed:'速度 (tok/s)',barColorToken:'Token 用量',barColorQuota:'額度圓環',barColorContext:'上下文圓環',barColorCacheHit:'命中率',barColorCacheHitHigh:'命中 ≥90%',barColorCacheHitMid:'命中 80–89%',barColorCacheHitLow:'命中 70–79%',barColorCacheHitCold:'命中 <70%',barColorDefault:'預設',barColorPick:'自訂顏色',barColorsSaveFailed:'底欄配色暫時無法儲存，請重試。',cacheHitToneLabel:'高命中染色 (≥70%)',cacheHitToneAccent:'預設主色',cacheHitToneSemantic:'語義綠',cacheHitToneSaveFailed:'配色設定暫時無法儲存，請重試。',cacheHitTiersLabel:'命中率配色模式',cacheHitTiersFixed:'固定色',cacheHitTiersAuto:'自動分檔',cacheHitTiersHint:'自動分檔：≥90% 高 · 80–89% 中 · 70–79% 低 · <70% 冷（灰）',cacheHitTiersSaveFailed:'命中率模式暫時無法儲存，請重試。',settingsBack:'返回',settingsClose:'關閉',
      remoteFallbackUnconfigured:'遠端 SSH（{host}）：底欄僅顯示共享額度；請在右側輔助欄開啟 Antigravity Dashboard 查看遠端工作階段統計，或設定 SSH 連接埠轉發以同步完整底欄。',remoteFallbackUnreachable:'遠端 SSH（{host}）：無法連線至遠端轉發端點，底欄暫僅顯示共享額度；請確認 SSH 連接埠轉發已開啟，或使用右側輔助欄查看。',remoteConnectedBadge:'SSH · {host}',remoteQuotaTitle:'遠端 SSH（{host}）· 共享額度',
      stripMode:'狀態列顯示模式',stripFull:'完整狀態列',stripMinimal:'極簡狀態列',stripCollapse:'收合為極簡狀態列',stripExpand:'展開完整狀態列',stripModeSaveFailed:'顯示模式暫時無法儲存，請重試。',
      barPlacement:'底欄位置',barPlacementInline:'同行嵌入',barPlacementFooter:'底部獨立一行',barPlacementSaveFailed:'底欄位置暫時無法儲存，請再試一次。',
      turnFooter:'回覆末尾統計列',turnFooterOn:'開啟',turnFooterOff:'關閉',turnFooterSaveFailed:'統計列設定暫時無法儲存，請再試一次。',turnFooterIn:'輸入',turnFooterOut:'輸出',turnFooterCache:'快取',turnFooterSpeed:'均速',
    },
  };
  let language=initialLanguage==='zh-CN'||initialLanguage==='zh-TW'?initialLanguage:'en';
  let lastZh=initialLanguage==='zh-TW'?'zh-TW':'zh-CN';
  const t=(key,args={})=>(dictionary[language]?.[key]||dictionary.en[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(args[name]??''));
  function countdown(at,now=Date.now()){
    const end=Date.parse(at);if(!Number.isFinite(end))return '—';if(end<=now)return t('waiting');
    const left=Math.ceil((end-now)/1000);
    if(left<60)return '<1m';
    const days=Math.floor(left/86400),hours=Math.floor(left%86400/3600),mins=Math.floor(left%3600/60);
    if(days>0)return `${days}d ${hours}h ${mins}m`;
    if(hours>0)return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  function elapsed(value){
    if(typeof value!=='number'||!Number.isFinite(value))return '—';if(value<60)return `${value.toFixed(2)}${language==='en'?'s':' 秒'}`;
    const whole=Math.round(value),h=Math.floor(whole/3600),m=Math.floor(whole%3600/60),s=whole%60;
    if(language==='en')return `${h?`${h}h `:''}${m}m ${s}s`;
    if(language==='zh-TW')return `${h?`${h} 小時 `:''}${m} 分 ${s} 秒`;
    return `${h?`${h}小时`:''}${m}分${s}秒`;
  }
  function resetDate(value){
    const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(language==='en'?'en-GB':(language==='zh-TW'?'zh-TW':'zh-CN'),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(date):'—';
  }
  function errorMessage(value){
    if(!value)return '';
    const text=String(value);
    const key=Object.keys(dictionary.en).find(key=>dictionary.en[key]===text);
    if(key)return t(key);
    const known={
      '请先打开 Antigravity':{tw:'請先開啟 Antigravity',en:'Open Antigravity to connect.'},
      '当前采集适配器支持 Windows':{tw:'目前收集配接器僅支援 Windows',en:'This collector requires Windows.'},
      '检测到多个 Antigravity 实例，请保留一个':{tw:'偵測到多個 Antigravity 執行個體，請保留一個',en:'Multiple Antigravity instances detected. Keep one open.'},
      '未找到 Antigravity 桌面后台':{tw:'找不到 Antigravity 桌面背景程式',en:'Antigravity desktop backend was not found.'},
      '读取 Antigravity 进程信息超时':{tw:'讀取 Antigravity 處理程序資訊逾時',en:'Timed out reading Antigravity process information.'},
      '无法读取 Antigravity 进程信息':{tw:'無法讀取 Antigravity 處理程序資訊',en:'Unable to read Antigravity process information.'},
      '当前版本未提供可用的本地检测凭据':{tw:'目前版本未提供可用的本機檢測憑證',en:'Local metrics credentials are unavailable in this version.'},
      '等待 Antigravity 本地接口启动':{tw:'等待 Antigravity 本機 API 啟動',en:'Waiting for the local Antigravity API.'},
      '未找到 Antigravity 语言服务日志，请检查日志路径':{tw:'找不到 Antigravity 語言伺服器記錄，請檢查記錄路徑',en:'Antigravity language-server log was not found. Check the log path.'},
      '后台已重新连接，请等待刷新':{tw:'背景程式已重新連線，請等待重新整理',en:'Backend reconnected; waiting for refresh.'},
      '会话暂时没有可用统计':{tw:'此對話暫無可用統計資料',en:'No statistics are available for this conversation yet.'},
      '完整会话统计分页暂不可用':{tw:'完整對話統計分頁暫時無法取得',en:'Complete conversation statistics are temporarily unavailable.'},
      '会话统计数据超过内存预算':{tw:'對話統計資料超出記憶體預算',en:'Conversation statistics exceed the memory budget.'},
      '会话统计数据超过采集上限':{tw:'對話統計資料超出收集上限',en:'Retained conversation statistics exceed the collection budget.'},
      '会话统计字段超过采集上限':{tw:'對話統計欄位超出收集上限',en:'A statistics field exceeds the collection budget.'},
      '会话统计分页读取超时':{tw:'對話統計分頁讀取逾時',en:'Conversation statistics pagination timed out.'},
      '会话统计分页数量无效':{tw:'對話統計分頁數量無效',en:'Invalid conversation statistics page count.'},
      '会话统计分页格式无效':{tw:'對話統計分頁格式無效',en:'Invalid conversation statistics page format.'},
      '会话仍在更新，请等待下一次刷新':{tw:'對話仍在更新中，請等待下一次重新整理',en:'The conversation is updating; waiting for the next refresh.'},
      '接口响应超过采集上限':{tw:'API 回應超出收集上限',en:'The API response exceeds the collection budget.'},
      'Antigravity 接口返回了无法解析的数据':{tw:'Antigravity API 回傳了無法解析的資料',en:'Antigravity returned an invalid response.'},
      'Antigravity 本地接口超时':{tw:'Antigravity 本機 API 連線逾時',en:'The local Antigravity API timed out.'},
      '会话标识无效':{tw:'對話識別碼無效',en:'Invalid conversation identifier.'},
      '等待 Antigrative Dashboard 后台启动':{tw:'等待 Antigrative Dashboard 背景程式啟動',en:'Waiting for the dashboard background process.'},
      '等待 Antigrative Dashboard 重新连接':{tw:'等待 Antigrative Dashboard 重新連線',en:'Waiting for the dashboard to reconnect.'},
      '等待 AG Pulse 后台启动':{tw:'等待 AG Pulse 背景程式啟動',en:'Waiting for the dashboard background process.'},
      '等待 AG Pulse 重新连接':{tw:'等待 AG Pulse 重新連線',en:'Waiting for the dashboard to reconnect.'},
    };
    const ideKnown={
      'Timed out reading Antigravity IDE processes':{zh:'读取 Antigravity IDE 进程信息超时',tw:'讀取 Antigravity IDE 處理程序資訊逾時',en:'Timed out reading Antigravity IDE processes.'},
      'Unable to read Antigravity IDE processes':{zh:'无法读取 Antigravity IDE 进程信息',tw:'無法讀取 Antigravity IDE 處理程序資訊',en:'Unable to read Antigravity IDE processes.'},
      'Waiting for Antigravity IDE processes':{zh:'等待 Antigravity IDE 进程启动',tw:'等待 Antigravity IDE 處理程序啟動',en:'Waiting for Antigravity IDE processes.'},
      'Waiting for the IDE main language server':{zh:'等待 Antigravity IDE 语言服务启动',tw:'等待 Antigravity IDE 語言伺服器啟動',en:'Waiting for the IDE main language server.'},
      'Waiting for the IDE local API port':{zh:'等待 Antigravity IDE 本地接口启动',tw:'等待 Antigravity IDE 本機 API 啟動',en:'Waiting for the IDE local API port.'},
      'IDE local API credential unavailable':{zh:'当前 IDE 版本未提供可用的本地检测凭据',tw:'目前 IDE 版本未提供可用的本機檢測憑證',en:'IDE local API credential unavailable.'},
      'IDE renderer port does not belong to Antigravity IDE':{zh:'当前调试端口不属于 Antigravity IDE',tw:'目前偵錯連接埠不屬於 Antigravity IDE',en:'IDE renderer port does not belong to Antigravity IDE.'},
      'Multiple Antigravity IDE instances own the renderer port':{zh:'检测到多个 Antigravity IDE 实例共用同一端口',tw:'偵測到多個 Antigravity IDE 執行個體共用同一連接埠',en:'Multiple Antigravity IDE instances own the renderer port.'},
    };
    if(known[text])return language==='zh-CN'?text:language==='zh-TW'?known[text].tw:known[text].en;
    if(ideKnown[text])return language==='zh-CN'?ideKnown[text].zh:language==='zh-TW'?ideKnown[text].tw:ideKnown[text].en;
    const match=text.match(/^Antigravity 接口 (\w+) 返回 (\d+)$/);
    if(match)return language==='zh-CN'?text:language==='zh-TW'?`Antigravity API ${match[1]} 回傳 HTTP ${match[2]}`:`Antigravity ${match[1]} returned HTTP ${match[2]}.`;
    return language==='en'?'Statistics are temporarily unavailable.':t('panelUnavailable');
  }
  function connectPreferences({read,write,cache=()=>{},changed=()=>{}}) {
    let epoch=0,writes=0,revision=-1,disposed=false,error=false,queue=Promise.resolve();
    const valid=value=>value==='en'||value==='zh-CN'||value==='zh-TW';
    const notify=()=>{if(!disposed)changed();};
    const remember=()=>{try{cache(language);}catch{}};
    const check=value=>{if(!value||value.error||!Object.hasOwn(value,'language')||value.language!==null&&!valid(value.language))throw new Error('Invalid preference response');return value;};
    function sync(value) {
      if(disposed||writes)return;
      try {
        check(value);const next=Number.isSafeInteger(value.revision)?value.revision:0;
        if(next<revision)return;
        if(error&&epoch>0&&value.language!==language)return; // retain an unsaved choice and its warning
        if(value.language===null&&epoch===0&&valid(initialLanguage)){void choose(initialLanguage);return;}
        const prevLang=language,prevErr=error,first=revision<0;
        revision=next;error=false;
        if(valid(value.language)&&language!==value.language){language=value.language;if(value.language!=='en')lastZh=value.language;remember();}
        if(first||language!==prevLang||prevErr)notify();
      } catch {error=true;notify();}
    }
    function choose(value) {
      if(disposed||!valid(value))return Promise.resolve();
      const choice=++epoch;language=value;if(value!=='en')lastZh=value;writes++;error=false;remember();notify();
      const pending=queue.then(async()=>{
        try {
          const saved=check(await write({language:value}));
          if(saved.language!==value)throw new Error('Preference acknowledgement differs');
          revision=Math.max(revision,Number.isSafeInteger(saved.revision)?saved.revision:0);
          if(choice===epoch)error=false;
        } catch {if(choice===epoch)error=true;}
        finally {writes--;notify();}
      });
      queue=pending;return pending;
    }
    const ready=(async()=>{
      const started=epoch;
      try {
        const saved=check(await read());
        if(disposed||epoch!==started)return;
        if(saved.language===null&&valid(initialLanguage))await choose(initialLanguage); // migrate an existing browser choice once
        else sync(saved);
      }catch{if(!disposed&&epoch===started){error=true;notify();}}
    })();
    return {ready,sync,choose,toggle:()=>choose(language==='en'?(lastZh||'zh-TW'):'en'),get error(){return error;},get pending(){return writes>0;},dispose(){disposed=true;}};
  }
  function connectChoicePreference({key,allowed,fallback,write,initial=null,cache=()=>{},changed=()=>{},normalize:customNormalize=null}){
    const normalize=customNormalize||(value=>allowed.includes(value)?value:fallback);
    let current=normalize(initial),epoch=0,writes=0,revision=-1,error=false,disposed=false,queue=Promise.resolve();
    const notify=()=>{if(!disposed)changed(current);};
    const remember=()=>{try{cache(current);}catch{}};
    function sync(value){
      if(disposed||writes||!value||typeof value!=='object'||value.error)return;
      const next=Number.isSafeInteger(value.revision)?value.revision:0;
      if(next<revision)return;
      const incoming=normalize(value[key]);
      if(error&&epoch>0&&incoming!==current)return; // retain an unsaved choice and its warning
      revision=next;
      const dirty=incoming!==current||error;error=false;
      if(incoming!==current){current=incoming;remember();}
      if(dirty)notify();
    }
    function choose(value){
      if(disposed||!allowed.includes(value))return Promise.resolve();
      const choice=++epoch;current=value;writes++;error=false;remember();notify();
      const pending=queue.then(async()=>{
        try{
          const saved=await write({[key]:value});
          if(!saved||saved.error||saved[key]!==value)throw new Error('Preference acknowledgement differs');
          revision=Math.max(revision,Number.isSafeInteger(saved.revision)?saved.revision:0);
          if(choice===epoch)error=false;
        }catch{if(choice===epoch)error=true;}
        finally{writes--;notify();}
      });
      queue=pending;return pending;
    }
    return {normalize,sync,choose,get value(){return current;},get error(){return error;},dispose(){disposed=true;}};
  }
  const SPEED_STYLES=['minimal','cat'];
  const USAGE_SCOPES=['local','account'];
  const QUOTA_DISPLAYS=['both','auto','compact','weekly'];
  const HOST_UI_LOCALIZATIONS=[false,true];
  const INLINE_CACHE_HITS=[false,true];
  const CACHE_CHIP_MODES=['both','tokens','hit'];
  const STRIP_MODES=['full','minimal'];
  const BAR_PLACEMENTS=['inline','footer'];
  const TURN_FOOTERS=[false,true];
  const BAR_COLOR_KEYS=['speed','token','quota','context','cacheHit','cacheHitHigh','cacheHitMid','cacheHitLow','cacheHitCold'];
  const THEME_MODES=['auto','light','dark'];
  const CACHE_HIT_TONES=['accent','semantic'];
  const CACHE_HIT_TIERS=[false,true];
  function normalizeSpeedStyle(value){return SPEED_STYLES.includes(value)?value:'minimal';}
  function normalizeUsageScope(value){return USAGE_SCOPES.includes(value)?value:'local';}
  function normalizeQuotaDisplay(value){return QUOTA_DISPLAYS.includes(value)?value:'both';}
  function normalizeDailyWorkHours(value){const n=typeof value==='number'?value:Number.NaN;return Number.isFinite(n)&&n>0&&n<=24?Math.max(0.25,Math.min(24,n)):24;}
  function normalizeHostUiLocalization(value){return value===true;}
  function normalizeInlineCacheHit(value){return value!==false;}
  function normalizeCacheHitTiers(value){return value===true;}
  function normalizeStripMode(value){return STRIP_MODES.includes(value)?value:'full';}
  function normalizeBarPlacement(value){return BAR_PLACEMENTS.includes(value)?value:'inline';}
  function normalizeTurnFooter(value){return value!==false;}
  function normalizeHexColor(value){if(typeof value!=='string')return null;const m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());if(!m)return null;const h=m[1].length===3?Array.from(m[1],c=>c+c).join(''):m[1];return `#${h.toLowerCase()}`;}
  function normalizeBarColors(value){const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;for(const k of BAR_COLOR_KEYS){const c=normalizeHexColor(value[k]);if(c)out[k]=c;}return out;}
  function normalizeThemeMode(value){return THEME_MODES.includes(value)?value:'auto';}
  function normalizeCacheHitTone(value){return CACHE_HIT_TONES.includes(value)?value:'accent';}
  function connectSpeedStyle(options){
    const ctrl=connectChoicePreference({key:'speedStyle',allowed:SPEED_STYLES,fallback:'minimal',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get style(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectUsageScope(options){
    const ctrl=connectChoicePreference({key:'usageScope',allowed:USAGE_SCOPES,fallback:'local',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get scope(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectQuotaDisplay(options){
    const ctrl=connectChoicePreference({key:'quotaDisplay',allowed:QUOTA_DISPLAYS,fallback:'both',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get value(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectHostUiLocalization(options){
    const ctrl=connectChoicePreference({key:'hostUiLocalization',allowed:HOST_UI_LOCALIZATIONS,fallback:false,...options});
    return {sync:ctrl.sync,choose:value=>ctrl.choose(value===true),get enabled(){return ctrl.value===true;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function normalizeCacheChipMode(value,legacyInlineCacheHit){
    return CACHE_CHIP_MODES.includes(value)?value:(legacyInlineCacheHit===false?'tokens':'both');
  }
  function connectInlineCacheHit(options){
    const ctrl=connectChoicePreference({key:'inlineCacheHit',allowed:INLINE_CACHE_HITS,fallback:true,...options});
    return {sync:ctrl.sync,choose:value=>ctrl.choose(value===true),get enabled(){return ctrl.value!==false;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectCacheChipMode({write,initial=null,cache=()=>{},changed=()=>{}}){
    let current=normalizeCacheChipMode(initial),epoch=0,writes=0,revision=-1,error=false,disposed=false,queue=Promise.resolve();
    const notify=()=>{if(!disposed)changed();};
    const remember=()=>{try{cache(current);}catch{}};
    function sync(value){
      if(disposed||writes||!value||typeof value!=='object'||value.error)return;
      const next=Number.isSafeInteger(value.revision)?value.revision:0;
      if(next<revision)return;
      const incoming=normalizeCacheChipMode(value.cacheChipMode,value.inlineCacheHit);
      if(error&&epoch>0&&incoming!==current)return;
      revision=next;
      const dirty=incoming!==current||error;error=false;
      if(incoming!==current){current=incoming;remember();}
      if(dirty)notify();
    }
    function choose(value){
      if(disposed||!CACHE_CHIP_MODES.includes(value))return Promise.resolve();
      const choice=++epoch;current=value;writes++;error=false;remember();notify();
      const pending=queue.then(async()=>{
        try{
          const saved=await write({cacheChipMode:value,inlineCacheHit:value!=='tokens'});
          if(!saved||saved.error||saved.cacheChipMode!==value)throw new Error('Preference acknowledgement differs');
          revision=Math.max(revision,Number.isSafeInteger(saved.revision)?saved.revision:0);
          if(choice===epoch)error=false;
        }catch{if(choice===epoch)error=true;}
        finally{writes--;notify();}
      });
      queue=pending;return pending;
    }
    return {normalize:normalizeCacheChipMode,sync,choose,get value(){return current;},get error(){return error;},dispose(){disposed=true;}};
  }
  function connectStripMode(options){
    const ctrl=connectChoicePreference({key:'stripMode',allowed:STRIP_MODES,fallback:'full',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get mode(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectBarPlacement(options){
    const ctrl=connectChoicePreference({key:'barPlacement',allowed:BAR_PLACEMENTS,fallback:'inline',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get placement(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectTurnFooter(options){
    const ctrl=connectChoicePreference({key:'turnFooter',allowed:TURN_FOOTERS,fallback:true,...options});
    return {sync:ctrl.sync,choose:value=>ctrl.choose(value!==false),get enabled(){return ctrl.value!==false;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectBarColors({write,initial=null,cache=()=>{},changed=()=>{}}){
    let colors=normalizeBarColors(initial),epoch=0,writes=0,revision=-1,error=false,disposed=false,queue=Promise.resolve();
    const same=(a,b)=>BAR_COLOR_KEYS.every(k=>(a[k]||null)===(b[k]||null));
    const notify=()=>{if(!disposed)changed();};
    const remember=()=>{try{cache({...colors});}catch{}};
    function sync(value){
      if(disposed||writes||!value||typeof value!=='object'||value.error)return;
      const nextRev=Number.isSafeInteger(value.revision)?value.revision:0;
      if(nextRev<revision)return;
      const incoming=normalizeBarColors(value.barColors);
      const differs=!same(incoming,colors);
      if(error&&epoch>0&&differs)return;
      revision=nextRev;
      const dirty=differs||error;error=false;
      if(differs){colors=incoming;remember();}
      if(dirty)notify();
    }
    function setAll(nextInput){
      if(disposed)return Promise.resolve();
      const next=normalizeBarColors(nextInput);
      const choice=++epoch;colors=next;writes++;error=false;remember();notify();
      const pending=queue.then(async()=>{
        try{
          const saved=await write({barColors:next});
          if(!saved||saved.error||!same(normalizeBarColors(saved.barColors),next))throw new Error('Preference acknowledgement differs');
          revision=Math.max(revision,Number.isSafeInteger(saved.revision)?saved.revision:0);
          if(choice===epoch)error=false;
        }catch{if(choice===epoch)error=true;}
        finally{writes--;notify();}
      });
      queue=pending;return pending;
    }
    function setColor(slot,hexOrNull){
      if(!BAR_COLOR_KEYS.includes(slot))return Promise.resolve();
      const next={...colors};
      const clean=normalizeHexColor(hexOrNull);
      if(clean)next[slot]=clean;else delete next[slot];
      return setAll(next);
    }
    return {sync,setColor,reset:()=>setAll({}),get colors(){return {...colors};},get error(){return error;},dispose(){disposed=true;}};
  }
  function connectThemeMode(options){
    const ctrl=connectChoicePreference({key:'themeMode',allowed:THEME_MODES,fallback:'auto',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get value(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectCacheHitTone(options){
    const ctrl=connectChoicePreference({key:'cacheHitTone',allowed:CACHE_HIT_TONES,fallback:'accent',...options});
    return {sync:ctrl.sync,choose:ctrl.choose,get value(){return ctrl.value;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  function connectCacheHitTiers(options){
    const ctrl=connectChoicePreference({key:'cacheHitTiers',allowed:CACHE_HIT_TIERS,fallback:false,...options});
    return {sync:ctrl.sync,choose:value=>ctrl.choose(value===true),get enabled(){return ctrl.value===true;},get error(){return ctrl.error;},dispose:ctrl.dispose};
  }
  const BAR_CARDS=['speed','cache','quota','context'];
  const CONTEXT_CHIP_MODES=['rounds','label','compact'];
  const normalizeBarOrder=value=>Array.isArray(value)&&value.length===BAR_CARDS.length&&new Set(value).size===BAR_CARDS.length&&value.every(k=>BAR_CARDS.includes(k))?[...value]:[...BAR_CARDS];
  const normalizeBarHidden=value=>Array.isArray(value)&&value.length<BAR_CARDS.length&&new Set(value).size===value.length&&value.every(k=>BAR_CARDS.includes(k))?[...value]:[];
  const normalizeContextChipMode=value=>CONTEXT_CHIP_MODES.includes(value)?value:'rounds';
  function connectBarPreferences({write,initial=null,cache=()=>{},changed=()=>{}}){
    let order=normalizeBarOrder(initial?.order),hidden=normalizeBarHidden(initial?.hidden),contextChipMode=normalizeContextChipMode(initial?.contextChipMode);
    let epoch=0,writes=0,revision=-1,error=false,disposed=false,queue=Promise.resolve();
    const sameList=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const notify=()=>{if(!disposed)changed();};
    const remember=()=>{try{cache({order,hidden,contextChipMode});}catch{}};
    function sync(value){
      if(disposed||writes||!value||typeof value!=='object'||value.error)return;
      const nextRev=Number.isSafeInteger(value.revision)?value.revision:0;
      if(nextRev<revision)return;
      const nextOrder=normalizeBarOrder(value.barOrder);
      const nextHidden=normalizeBarHidden(value.barHidden);
      const nextMode=normalizeContextChipMode(value.contextChipMode);
      const differs=!sameList(nextOrder,order)||!sameList(nextHidden,hidden)||nextMode!==contextChipMode;
      if(error&&epoch>0&&differs)return;
      revision=nextRev;
      const dirty=differs||error;error=false;
      if(differs){order=nextOrder;hidden=nextHidden;contextChipMode=nextMode;remember();}
      if(dirty)notify();
    }
    function update(patch){
      if(disposed||!patch||typeof patch!=='object')return Promise.resolve();
      const nextOrder=Object.hasOwn(patch,'barOrder')?normalizeBarOrder(patch.barOrder):order;
      const nextHidden=Object.hasOwn(patch,'barHidden')?normalizeBarHidden(patch.barHidden):hidden;
      const nextMode=Object.hasOwn(patch,'contextChipMode')?normalizeContextChipMode(patch.contextChipMode):contextChipMode;
      if(Object.hasOwn(patch,'barHidden')&&Array.isArray(patch.barHidden)&&patch.barHidden.length>=BAR_CARDS.length)return Promise.resolve();
      const choice=++epoch;order=nextOrder;hidden=nextHidden;contextChipMode=nextMode;writes++;error=false;remember();notify();
      const payload={barOrder:nextOrder,barHidden:nextHidden,contextChipMode:nextMode};
      const pending=queue.then(async()=>{
        try{
          const saved=await write(payload);
          if(!saved||saved.error||!sameList(normalizeBarOrder(saved.barOrder),nextOrder)||!sameList(normalizeBarHidden(saved.barHidden),nextHidden)||normalizeContextChipMode(saved.contextChipMode)!==nextMode)throw new Error('Preference acknowledgement differs');
          revision=Math.max(revision,Number.isSafeInteger(saved.revision)?saved.revision:0);
          if(choice===epoch)error=false;
        }catch{if(choice===epoch)error=true;}
        finally{writes--;notify();}
      });
      queue=pending;return pending;
    }
    const reset=()=>update({barOrder:[...BAR_CARDS],barHidden:[],contextChipMode:'rounds'});
    return {sync,update,reset,get order(){return [...order];},get hidden(){return [...hidden];},get contextChipMode(){return contextChipMode;},get error(){return error;},dispose(){disposed=true;}};
  }
  // Straight-segment sparkline with an end point for the minimal style. Pure
  // geometry so every renderer draws the same shape.
  function minimalTrail(samples,{width,height,top=6,bottom=2,right=4}={}){
    const list=(Array.isArray(samples)?samples:[]).filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
    if(!list.length||!(width>0)||!(height>0))return null;
    const slots=Math.max(list.length,12),last=list.length-1,end=width-right,span=height-top-bottom;
    const hi=Math.max(...list),lo=Math.min(...list),flat=hi===lo,max=hi*1.08,min=lo*0.7;
    const r=v=>Math.round(v*10)/10;
    const x=i=>r(end-((last-i)*end)/(slots-1));
    const y=v=>r(flat?top+span*0.45:top+span*(1-(v-min)/((max-min)||1)));
    const points=list.map((v,i)=>[x(i),y(v)]);
    if(points.length===1)points.unshift([r(Math.max(0,end-end/(slots-1))),points[0][1]]);
    const line='M'+points.map(p=>p.join(' ')).join('L');
    return {line,area:`${line}V${height}H${points[0][0]}Z`,end:points[points.length-1]};
  }
  // The factory is serialized into both the sandboxed panel and IDE webviews.
  // Build the selector without HTML sinks, imports or host-specific APIs.
  function mountLanguagePicker({button,parent=button.parentNode,choose,label=button}) {
    const doc=button.ownerDocument,menu=doc.createElement('div');
    menu.setAttribute('popover','manual');menu.setAttribute('role','menu');
    menu.dataset.languageMenu='';
    menu.style.cssText='position:fixed;inset:auto;margin:0;padding:5px;min-width:140px;box-sizing:border-box;border:1px solid var(--pulse-border);border-radius:9px;background:var(--pulse-card,var(--pulse-background));color:var(--pulse-foreground);box-shadow:0 8px 24px var(--pulse-shadow);font:12px var(--pulse-font,system-ui);z-index:2147483647';
    const options=[['en','English'],['zh-CN','简体中文'],['zh-TW','繁體中文']].map(([code,name])=>{
      const item=doc.createElement('button');item.type='button';item.textContent=name;item.lang=code;item.dataset.language=code;item.setAttribute('role','menuitemradio');
      item.style.cssText='display:block;width:100%;min-height:32px;padding:7px 12px;border:0;border-radius:5px;text-align:left;font:inherit;color:inherit;background:transparent;cursor:pointer';
      item.addEventListener('click',()=>{close();void choose(code);});
      item.addEventListener('focus',()=>item.style.background='var(--pulse-hover)');item.addEventListener('blur',()=>update());
      menu.append(item);return item;
    });
    parent.append(menu);button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
    const isOpen=()=>menu.matches(':popover-open');
    function close(restore=true){if(isOpen())menu.hidePopover();button.setAttribute('aria-expanded','false');if(restore)button.focus({preventScroll:true});}
    function position(){if(!isOpen())return;const r=button.getBoundingClientRect(),m=menu.getBoundingClientRect(),win=doc.defaultView;menu.style.left=Math.max(6,Math.min(r.right-m.width,win.innerWidth-m.width-6))+'px';menu.style.top=(r.bottom+m.height+6<win.innerHeight?r.bottom+5:Math.max(6,r.top-m.height-5))+'px';}
    function update(){label.textContent=language==='en'?'EN':language==='zh-TW'?'繁':'中';menu.setAttribute('aria-label',t('language'));button.setAttribute('aria-label',t('language'));button.title=t('language');for(const item of options){const selected=item.dataset.language===language;item.setAttribute('aria-checked',String(selected));item.style.background=selected?'var(--pulse-selected,var(--pulse-hover))':'transparent';}position();}
    function open(){update();menu.showPopover();button.setAttribute('aria-expanded','true');position();options.find(item=>item.dataset.language===language).focus({preventScroll:true});}
    function toggle(){if(isOpen())close();else open();}
    function keys(event){if(!isOpen())return;const path=event.composedPath(),index=options.findIndex(item=>path.includes(item));
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      if(event.key==='Tab'){close(false);return;}
      if(index<0)return;let next;if(event.key==='ArrowDown')next=(index+1)%3;else if(event.key==='ArrowUp')next=(index+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
      event.preventDefault();event.stopImmediatePropagation();options[next].focus({preventScroll:true});
    }
    function outside(event){const path=event.composedPath();if(isOpen()&&!path.includes(menu)&&!path.includes(button))close(false);}
    button.addEventListener('click',toggle);doc.addEventListener('keydown',keys,true);doc.addEventListener('pointerdown',outside,true);doc.defaultView.addEventListener('resize',position);
    update();return {update,close,isOpen,dispose(){close(false);button.removeEventListener('click',toggle);doc.removeEventListener('keydown',keys,true);doc.removeEventListener('pointerdown',outside,true);doc.defaultView.removeEventListener('resize',position);menu.remove();}};
  }
  function rateNote(speed) {
    if (!speed) return t('waitingRequest');
    if (speed.latestRateStatus === 'legacy') return t('ratePending');
    return t(speed.rateBasis==='all-output'?'allBasis':'responseBasis');
  }
  // Shared serializable quota presentation policy for App, IDE and sidecar.
  // Bucket IDs can be opaque; labels and automatic selection must agree on
  // the host display name as well. Keep unrelated future groups intact.
  const quotaModelAliases={
    model_placeholder_m26:'Claude Opus 4.6 (Thinking)',
    model_placeholder_m35:'Claude Sonnet 4.6 (Thinking)',
    model_placeholder_m405:'Claude Sonnet 5.5 (High)',
    model_placeholder_m318:'Gemini 3.8 Flash (High)',
    model_placeholder_m319:'Gemini 3.8 Flash (Medium)',
    model_placeholder_m320:'Gemini 3.8 Flash (Low)',
    model_placeholder_m532:'Gemini 4 Neon (High)',
    model_placeholder_m533:'Gemini 4 Neon (Medium)',
    model_placeholder_m534:'Gemini 4 Neon (Low)',
    model_placeholder_m535:'Gemini 4 Neon (XHigh)',
    model_placeholder_m427:'Gemini 4 Carbon (High)',
    model_placeholder_m437:'Gemini 4 Carbon (Medium)',
    model_placeholder_m438:'Gemini 4 Carbon (Low)',
    model_placeholder_m417:'Gemini 4 Argon (High)',
    model_placeholder_m418:'Gemini 4 Argon (Medium)',
    model_placeholder_m419:'Gemini 4 Argon (Low)',
    model_placeholder_m525:'Gemini 4 Hydrogen (High)',
    model_placeholder_m526:'Gemini 4 Hydrogen (Medium)',
    model_placeholder_m527:'Gemini 4 Hydrogen (Low)',
    model_placeholder_m528:'Gemini 4 Hydrogen (XHigh)',
    model_placeholder_m537:'Orchestrator (Neon)',
    'gemini-pro-orchestrator-neon':'Orchestrator (Neon)',
    model_placeholder_m667:'Orchestrator (Carbon)',
    'gemini-pro-orchestrator':'Orchestrator (Carbon)',
    model_placeholder_m681:'Orchestrator (Argon)',
    'gemini-pro-orchestrator-argon':'Orchestrator (Argon)',
    model_placeholder_m669:'Gemini 4 Hydrogen (Orchestrator)',
    'gemini-flash-worker-agy':'Gemini 4 Hydrogen (Orchestrator)',
    model_placeholder_m18:'Gemini 2.5 Pro',
    model_placeholder_m148:'Gemini 2.5 Pro',
    model_placeholder_m50:'Gemini 2.5 Flash',
    model_placeholder_m198:'Gemini 2.5 Flash',
    model_google_gemini_internal_byom:'Gemini (Internal BYOM)',
    model_openai_gpt_oss_120b_medium:'GPT-OSS 120B (Medium)',
    'gemini-pro-orchestrator-g1-pro':'Orchestrator (Argon)',
  };
  function resolveQuotaModelToken(raw) {
    const trimmed=String(raw||'').trim();
    if(!trimmed)return '';
    const direct=quotaModelAliases[trimmed.toLowerCase()];
    const base=(direct||trimmed).replace(/^word\//i,'').trim();
    return quotaModelAliases[base.toLowerCase()]||base;
  }
  function quotaGroupKind(group) {
    const id=String(group?.id||''),resolvedId=resolveQuotaModelToken(id),resolvedName=resolveQuotaModelToken(group?.name||''),value=id+' '+resolvedId+' '+resolvedName;
    if(/(?:^|[^a-z])argon(?:$|[^a-z])/i.test(value))return 'gemini-argon';
    if(/gemini|hydrogen|carbon|neon|orchestrator/i.test(value))return 'gemini';
    if(/claude|sonnet|opus|haiku|anthropic|gpt|openai|perplexity|fable/i.test(value)||/(?:^|[^a-z0-9])o[134](?:$|[^a-z0-9])/i.test(value)||/^3p(?:$|[-_])/i.test(id))return '3p';
    return null;
  }
  function quotaGroupLabel(group) {
    if(!group)return '—';
    return ({'gemini-argon':'Gemini (Argon)',gemini:'Gemini','3p':'Claude'})[quotaGroupKind(group)]||group.name||group.id||t('group');
  }
  function chooseQuotaGroup(groups,models,selected) {
    const list=Array.isArray(groups)?groups.filter(g=>g&&typeof g.id==='string'):[];
    const manual=list.find(g=>g.id===selected);if(manual)return manual;
    const candidates=Array.isArray(models)?models:[models];
    const kind=candidates.map(model=>quotaGroupKind({name:typeof model==='string'?model:''})).find(Boolean);
    const specific=kind&&list.find(g=>quotaGroupKind(g)===kind);
    if(specific)return specific;
    // Ultra can expose Argon within the original shared Gemini bucket. Keep
    // that bucket's own name/windows; never relabel it as a separate Argon
    // allowance. Prefer a dedicated host-reported group whenever it exists.
    if(kind==='gemini-argon')return list.find(g=>g.id==='gemini'&&quotaGroupKind(g)==='gemini')||null;
    return kind?null:list[0]||null;
  }
  function quotaWindows(group){
    const windows=['5h','weekly'],present=windows.filter(key=>group?.windows?.[key]?.available===true);
    return present.length?present:windows;
  }
  function quotaRemaining(bucket){
    const value=bucket?.remaining;
    return bucket?.disabled===true||bucket?.available===false||typeof value!=='number'||!Number.isFinite(value)||value<0||value>1?null:value;
  }
  function shortEta(ms){
    if(typeof ms!=='number'||!Number.isFinite(ms)||ms<=0)return '—';
    const totalMin=Math.max(1,Math.round(ms/60000));
    if(totalMin<60)return `${totalMin}m`;
    if(totalMin<1440){const h=Math.floor(totalMin/60),m=totalMin%60;return `${h}h${m?` ${m}m`:''}`;}
    const totalH=Math.round(ms/3600000),d=Math.floor(totalH/24),h=totalH%24;
    return `${d}d${h?` ${h}h`:''}`;
  }
  function quotaForecast(bucket,windowKey,now=Date.now(),options={}){
    const remaining=quotaRemaining(bucket);
    if(remaining===null)return null;
    const used=Math.max(0,Math.min(1,1-remaining));
    const resetMs=Date.parse(bucket?.resetAt);
    const workHours=windowKey==='weekly'?normalizeDailyWorkHours(options?.dailyWorkHours):24;
    if(!Number.isFinite(resetMs)||resetMs<=now){
      return used===0?{remaining:1,used:0,timeRemaining:null,pace:'idle',paceDelta:0,forecastReady:false,warmingUp:false,projectedUsed:0,projectedRemaining:1,willExhaust:false,exhaustInMs:null,earlyByMs:null,outlook:'idle',dailyWorkHours:workHours}:null;
    }
    const durationMs=windowKey==='5h'?18000000:604800000;
    const leftMs=Math.max(0,Math.min(durationMs,resetMs-now)),elapsedMs=durationMs-leftMs;
    const timeRemaining=leftMs/durationMs;
    let effElapsedMs=elapsedMs,effLeftMs=leftMs;
    if(windowKey==='weekly'&&workHours<24){
      const dayMs=86400000,workDayMs=workHours*3600000;
      effElapsedMs=Math.floor(elapsedMs/dayMs)*workDayMs+Math.min(elapsedMs%dayMs,workDayMs);
      effLeftMs=leftMs*(workHours/24);
    }
    const effTotalMs=effElapsedMs+effLeftMs;
    const effTimeRemaining=effTotalMs>0?effLeftMs/effTotalMs:timeRemaining;
    const effElapsed=effTotalMs>0?effElapsedMs/effTotalMs:elapsedMs/durationMs;
    const paceDelta=remaining-effTimeRemaining;
    let pace=used<0.0005?'idle':paceDelta<-0.05?'fast':paceDelta>0.08?'slow':'steady';
    const minSampleMs=windowKey==='5h'?300000:3600000;
    let forecastReady=false,warmingUp=false,projectedUsed=null,projectedRemaining=null,willExhaust=false,exhaustInMs=null;
    if(used<0.0005){
      forecastReady=true;projectedUsed=0;projectedRemaining=1;
    }else if(elapsedMs<minSampleMs&&used<0.1){
      warmingUp=true;
    }else{
      const rawProjectedUsed=effElapsed>0?used/effElapsed:Infinity;
      projectedUsed=Math.min(1,rawProjectedUsed);
      projectedRemaining=Math.max(0,1-rawProjectedUsed);
      willExhaust=rawProjectedUsed>1.005;
      if(willExhaust&&used>0){
        const workExhaustMs=effElapsedMs*(remaining/used);
        const wallExhaustMs=workHours<24?workExhaustMs*(24/workHours):workExhaustMs;
        exhaustInMs=Math.min(leftMs,Math.max(60000,Math.round(wallExhaustMs)));
      }
      forecastReady=true;
      if(willExhaust)pace='fast';
    }
    // How far ahead of the reset the quota runs out; only meaningful when it does.
    const earlyByMs=willExhaust&&exhaustInMs!==null?Math.max(60000,leftMs-exhaustInMs):null;
    // The conclusion users act on: will this window last until it resets?
    const outlook=used<0.0005?'idle':!forecastReady?null:willExhaust?'exhaust':projectedRemaining<0.2?'tight':'ok';
    return {remaining,used,timeRemaining,pace,paceDelta,forecastReady,warmingUp,projectedUsed,projectedRemaining,willExhaust,exhaustInMs,earlyByMs,outlook,dailyWorkHours:workHours};
  }
  function groupQuotaPace(group,now=Date.now(),options={}){
    const items=quotaWindows(group).map(w=>({w,f:quotaForecast(group?.windows?.[w],w,now,options)})).filter(x=>x.f&&typeof x.f.timeRemaining==='number');
    if(!items.length)return null;
    if(items.every(x=>x.f.outlook==='idle'))return {pace:'idle',delta:0,window:items[0].w,critical:false,label:t('paceIdle'),title:t('paceIdle')};
    // Report the window most at risk of running out before it resets.
    const rank={exhaust:0,tight:1,ok:2};
    const ready=items.filter(x=>x.f.outlook in rank).sort((a,b)=>rank[a.f.outlook]-rank[b.f.outlook]||a.f.projectedRemaining-b.f.projectedRemaining);
    if(!ready.length)return null;
    const chosen=ready[0],f=chosen.f;
    const label=t(f.outlook==='exhaust'?'outlookExhaust':f.outlook==='tight'?'outlookTight':'outlookOk');
    const winLabel=t(chosen.w==='5h'?'five':quotaGroupKind(group)==='gemini-argon'?'argonWeek':'week');
    const critical=f.remaining<0.1||(f.willExhaust&&f.exhaustInMs!==null&&f.exhaustInMs<(chosen.w==='5h'?3600000:86400000));
    return {pace:f.outlook,delta:f.paceDelta,window:chosen.w,critical,label,title:`${winLabel} · ${label}`};
  }
  // Single-ring composer chip over the chosen group's 5h/weekly windows. Each
  // listed window is {present:true,remaining} with a 0-1 fraction or null when
  // the balance is unknown or the window is disabled; an unlisted window is
  // absent (null). Unknown never degrades to 0%: it renders the dashed ring
  // and an em-dash. 'mode' is the quotaDisplay preference: 'both' paints the
  // tighter known window, 'auto' defaults to 5h and flips once any known
  // window drops to ≤25%, 'compact' pins 5h and flags the other window with
  // a dot (warn ≤25%, danger ≤10%). Levels follow the same thresholds.
  function quotaRingView(group,mode='both'){
    const listed=quotaWindows(group);
    const read=w=>{
      if(!listed.includes(w))return null;
      const remaining=group?.windows?.[w]?.disabled===true?null:quotaRemaining(group?.windows?.[w]);
      return {present:true,remaining};
    };
    const five=read('5h'),week=read('weekly');
    const value=w=>w==='5h'?five?.remaining??null:week?.remaining??null;
    const fv=value('5h'),wv=value('weekly');
    const nums=[fv,wv].filter(v=>v!==null);
    const min=nums.length?Math.min(...nums):null;
    let show=null;
    if(mode==='compact')show=five?'5h':(week?'weekly':null);
    else if(mode==='weekly')show=week?'weekly':(five?'5h':null);
    else if(mode==='auto')show=min!==null&&min<=0.25?(fv===min?'5h':'weekly'):(five?'5h':(week?'weekly':null));
    else show=five&&fv!==null&&(!week||wv===null||fv<=wv)?'5h':(wv!==null?'weekly':(five?'5h':(week?'weekly':null)));
    const arcValue=show==='5h'?fv:show==='weekly'?wv:null;
    const level=arcValue===null?'unknown':arcValue<=0.10?'danger':arcValue<=0.25?'warn':'ok';
    let dot=null;
    if(mode==='compact'&&show){const other=show==='5h'?wv:fv;if(other!==null&&other<=0.25)dot=other<=0.10?'danger':'warn';}
    return {five,week,min,show,arcValue,level,dot};
  }
  return {mountLanguagePicker,normalizeSpeedStyle,connectSpeedStyle,normalizeUsageScope,connectUsageScope,normalizeQuotaDisplay,connectQuotaDisplay,normalizeDailyWorkHours,normalizeHostUiLocalization,connectHostUiLocalization,normalizeInlineCacheHit,connectInlineCacheHit,normalizeCacheChipMode,connectCacheChipMode,normalizeStripMode,connectStripMode,normalizeBarPlacement,connectBarPlacement,normalizeTurnFooter,connectTurnFooter,normalizeBarColors,connectBarColors,normalizeThemeMode,connectThemeMode,normalizeCacheHitTone,connectCacheHitTone,normalizeCacheHitTiers,connectCacheHitTiers,normalizeBarOrder,normalizeBarHidden,normalizeContextChipMode,connectBarPreferences,quotaRingView,minimalTrail,t,rateNote,quotaGroupKind,quotaGroupLabel,chooseQuotaGroup,quotaWindows,quotaRemaining,shortEta,quotaForecast,groupQuotaPace,countdown,elapsed,resetDate,errorMessage,connectPreferences,get language(){return language;},setLanguage(value){language=value==='zh-CN'||value==='zh-TW'?value:'en';if(language!=='en')lastZh=language;},toggle(){language=language==='en'?(lastZh||'zh-TW'):'en';return language;}};
};
