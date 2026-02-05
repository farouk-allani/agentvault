/**
 * Intent Parser Service
 * Parses natural language intents for vault constraints
 * Supports spending, trading, and swap intents
 */

export interface ParsedIntent {
  dailyLimit?: number;
  perTxLimit?: number;
  alertThreshold?: number;
  minBalance?: number;
  yieldEnabled?: boolean;
  action?: 'spend' | 'trade' | 'swap' | 'buy' | 'sell';
  rawText: string;
  confidence: number;
}

// Amount patterns - matches various currency/amount formats
const AMOUNT_PATTERNS = [
  /\$?([\d,]+(?:\.\d{2})?)\s*(?:USD|USDC|SUI)?/i,
  /([\d,]+(?:\.\d{2})?)\s*(?:dollars?|bucks?)/i,
  /([\d,]+)\s*(?:tokens?|coins?)/i,
];

// Daily limit patterns
const DAILY_LIMIT_PATTERNS = [
  /(?:spend|trade|swap|buy|sell)\s*(?:up\s*to\s*)?\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s*day|daily|\/day|a\s*day)/i,
  /daily\s*(?:limit|max|maximum)\s*(?:of\s*)?\$?([\d,]+(?:\.\d{2})?)/i,
  /\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s*day|daily|\/day)\s*(?:limit|max)?/i,
  /limit\s*(?:my\s*)?(?:spending|trading|swaps?)\s*to\s*\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s*day|daily)?/i,
];

// Per-transaction limit patterns
const PER_TX_PATTERNS = [
  /(?:max|maximum)\s*(?:of\s*)?\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s*(?:tx|transaction|trade|swap))/i,
  /\$?([\d,]+(?:\.\d{2})?)\s*(?:per\s*(?:tx|transaction|trade|swap))/i,
  /(?:transaction|tx|trade|swap)\s*limit\s*(?:of\s*)?\$?([\d,]+(?:\.\d{2})?)/i,
  /no\s*(?:single\s*)?(?:tx|transaction|trade|swap)\s*(?:over|above|more\s*than)\s*\$?([\d,]+(?:\.\d{2})?)/i,
];

// Alert threshold patterns
const ALERT_PATTERNS = [
  /alert\s*(?:me\s*)?(?:at|when|if)\s*(?:spending|usage)?\s*(?:reaches?|exceeds?|hits?|over)?\s*\$?([\d,]+(?:\.\d{2})?)/i,
  /notify\s*(?:me\s*)?(?:at|when)\s*\$?([\d,]+(?:\.\d{2})?)/i,
  /\$?([\d,]+(?:\.\d{2})?)\s*(?:alert|notification)\s*(?:threshold)?/i,
  /warn\s*(?:me\s*)?(?:at|when|if)\s*\$?([\d,]+(?:\.\d{2})?)/i,
];

// Min balance patterns
const MIN_BALANCE_PATTERNS = [
  /(?:keep|maintain|reserve)\s*(?:at\s*least\s*)?\$?([\d,]+(?:\.\d{2})?)\s*(?:minimum|min)?/i,
  /(?:minimum|min)\s*balance\s*(?:of\s*)?\$?([\d,]+(?:\.\d{2})?)/i,
  /(?:don't|do\s*not|never)\s*go\s*below\s*\$?([\d,]+(?:\.\d{2})?)/i,
  /floor\s*(?:of\s*)?\$?([\d,]+(?:\.\d{2})?)/i,
];

// Action patterns - detect trading-related intents
const ACTION_PATTERNS = {
  trade: /\b(?:trade|trading)\b/i,
  swap: /\b(?:swap|swapping)\b/i,
  buy: /\b(?:buy|buying|purchase)\b/i,
  sell: /\b(?:sell|selling)\b/i,
  spend: /\b(?:spend|spending|pay|payment)\b/i,
};

// Yield preference patterns
const YIELD_PATTERNS = {
  enable: /(?:enable|turn\s*on|activate|yes)\s*(?:to\s*)?(?:yield|earning|interest)/i,
  disable: /(?:disable|turn\s*off|deactivate|no)\s*(?:to\s*)?(?:yield|earning|interest)/i,
};

/**
 * Parse a number string, handling commas and optional decimals
 * Note: On Sui testnet, most tokens (including many USDC variants) use 9 decimals like native SUI.
 * This is different from mainnet USDC which typically uses 6 decimals.
 */
function parseAmount(amountStr: string, decimals: number = 9): number {
  const cleaned = amountStr.replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  // Convert to base units using specified decimals (default 9 for Sui testnet)
  return Math.floor(parsed * Math.pow(10, decimals));
}

/**
 * Extract the first matching amount from a pattern array
 */
function extractAmount(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return parseAmount(match[1]);
    }
  }
  return undefined;
}

/**
 * Detect the primary action type from the intent
 */
function detectAction(text: string): ParsedIntent['action'] | undefined {
  for (const [action, pattern] of Object.entries(ACTION_PATTERNS)) {
    if (pattern.test(text)) {
      return action as ParsedIntent['action'];
    }
  }
  return undefined;
}

