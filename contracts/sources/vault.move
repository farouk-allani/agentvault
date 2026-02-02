module agentvault::vault {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};

    use agentvault::events;

    // === Constants ===
    const ONE_DAY_MS: u64 = 86400000;
    const MIN_DAILY_LIMIT: u64 = 1_000_000;  // $1 in USDC (6 decimals)
    const MAX_DAILY_LIMIT: u64 = 1_000_000_000_000;  // $1M

    // === Errors ===
    const ENotOwner: u64 = 0;
    const ENotAgent: u64 = 1;
    const EExceedsDailyLimit: u64 = 2;
    const EExceedsPerTxLimit: u64 = 3;
    const EVaultPaused: u64 = 4;
    const EInsufficientBalance: u64 = 5;
    const EInvalidDailyLimit: u64 = 6;
    const EInvalidPerTxLimit: u64 = 7;
    const EZeroAmount: u64 = 8;
    const EBelowMinBalance: u64 = 9;

    // === Structs ===

    public struct VaultConstraints has store, copy, drop {
        daily_limit: u64,
        per_tx_limit: u64,
        alert_threshold: u64,
        yield_enabled: bool,
        min_balance: u64,
        paused: bool,
    }

    public struct Vault<phantom T> has key, store {
        id: UID,
        owner: address,
        agent: address,
        balance: Balance<T>,
        constraints: VaultConstraints,
        spent_today: u64,
        last_reset_timestamp: u64,
        total_spent: u64,
        tx_count: u64,
        yield_position_id: Option<ID>,
        yield_earned: u64,
    }

    // === Public Entry Functions ===

    /// Create a new vault
    public entry fun create_vault<T>(
        initial_deposit: Coin<T>,
        agent: address,
        daily_limit: u64,
        per_tx_limit: u64,
        alert_threshold: u64,
        yield_enabled: bool,
        min_balance: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(daily_limit >= MIN_DAILY_LIMIT && daily_limit <= MAX_DAILY_LIMIT, EInvalidDailyLimit);
        assert!(per_tx_limit > 0 && per_tx_limit <= daily_limit, EInvalidPerTxLimit);

        let owner = tx_context::sender(ctx);
        let balance_value = coin::value(&initial_deposit);

        let vault = Vault<T> {
            id: object::new(ctx),
            owner,
            agent,
            balance: coin::into_balance(initial_deposit),
            constraints: VaultConstraints {
                daily_limit,
                per_tx_limit,
                alert_threshold,
                yield_enabled,
                min_balance,
                paused: false,
            },
            spent_today: 0,
            last_reset_timestamp: clock::timestamp_ms(clock),
            total_spent: 0,
            tx_count: 0,
            yield_position_id: option::none(),
            yield_earned: 0,
        };

        let vault_id = object::id(&vault);

        events::emit_vault_created(
            vault_id, owner, agent, balance_value, daily_limit, per_tx_limit,
        );

        transfer::share_object(vault);
    }

    /// Agent executes a payment
    public entry fun execute_payment<T>(
        vault: &mut Vault<T>,
        recipient: address,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);

        // Validations
        assert!(sender == vault.agent, ENotAgent);
        assert!(!vault.constraints.paused, EVaultPaused);
        assert!(amount > 0, EZeroAmount);
        assert!(amount <= vault.constraints.per_tx_limit, EExceedsPerTxLimit);

        // Reset daily counter if needed
        maybe_reset_daily(vault, current_time);

        assert!(vault.spent_today + amount <= vault.constraints.daily_limit, EExceedsDailyLimit);
        assert!(balance::value(&vault.balance) >= amount, EInsufficientBalance);
        
        // Enforce min_balance constraint: vault must retain at least min_balance after payment
        let balance_after = balance::value(&vault.balance) - amount;
        assert!(balance_after >= vault.constraints.min_balance, EBelowMinBalance);

        // Execute payment
        let payment = coin::take(&mut vault.balance, amount, ctx);
        transfer::public_transfer(payment, recipient);

        // Update tracking
        vault.spent_today = vault.spent_today + amount;
        vault.total_spent = vault.total_spent + amount;
        vault.tx_count = vault.tx_count + 1;

        let remaining = vault.constraints.daily_limit - vault.spent_today;

        events::emit_payment_executed(
            object::id(vault), sender, recipient, amount,
            vault.spent_today, remaining, vault.tx_count, current_time,
        );

        // Alert check
        if (vault.spent_today >= vault.constraints.alert_threshold) {
            events::emit_alert_triggered(
                object::id(vault), vault.owner,
                vault.spent_today, vault.constraints.alert_threshold,
            );
        }
        
        // Yield routing: if yield_enabled is true, a portion could be routed to yield
        // TODO: In production, implement yield provider integration here
        // For now, we emit an event if yield is enabled for tracking purposes
        if (vault.constraints.yield_enabled && vault.yield_position_id.is_some()) {
            // Future: route a percentage to yield provider
            // Currently tracked via yield_position_id and yield_earned fields
        }
    }

    /// Owner deposits more funds
    public entry fun deposit<T>(
        vault: &mut Vault<T>,
        deposit: Coin<T>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let amount = coin::value(&deposit);
        balance::join(&mut vault.balance, coin::into_balance(deposit));

        events::emit_funds_deposited(
            object::id(vault), sender, amount, balance::value(&vault.balance),
        );
    }

    /// Owner withdraws funds
    public entry fun withdraw<T>(
        vault: &mut Vault<T>,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == vault.owner, ENotOwner);
        assert!(balance::value(&vault.balance) >= amount, EInsufficientBalance);

        let withdrawn = coin::take(&mut vault.balance, amount, ctx);
        transfer::public_transfer(withdrawn, sender);

        events::emit_funds_withdrawn(
            object::id(vault), sender, amount, balance::value(&vault.balance),
        );
    }

    /// Owner updates constraints
    public entry fun update_constraints<T>(
        vault: &mut Vault<T>,
        daily_limit: u64,
        per_tx_limit: u64,
        alert_threshold: u64,
        yield_enabled: bool,
        min_balance: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == vault.owner, ENotOwner);
        assert!(daily_limit >= MIN_DAILY_LIMIT && daily_limit <= MAX_DAILY_LIMIT, EInvalidDailyLimit);
        assert!(per_tx_limit > 0 && per_tx_limit <= daily_limit, EInvalidPerTxLimit);

        vault.constraints.daily_limit = daily_limit;
        vault.constraints.per_tx_limit = per_tx_limit;
        vault.constraints.alert_threshold = alert_threshold;
        vault.constraints.yield_enabled = yield_enabled;
        vault.constraints.min_balance = min_balance;

        events::emit_constraints_updated(
            object::id(vault), sender, daily_limit, per_tx_limit, alert_threshold,
        );
    }

    /// Owner pauses/unpauses vault
    public entry fun set_paused<T>(
        vault: &mut Vault<T>,
        paused: bool,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == vault.owner, ENotOwner);
        vault.constraints.paused = paused;
        events::emit_vault_paused(object::id(vault), sender, paused);
    }

    /// Owner changes agent
    public entry fun set_agent<T>(
        vault: &mut Vault<T>,
        new_agent: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == vault.owner, ENotOwner);
        vault.agent = new_agent;
    }

    // === View Functions ===

    public fun get_balance<T>(vault: &Vault<T>): u64 {
        balance::value(&vault.balance)
    }

    public fun get_owner<T>(vault: &Vault<T>): address { vault.owner }
    public fun get_agent<T>(vault: &Vault<T>): address { vault.agent }
    public fun get_spent_today<T>(vault: &Vault<T>): u64 { vault.spent_today }
    public fun get_daily_limit<T>(vault: &Vault<T>): u64 { vault.constraints.daily_limit }
    public fun get_per_tx_limit<T>(vault: &Vault<T>): u64 { vault.constraints.per_tx_limit }
    public fun is_paused<T>(vault: &Vault<T>): bool { vault.constraints.paused }
    public fun get_tx_count<T>(vault: &Vault<T>): u64 { vault.tx_count }
    public fun get_total_spent<T>(vault: &Vault<T>): u64 { vault.total_spent }

    public fun get_remaining_daily<T>(vault: &Vault<T>): u64 {
        if (vault.spent_today >= vault.constraints.daily_limit) { 0 }
        else { vault.constraints.daily_limit - vault.spent_today }
    }

    // === Internal Functions ===

    fun maybe_reset_daily<T>(vault: &mut Vault<T>, current_time: u64) {
        if (current_time - vault.last_reset_timestamp >= ONE_DAY_MS) {
            vault.spent_today = 0;
            vault.last_reset_timestamp = current_time;
        }
    }
}
