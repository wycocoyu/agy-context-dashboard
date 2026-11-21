import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAccountCredits,
  extractCreditUsageSummary,
  modelPricingRule,
  estimateTokenCost,
  estimateModelsCost,
  formatUsd,
} from '../pricing.mjs';

test('extractAccountCredits extracts GetUserStatus plan, tier and credit balances', () => {
  const res = extractAccountCredits({
    userStatus: {
      email: 'ignored@example.test',
      planStatus: {
        availablePromptCredits: 500,
        availableFlowCredits: 100,
        planInfo: {
          planName: 'Pro',
          teamsTier: 'TEAMS_TIER_PRO',
          monthlyPromptCredits: 50000,
          monthlyFlowCredits: 150000,
          monthlyFlexCreditPurchaseAmount: 25000,
          canBuyMoreCredits: true,
        },
      },
      userTier: {
        id: 'g1-ultra-tier',
        name: 'Google AI Ultra',
        availableCredits: [{ creditType: 'GOOGLE_ONE_AI', minimumCreditAmountForUsage: '50' }],
      },
      userUsedPromptCredits: '120',
      userUsedFlowCredits: 30,
    },
  });
  assert.equal(res.source, 'GetUserStatus');
  assert.equal(res.planName, 'Pro');
  assert.equal(res.tierId, 'g1-ultra-tier');
  assert.equal(res.tierName, 'Google AI Ultra');
  assert.equal(res.availablePromptCredits, 500);
  assert.equal(res.availableFlowCredits, 100);
  assert.equal(res.monthlyPromptCredits, 50000);
  assert.equal(res.monthlyFlowCredits, 150000);
  assert.equal(res.monthlyFlexCreditPurchaseAmount, 25000);
  assert.equal(res.usedPromptCredits, 120);
  assert.equal(res.usedFlowCredits, 30);
  assert.equal(res.canBuyMoreCredits, true);
  assert.deepEqual(res.tierCredits, [{ creditType: 'GOOGLE_ONE_AI', minimumCreditAmountForUsage: 50, creditAmount: null }]);
  assert.equal(extractAccountCredits(null), null);
  assert.equal(extractAccountCredits({}), null);
});

test('extractCreditUsageSummary aggregates consumed AI credits when present', () => {
  assert.equal(extractCreditUsageSummary(null), null);
  assert.equal(extractCreditUsageSummary({ consumedCredits: [] }), null);
  const summary = extractCreditUsageSummary({
    consumedCredits: [
      { firstStepIndex: 0, lastStepIndex: 2, credits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: '15' }] },
      { firstStepIndex: 3, lastStepIndex: 4, credits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: 25 }] },
    ],
  });
  assert.equal(summary.source, 'CreditUsageSummary');
  assert.deepEqual(summary.totals, { GOOGLE_ONE_AI: 40 });
  assert.equal(summary.entriesCount, 2);
});

test('model pricing table estimates known models and returns null for unknown/BYOM models', () => {
  assert.equal(modelPricingRule('Gemini 4 Neon (High)').key, 'gemini-pro');
  assert.equal(modelPricingRule('gemini-4-hydrogen-xhigh').key, 'gemini-flash');
  assert.equal(modelPricingRule('gemini-flash-worker-agy').key, 'gemini-flash');
  assert.equal(modelPricingRule('gemini-pro-orchestrator').key, 'gemini-pro');
  assert.equal(modelPricingRule('Claude Sonnet 4.6 (Thinking)').key, 'claude-sonnet');
  assert.equal(modelPricingRule('Claude Opus 4.6 (Thinking)').key, 'claude-opus');
  assert.equal(modelPricingRule('GPT-OSS 120B (Medium)'), null);
  assert.equal(modelPricingRule('Gemini (Internal BYOM)'), null);
  assert.equal(modelPricingRule('GPT-6.1 Sol'), null);
  assert.equal(modelPricingRule('Unknown'), null);

  const cost = estimateTokenCost('Claude Sonnet 4.6 (Thinking)', {
    uncached: 1_000_000,
    cacheRead: 1_000_000,
    cacheWrite: 0,
    output: 100_000,
  });
  assert.equal(cost.estimated, true);
  assert.ok(Math.abs(cost.totalUsd - (3.0 + 0.3 + 1.5)) < 1e-9);

  const agg = estimateModelsCost({
    'Gemini 4 Hydrogen (High)': { uncached: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 1_000_000 },
    'Unknown Model': { uncached: 500_000, cacheRead: 0, cacheWrite: 0, output: 500_000 },
  });
  assert.equal(agg.hasPriced, true);
  assert.equal(agg.complete, false);
  assert.equal(agg.pricedModels, 1);
  assert.equal(agg.unpricedModels, 1);
  assert.ok(Math.abs(agg.totalUsd - 0.75) < 1e-9);

  const none = estimateModelsCost({ 'Unknown Model': { uncached: 1000, output: 500 } });
  assert.equal(none.totalUsd, null);
  assert.equal(none.hasPriced, false);

  assert.equal(formatUsd(null), '—');
  assert.equal(formatUsd(0.004), '<$0.01');
  assert.equal(formatUsd(1.234), '$1.23');
  assert.equal(formatUsd(150.7), '$151');
});