/**
 * Detect yield preference
 */
function detectYieldPreference(text: string): boolean | undefined {
  if (YIELD_PATTERNS.enable.test(text)) return true;
  if (YIELD_PATTERNS.disable.test(text)) return false;
  return undefined;
}

/**
 * Calculate confidence score based on how many fields were extracted
 */
function calculateConfidence(intent: Partial<ParsedIntent>): number {
  const fields = ['dailyLimit', 'perTxLimit', 'alertThreshold', 'minBalance', 'action'];
  const foundFields = fields.filter(
    (f) => intent[f as keyof ParsedIntent] !== undefined
  );

  // Base confidence on percentage of fields found
  let confidence = foundFields.length / fields.length;

  // Boost confidence if we found a daily limit (most important field)
  if (intent.dailyLimit !== undefined) {
    confidence = Math.min(1, confidence + 0.2);
  }

  return Math.round(confidence * 100) / 100;
}

/**
 * Parse a natural language intent string into structured vault constraints
 *
 * Examples:
 * - "Spend up to $100 per day"
 * - "Trade $50/day with max $25 per transaction"
 * - "Swap up to $200 daily, alert me at $150"
 * - "Buy up to $100/day, keep $50 minimum"
 */
export function parseIntent(text: string): ParsedIntent {
  const normalizedText = text.toLowerCase().trim();

  const intent: ParsedIntent = {
    rawText: text,
    confidence: 0,
  };

  // Extract daily limit (works for spend, trade, swap, buy, sell)
  intent.dailyLimit = extractAmount(normalizedText, DAILY_LIMIT_PATTERNS);

  // Extract per-transaction limit
  intent.perTxLimit = extractAmount(normalizedText, PER_TX_PATTERNS);

  // Extract alert threshold
  intent.alertThreshold = extractAmount(normalizedText, ALERT_PATTERNS);

  // Extract minimum balance
  intent.minBalance = extractAmount(normalizedText, MIN_BALANCE_PATTERNS);

  // Detect action type
  intent.action = detectAction(normalizedText);

  // Detect yield preference
  intent.yieldEnabled = detectYieldPreference(normalizedText);

  // Set defaults based on daily limit if per-tx not specified
  if (intent.dailyLimit && !intent.perTxLimit) {
    // Default per-tx limit to 50% of daily limit
    intent.perTxLimit = Math.floor(intent.dailyLimit / 2);
  }

  // Set default alert threshold if not specified
  if (intent.dailyLimit && !intent.alertThreshold) {
    // Default alert at 80% of daily limit
    intent.alertThreshold = Math.floor(intent.dailyLimit * 0.8);
  }

  // Calculate confidence
  intent.confidence = calculateConfidence(intent);

  return intent;
}

/**
 * Validate parsed intent against minimum requirements
 * Uses 9 decimals to match Sui testnet token precision
 */
export function validateIntent(intent: ParsedIntent, decimals: number = 9): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const oneUnit = Math.pow(10, decimals); // 1 token in base units

  if (intent.dailyLimit === undefined) {
    errors.push('Could not determine daily limit from intent');
  } else {
    // Check minimum daily limit ($1)
    if (intent.dailyLimit < oneUnit) {
      errors.push('Daily limit must be at least $1');
    }
    // Check maximum daily limit ($1M)
    if (intent.dailyLimit > oneUnit * 1_000_000) {
      errors.push('Daily limit cannot exceed $1,000,000');
    }
  }

  if (intent.perTxLimit !== undefined && intent.dailyLimit !== undefined) {
    if (intent.perTxLimit > intent.dailyLimit) {
      errors.push('Per-transaction limit cannot exceed daily limit');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format a parsed intent back to human-readable form for confirmation
 * Uses 9 decimals to match Sui testnet token precision
 */
export function formatIntent(intent: ParsedIntent, decimals: number = 9): string {
  const parts: string[] = [];
  const divisor = Math.pow(10, decimals);

  if (intent.action) {
    parts.push(`Action: ${intent.action}`);
  }

  if (intent.dailyLimit !== undefined) {
    const amount = intent.dailyLimit / divisor;
    parts.push(`Daily limit: $${amount.toFixed(2)}`);
  }

  if (intent.perTxLimit !== undefined) {
    const amount = intent.perTxLimit / divisor;
    parts.push(`Per-transaction limit: $${amount.toFixed(2)}`);
  }

  if (intent.alertThreshold !== undefined) {
    const amount = intent.alertThreshold / divisor;
    parts.push(`Alert threshold: $${amount.toFixed(2)}`);
  }

  if (intent.minBalance !== undefined) {
    const amount = intent.minBalance / divisor;
    parts.push(`Minimum balance: $${amount.toFixed(2)}`);
  }

  if (intent.yieldEnabled !== undefined) {
    parts.push(`Yield: ${intent.yieldEnabled ? 'enabled' : 'disabled'}`);
  }

  parts.push(`Confidence: ${Math.round(intent.confidence * 100)}%`);

  return parts.join('\n');
}
